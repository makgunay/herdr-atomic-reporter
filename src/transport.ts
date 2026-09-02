import net from "node:net";
import path from "node:path";
import type { PublishedReport } from "./reducer";

export interface Identity {
  source: "herdr:atomic" | "herdr:pi";
  agent: "atomic" | "pi";
}

export type SessionRef =
  | { agent_session_path: string }
  | { agent_session_id: string };

interface Request {
  id: string;
  method: "pane.report_agent" | "pane.report_agent_session" | "pane.release_agent";
  params: Record<string, unknown>;
}

export function identityFromEnv(env: Record<string, string | undefined>): Identity {
  return env.HERDR_ATOMIC_REPORT_AS_PI === "1"
    ? { source: "herdr:pi", agent: "pi" }
    : { source: "herdr:atomic", agent: "atomic" };
}

export function sessionRefFromContext(ctx: any): SessionRef | undefined {
  const file = ctx?.sessionManager?.getSessionFile?.();
  if (typeof file === "string" && path.isAbsolute(file)) {
    return { agent_session_path: file };
  }
  const id = ctx?.sessionManager?.getSessionId?.();
  if (typeof id === "string" && id.length > 0) {
    return { agent_session_id: id };
  }
  return undefined;
}

export function createTransport(env: Record<string, string | undefined> = process.env) {
  const socketPath = env.HERDR_SOCKET_PATH;
  const paneId = env.HERDR_PANE_ID;
  const enabled = env.HERDR_ENV === "1" && !!socketPath && !!paneId;
  const socketEndpoint = process.platform === "win32" && socketPath
    ? `\\\\.\\pipe\\${socketPath}`
    : socketPath;
  const identity = identityFromEnv(env);
  let requestId = 0;
  let tail = Promise.resolve();

  function sendAttempt(request: Request, timeoutMs: number): Promise<boolean> {
    if (!enabled || !socketEndpoint) return Promise.resolve(true);
    return new Promise((resolve) => {
      let done = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const socket = net.createConnection(socketEndpoint);
      const finish = (delivered: boolean) => {
        if (done) return;
        done = true;
        if (timeout) clearTimeout(timeout);
        socket.destroy();
        resolve(delivered);
      };
      socket.on("error", () => finish(false));
      socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
      socket.on("data", () => finish(true));
      socket.on("end", () => finish(false));
      timeout = setTimeout(() => finish(false), timeoutMs);
      timeout.unref?.();
    });
  }

  async function send(request: Request): Promise<void> {
    if (await sendAttempt(request, 500)) return;
    await sendAttempt(request, 1_500);
  }

  function enqueue(method: Request["method"], params: Record<string, unknown>): void {
    const request: Request = {
      id: `herdr-atomic-${++requestId}`,
      method,
      params,
    };
    // One promise chain is the sole writer, preserving strict sequence order.
    tail = tail.then(() => send(request));
  }

  return {
    enabled,
    identity,
    reportState(report: PublishedReport, sessionRef?: SessionRef) {
      enqueue("pane.report_agent", {
        pane_id: paneId,
        ...identity,
        state: report.state,
        ...(report.message === undefined ? {} : { message: report.message }),
        seq: report.seq,
        ...(sessionRef ?? {}),
      });
    },
    reportSession(sessionRef?: SessionRef) {
      if (!sessionRef) return;
      enqueue("pane.report_agent_session", {
        pane_id: paneId,
        ...identity,
        ...sessionRef,
      });
    },
    release(seq: number) {
      enqueue("pane.release_agent", {
        pane_id: paneId,
        ...identity,
        seq,
      });
    },
    drain: () => tail,
  };
}

export type HerdrTransport = ReturnType<typeof createTransport>;

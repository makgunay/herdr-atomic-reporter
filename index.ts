import {
  sessionScopedExtensionState,
  type ExtensionAPI,
} from "@bastani/atomic";
import { createReducer, initialReducerState } from "./src/reducer";
import {
  createTransport,
  sessionRefFromContext,
  type SessionRef,
} from "./src/transport";

const STATE_KEY = "herdr-atomic-reporter:lifecycle:v1";

// Covers the transport's 500 ms attempt plus 1500 ms retry, with a small
// scheduling allowance, while ensuring an unavailable socket cannot block exit.
const SHUTDOWN_DRAIN_TIMEOUT_MS = 2_100;

function drainForShutdown(drain: Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, SHUTDOWN_DRAIN_TIMEOUT_MS);
    void drain.then(
      () => {
        clearTimeout(timeout);
        resolve();
      },
      () => {
        clearTimeout(timeout);
        resolve();
      },
    );
  });
}

interface ReporterState {
  reducer: ReturnType<typeof initialReducerState>;
  sessionRef?: SessionRef;
  lastSessionRef?: string;
}

export function isRootSessionMode(
  mode: unknown,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return mode === "tui" ||
    (mode === "rpc" && env.HERDR_ATOMIC_TEST_ALLOW_RPC_ROOT === "1");
}

export default function herdrAtomicReporter(pi: ExtensionAPI): void {
  const transport = createTransport(process.env);
  if (!transport.enabled) return;

  const state = sessionScopedExtensionState<ReporterState>(
    pi.events,
    STATE_KEY,
    () => ({ reducer: initialReducerState() }),
  );
  const reducer = createReducer(state.reducer);
  let rootSession = false;

  function publish(event: Parameters<typeof reducer.dispatch>[0]): void {
    const report = reducer.dispatch(event);
    if (report) transport.reportState(report, state.sessionRef);
  }

  function updateSession(ctx: unknown): void {
    const ref = sessionRefFromContext(ctx);
    state.sessionRef = ref;
    if (!ref) return;
    const signature = JSON.stringify(ref);
    if (signature === state.lastSessionRef) return;
    state.lastSessionRef = signature;
    transport.reportSession(ref);
  }

  pi.on("session_start", (_event, ctx) => {
    if (!isRootSessionMode(ctx?.mode)) return;
    rootSession = true;
    updateSession(ctx);
    publish(ctx?.isIdle?.() === false
      ? { type: "agent-start" }
      : { type: "agent-settled" });
  });

  pi.on("agent_start", (_event, ctx) => {
    if (!rootSession) return;
    updateSession(ctx);
    publish({ type: "agent-start" });
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (!rootSession || ctx?.isIdle?.() !== true) return;
    publish({ type: "agent-settled" });
  });

  pi.on("ui_prompt_start", (event) => {
    if (!rootSession) return;
    publish({ type: "prompt-start", kind: event?.kind, title: event?.title });
  });

  pi.on("ui_prompt_end", () => {
    if (!rootSession) return;
    publish({ type: "prompt-end" });
  });

  pi.on("session_shutdown", (event) => {
    if (!rootSession) return;
    rootSession = false;
    if (event?.reason === "quit") transport.release(reducer.nextSeq());
    return drainForShutdown(transport.drain());
  });
}

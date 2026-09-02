import { afterEach, describe, expect, test } from "bun:test";
import { createEventBus, type ExtensionAPI } from "@bastani/atomic";
import extension, { isRootSessionMode } from "../index";
import { createFakeSocket, safeHerdrEnv, type FakeSocket } from "./fake-socket";

let socket: FakeSocket | undefined;
let restoreEnv: (() => void) | undefined;
afterEach(async () => {
  restoreEnv?.(); restoreEnv = undefined;
  await socket?.close(); socket = undefined;
});

function useEnv(env: NodeJS.ProcessEnv) {
  const previous = { ...process.env };
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
  return () => {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, previous);
  };
}
function harness() {
  const events = createEventBus();
  const handlers = new Map<string, Array<(...args: any[]) => any>>();
  const pi = {
    events,
    on(name: string, handler: (...args: any[]) => any) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
  } as unknown as ExtensionAPI;
  return {
    pi,
    async emit(name: string, event: any, ctx: any) {
      for (const handler of handlers.get(name) ?? []) await handler(event, ctx);
    },
  };
}

const context = {
  mode: "tui",
  isIdle: () => true,
  sessionManager: {
    getSessionFile: () => "/tmp/atomic-session.jsonl",
    getSessionId: () => "session-id",
  },
};

describe("extension event wiring", () => {
  test("reports a real prompt title as blocked, then recovers", async () => {
    socket = await createFakeSocket();
    restoreEnv = useEnv(safeHerdrEnv(socket.path));
    const { emit, pi } = harness();
    extension(pi);
    await emit("session_start", { reason: "startup" }, context);
    await emit("ui_prompt_start", { reason: "ui_prompt", kind: "confirm", title: "Trust this project?" }, context);
    await emit("ui_prompt_end", { reason: "ui_prompt", kind: "confirm", title: "Trust this project?" }, context);
    await socket.waitFor(4);
    expect(socket.requests.map((request) => request.method)).toEqual([
      "pane.report_agent_session",
      "pane.report_agent",
      "pane.report_agent",
      "pane.report_agent",
    ]);
    expect(socket.requests.slice(1).map((request) => ({ state: request.params.state, message: request.params.message }))).toEqual([
      { state: "idle", message: undefined },
      { state: "blocked", message: "Trust this project?" },
      { state: "idle", message: undefined },
    ]);
  });

  test("quit shutdown resolves only after the release is delivered", async () => {
    socket = await createFakeSocket();
    restoreEnv = useEnv(safeHerdrEnv(socket.path));
    const { emit, pi } = harness();
    extension(pi);
    await emit("session_start", { reason: "startup" }, context);
    await emit("session_shutdown", { reason: "quit" }, context);

    const stateReport = socket.requests.find((request) => request.method === "pane.report_agent");
    expect(socket.requests.at(-1)).toEqual({
      id: "herdr-atomic-3",
      method: "pane.release_agent",
      params: {
        pane_id: "test:pane",
        source: "herdr:atomic",
        agent: "atomic",
        seq: stateReport.params.seq + 1,
      },
    });
  });

  test("non-quit shutdown drains pending reports without releasing", async () => {
    socket = await createFakeSocket();
    restoreEnv = useEnv(safeHerdrEnv(socket.path));
    const { emit, pi } = harness();
    extension(pi);
    await emit("session_start", { reason: "startup" }, context);
    await emit("session_shutdown", { reason: "reload" }, context);

    expect(socket.requests.map((request) => request.method)).toEqual([
      "pane.report_agent_session",
      "pane.report_agent",
    ]);
  });

  test("shutdown wait is bounded when the socket never acknowledges", async () => {
    socket = await createFakeSocket({ respond: false });
    restoreEnv = useEnv(safeHerdrEnv(socket.path));
    const { emit, pi } = harness();
    extension(pi);
    await emit("session_start", { reason: "startup" }, context);

    const startedAt = Date.now();
    await emit("session_shutdown", { reason: "quit" }, context);
    expect(Date.now() - startedAt).toBeLessThan(2_500);
  }, 10_000);

  test("production root is TUI-only and RPC requires the explicit test opt-in", () => {
    expect(isRootSessionMode("tui", {})).toBeTrue();
    expect(isRootSessionMode("rpc", {})).toBeFalse();
    expect(isRootSessionMode("rpc", { HERDR_ATOMIC_TEST_ALLOW_RPC_ROOT: "1" })).toBeTrue();
    expect(isRootSessionMode("json", { HERDR_ATOMIC_TEST_ALLOW_RPC_ROOT: "1" })).toBeFalse();
  });
});

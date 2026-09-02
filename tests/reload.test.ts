import { afterEach, expect, test } from "bun:test";
import { createEventBus, sessionScopedExtensionState, type ExtensionAPI } from "@bastani/atomic";
import extension from "../index";
import { createFakeSocket, safeHerdrEnv, type FakeSocket } from "./fake-socket";

let socket: FakeSocket | undefined;
const original = { ...process.env };
afterEach(async () => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, original);
  await socket?.close(); socket = undefined;
});

function load(events: ReturnType<typeof createEventBus>) {
  const handlers = new Map<string, Array<(...args: any[]) => any>>();
  const pi = {
    events,
    on(name: string, handler: (...args: any[]) => any) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
  } as unknown as ExtensionAPI;
  extension(pi);
  return async (name: string, event: any, ctx: any) => {
    for (const handler of handlers.get(name) ?? []) await handler(event, ctx);
  };
}

const context = {
  mode: "tui",
  isIdle: () => true,
  sessionManager: {
    getSessionFile: () => "/tmp/reload-session.jsonl",
    getSessionId: () => "reload-id",
  },
};

test("session-scoped state survives re-evaluation without a duplicate or lost state", async () => {
  socket = await createFakeSocket();
  Object.assign(process.env, safeHerdrEnv(socket.path));
  const events = createEventBus();

  const first = sessionScopedExtensionState(events, "probe:v1", () => ({ marker: Symbol("same") }));
  const second = sessionScopedExtensionState(events, "probe:v1", () => ({ marker: Symbol("different") }));
  expect(second).toBe(first);

  let emit = load(events);
  await emit("session_start", { reason: "startup" }, context);
  await socket.waitFor(2);
  const idleSeq = socket.requests.find((request) => request.params.state === "idle").params.seq;

  // Re-evaluation creates new handlers over the same canonical session bus.
  emit = load(events);
  await emit("session_start", { reason: "reload" }, context);
  await Bun.sleep(50);
  expect(socket.requests).toHaveLength(2);

  await emit("agent_start", {}, { ...context, isIdle: () => false });
  await socket.waitFor(3);
  expect(socket.requests[2].params.state).toBe("working");
  expect(socket.requests[2].params.seq).toBe(idleSeq + 1);
});

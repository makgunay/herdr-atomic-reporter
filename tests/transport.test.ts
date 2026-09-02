import { afterEach, describe, expect, test } from "bun:test";
import { createTransport, identityFromEnv, sessionRefFromContext } from "../src/transport";
import { createFakeSocket, safeHerdrEnv, type FakeSocket } from "./fake-socket";

let socket: FakeSocket | undefined;
afterEach(async () => { await socket?.close(); socket = undefined; });

describe("Herdr transport", () => {
  test("sends exact state, session, and release request shapes in order", async () => {
    socket = await createFakeSocket();
    const transport = createTransport(safeHerdrEnv(socket.path));
    const ref = { agent_session_path: "/tmp/session.jsonl" } as const;
    transport.reportSession(ref);
    transport.reportState({ state: "working", seq: 101 }, ref);
    transport.release(102);
    await transport.drain();
    expect(socket.requests.map(({ method, params }) => ({ method, params }))).toEqual([
      { method: "pane.report_agent_session", params: { pane_id: "test:pane", source: "herdr:atomic", agent: "atomic", ...ref } },
      { method: "pane.report_agent", params: { pane_id: "test:pane", source: "herdr:atomic", agent: "atomic", state: "working", seq: 101, ...ref } },
      { method: "pane.release_agent", params: { pane_id: "test:pane", source: "herdr:atomic", agent: "atomic", seq: 102 } },
    ]);
  });

  test("Tier B identity is opt-in and exact", () => {
    expect(identityFromEnv({})).toEqual({ source: "herdr:atomic", agent: "atomic" });
    expect(identityFromEnv({ HERDR_ATOMIC_REPORT_AS_PI: "1" })).toEqual({ source: "herdr:pi", agent: "pi" });
    expect(identityFromEnv({ HERDR_ATOMIC_REPORT_AS_PI: "true" })).toEqual({ source: "herdr:atomic", agent: "atomic" });
  });

  test("prefers an absolute path, otherwise preserves a non-empty id", () => {
    expect(sessionRefFromContext({ sessionManager: { getSessionFile: () => "/raw/path", getSessionId: () => "id" } })).toEqual({ agent_session_path: "/raw/path" });
    expect(sessionRefFromContext({ sessionManager: { getSessionFile: () => "relative", getSessionId: () => " raw-id " } })).toEqual({ agent_session_id: " raw-id " });
    expect(sessionRefFromContext({ sessionManager: { getSessionFile: () => "relative", getSessionId: () => "" } })).toBeUndefined();
  });

  test("disabled transport makes no connection", async () => {
    socket = await createFakeSocket();
    const transport = createTransport({ ...safeHerdrEnv(socket.path), HERDR_ENV: "0" });
    transport.reportState({ state: "idle", seq: 1 });
    await transport.drain();
    expect(socket.requests).toEqual([]);
  });
});

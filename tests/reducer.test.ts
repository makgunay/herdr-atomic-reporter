import { describe, expect, test } from "bun:test";
import { createReducer, type ReducerState } from "../src/reducer";

function state(overrides: Partial<ReducerState> = {}): ReducerState {
  return {
    agentActive: false,
    prompts: [],
    seq: 1_000,
    ...overrides,
  };
}

describe("lifecycle reducer", () => {
  test("publishes idle, then working, and suppresses unchanged heartbeats", () => {
    const reducer = createReducer(state());
    expect(reducer.dispatch({ type: "sync" })).toEqual({ state: "idle", seq: 1_001 });
    expect(reducer.dispatch({ type: "agent-start" })).toEqual({ state: "working", seq: 1_002 });
    expect(reducer.dispatch({ type: "agent-start" })).toBeNull();
    expect(reducer.dispatch({ type: "agent-settled" })).toEqual({ state: "idle", seq: 1_003 });
    expect(reducer.dispatch({ type: "agent-settled" })).toBeNull();
  });

  test("blocked takes precedence and recovers to the prior working state", () => {
    const reducer = createReducer(state({ agentActive: true }));
    reducer.dispatch({ type: "sync" });
    expect(reducer.dispatch({ type: "prompt-start", title: "Approve deployment?", kind: "confirm" })).toEqual({
      state: "blocked",
      message: "Approve deployment?",
      seq: 1_002,
    });
    expect(reducer.dispatch({ type: "agent-settled" })).toBeNull();
    expect(reducer.dispatch({ type: "prompt-end" })).toEqual({ state: "idle", seq: 1_003 });
  });

  test("defensively refcounts duplicate spans and never goes negative", () => {
    const reducer = createReducer(state());
    reducer.dispatch({ type: "sync" });
    reducer.dispatch({ type: "prompt-start", title: "First", kind: "input" });
    expect(reducer.dispatch({ type: "prompt-start", title: "Second", kind: "select" })).toEqual({
      state: "blocked",
      message: "Second",
      seq: 1_003,
    });
    expect(reducer.dispatch({ type: "prompt-end" })).toEqual({ state: "blocked", message: "First", seq: 1_004 });
    expect(reducer.dispatch({ type: "prompt-end" })).toEqual({ state: "idle", seq: 1_005 });
    expect(reducer.dispatch({ type: "prompt-end" })).toBeNull();
    expect(reducer.snapshot().prompts).toEqual([]);
  });

  test("uses a generic label only when title is absent and preserves empty titles", () => {
    const absent = createReducer(state());
    expect(absent.dispatch({ type: "prompt-start", kind: "custom" })).toEqual({
      state: "blocked",
      message: "Waiting for input",
      seq: 1_001,
    });
    const empty = createReducer(state());
    expect(empty.dispatch({ type: "prompt-start", title: "", kind: "input" })).toEqual({
      state: "blocked",
      message: "",
      seq: 1_001,
    });
  });
});

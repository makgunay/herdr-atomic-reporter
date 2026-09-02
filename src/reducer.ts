export type AgentState = "blocked" | "working" | "idle";

export interface PublishedReport {
  state: AgentState;
  message?: string;
  seq: number;
}

export interface ActivePrompt {
  kind?: string;
  title?: string;
}

export interface ReducerState {
  agentActive: boolean;
  prompts: ActivePrompt[];
  seq: number;
  lastPublished?: { state: AgentState; message?: string };
}

export type ReducerEvent =
  | { type: "sync" }
  | { type: "agent-start" }
  | { type: "agent-settled" }
  | { type: "prompt-start"; kind?: string; title?: string }
  | { type: "prompt-end" };

export function initialReducerState(now = Date.now()): ReducerState {
  return { agentActive: false, prompts: [], seq: now * 1_000 };
}

export function createReducer(state: ReducerState) {
  function current(): Omit<PublishedReport, "seq"> {
    const prompt = state.prompts.at(-1);
    if (prompt) {
      return {
        state: "blocked",
        message: prompt.title === undefined ? "Waiting for input" : prompt.title,
      };
    }
    return { state: state.agentActive ? "working" : "idle" };
  }

  function dispatch(event: ReducerEvent): PublishedReport | null {
    switch (event.type) {
      case "agent-start":
        state.agentActive = true;
        break;
      case "agent-settled":
        state.agentActive = false;
        break;
      case "prompt-start":
        // Atomic coalesces prompts into an outer span. Keep a defensive stack so
        // duplicate starts and unbalanced ends cannot make the count negative.
        state.prompts.push({ kind: event.kind, title: event.title });
        break;
      case "prompt-end":
        if (state.prompts.length > 0) state.prompts.pop();
        else state.prompts.length = 0;
        break;
      case "sync":
        break;
    }

    const next = current();
    if (
      state.lastPublished?.state === next.state &&
      state.lastPublished.message === next.message
    ) {
      return null;
    }
    state.lastPublished = { ...next };
    state.seq += 1;
    return { ...next, seq: state.seq };
  }

  function nextSeq(): number {
    state.seq += 1;
    return state.seq;
  }

  return { dispatch, nextSeq, snapshot: () => state };
}

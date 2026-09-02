// PROTOTYPE — throwaway Herdr reporter for RFC #2210 verification. Not shipping code.
// Reports source herdr:atomic / agent atomic over the pane socket.
// Modeled on herdr's shipped pi asset, rebased on agent_settled.
// @ts-nocheck

import net from "node:net";

const HERDR_ENV = process.env.HERDR_ENV;
const socketPath = process.env.HERDR_SOCKET_PATH;
const socketEndpoint =
	process.platform === "win32" && socketPath ? `\\\\.\\pipe\\${socketPath}` : socketPath;
const paneId = process.env.HERDR_PANE_ID;
// TEST TOGGLE: ATOMIC_HERDR_PROTO_AS_PI=1 reports as the recognized herdr:pi/pi pair,
// simulating what upstream recognition of herdr:atomic/atomic would unlock. Local test only.
const asPi = process.env.ATOMIC_HERDR_PROTO_AS_PI === "1";
const source = asPi ? "herdr:pi" : "herdr:atomic";
const agent = asPi ? "pi" : "atomic";

function enabled() {
	return HERDR_ENV === "1" && !!socketPath && !!paneId;
}

function sendRequestAttempt(request: unknown, timeoutMs: number): Promise<boolean> {
	if (!enabled()) return Promise.resolve(true);
	return new Promise((resolve) => {
		let done = false;
		let timeout;
		const finish = (delivered: boolean) => {
			if (done) return;
			done = true;
			if (timeout) clearTimeout(timeout);
			socket.destroy();
			resolve(delivered);
		};
		const socket = net.createConnection(socketEndpoint);
		socket.on("error", () => finish(false));
		socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
		socket.on("data", () => finish(true));
		socket.on("end", () => finish(false));
		timeout = setTimeout(() => finish(false), timeoutMs);
		timeout.unref?.();
	});
}

async function sendRequest(request: unknown): Promise<void> {
	if (await sendRequestAttempt(request, 500)) return;
	await sendRequestAttempt(request, 1500);
}

let reportSeq = Date.now() * 1000;
const nextSeq = () => ++reportSeq;
let requestId = 0;
const nextId = () => `atomic-proto-${++requestId}`;

let sessionPath: string | undefined;
let sessionId: string | undefined;

function updateSessionRef(ctx) {
	const file = ctx?.sessionManager?.getSessionFile?.();
	sessionPath = typeof file === "string" && file.startsWith("/") ? file : undefined;
	const id = ctx?.sessionManager?.getSessionId?.();
	sessionId = typeof id === "string" && id.length > 0 ? id : undefined;
}

function sessionRefFields() {
	if (sessionPath) return { agent_session_path: sessionPath };
	if (sessionId) return { agent_session_id: sessionId };
	return {};
}

function reportState(state: string, message?: string) {
	void sendRequest({
		id: nextId(),
		method: "pane.report_agent",
		params: {
			pane_id: paneId,
			source,
			agent,
			state,
			...(message ? { message } : {}),
			seq: nextSeq(),
			...sessionRefFields(),
		},
	});
}

function reportSession() {
	const ref = sessionRefFields();
	if (!Object.keys(ref).length) return;
	void sendRequest({
		id: nextId(),
		method: "pane.report_agent_session",
		params: { pane_id: paneId, source, agent, ...ref },
	});
}

function releaseAgent() {
	void sendRequest({
		id: nextId(),
		method: "pane.release_agent",
		params: { pane_id: paneId, source, agent, seq: nextSeq() },
	});
}

export default function (pi) {
	if (!enabled()) return;

	let rootSession = false;
	let agentActive = false;
	let blockedCount = 0;
	let blockedLabel: string | undefined;
	let lastState: string | undefined;
	let lastMessage: string | undefined;

	function publish(force = false) {
		let state = "idle";
		let message;
		if (blockedCount > 0) {
			state = "blocked";
			message = blockedLabel;
		} else if (agentActive) {
			state = "working";
		}
		if (!force && state === lastState && message === lastMessage) return;
		lastState = state;
		lastMessage = message;
		reportState(state, message);
	}

	pi.on("session_start", (_event, ctx) => {
		if (ctx?.mode !== "tui") return;
		rootSession = true;
		updateSessionRef(ctx);
		reportSession();
		agentActive = ctx?.isIdle?.() === false;
		publish(true);
	});

	pi.on("agent_start", (_event, ctx) => {
		if (!rootSession) return;
		updateSessionRef(ctx);
		reportSession();
		agentActive = true;
		publish();
	});

	pi.on("agent_settled", (_event, ctx) => {
		if (!rootSession || ctx?.isIdle?.() !== true) return;
		agentActive = false;
		publish();
	});

	pi.on("session_shutdown", (event) => {
		if (!rootSession) return;
		if (event?.reason === "quit") releaseAgent();
	});

	// Test command: demonstrates blocked-with-label while a dialog waits on the user.
	pi.registerCommand("herdr-block", {
		description: "PROTOTYPE: open a dialog and report blocked to herdr while it waits",
		handler: async (_args, ctx) => {
			blockedCount += 1;
			blockedLabel = "Trust this prototype?";
			publish();
			try {
				await ctx.ui.confirm("Trust this prototype?", "Herdr should now show this pane as blocked.");
			} finally {
				blockedCount -= 1;
				if (blockedCount === 0) blockedLabel = undefined;
				publish();
			}
		},
	});
}

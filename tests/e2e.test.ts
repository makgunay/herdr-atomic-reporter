import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createFakeSocket, safeHerdrEnv, type FakeSocket } from "./fake-socket";

const atomicBin = process.env.ATOMIC_BIN ?? Bun.which("atomic") ??
  "/Users/akgunay/Library/pnpm/bin/atomic";

let socket: FakeSocket | undefined;
let child: ReturnType<typeof Bun.spawn> | undefined;
let scratch: string | undefined;
afterEach(async () => {
  try { child?.kill(); } catch {}
  await socket?.close(); socket = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
});
test("installed Atomic loads the reporter, reports session and idle, and releases on graceful quit", async () => {
  socket = await createFakeSocket();
  scratch = await mkdtemp(join(tmpdir(), "herdr-atomic-e2e-"));
  const env = safeHerdrEnv(socket.path);
  env.HERDR_ATOMIC_TEST_ALLOW_RPC_ROOT = "1";
  env.ATOMIC_OFFLINE = "1";
  env.ATOMIC_AGENT_DIR = join(scratch, "agent");

  child = Bun.spawn([
    atomicBin,
    "--mode", "rpc",
    "--session-dir", join(scratch, "sessions"),
    "--offline",
    "--no-tools",
    "--no-skills",
    "--no-prompt-templates",
    "--no-context-files",
    "--no-approve",
    "-e", resolve("index.ts"),
  ], {
    cwd: scratch,
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();

  try {
    await socket.waitFor(2, 30_000);
  } catch (error) {
    child.kill();
    console.error("atomic stdout:", await stdout);
    console.error("atomic stderr:", await stderr);
    throw error;
  }
  child.stdin.write('{"id":"turn","type":"prompt","message":"Reply with OK."}\n');

	// The child env is scrubbed of provider credentials, so this prompt cannot
	// start a real model turn anywhere — CI has no keys and local keys are
	// removed by safeHerdrEnv. What this proves: a prompt without a usable
	// provider neither crashes the host nor corrupts the reporter. Working and
	// blocked transitions are covered by the in-process wiring tests, which
	// drive the real installed loader's event delivery.
	await Bun.sleep(2_000);
  child.stdin.end();
  const exitCode = await Promise.race([
    child.exited,
    Bun.sleep(5_000).then(() => {
      child?.kill();
      throw new Error("Atomic child did not exit after graceful stdin close");
    }),
  ]);
  expect(exitCode).toBe(0);

	const reports = socket.requests.filter((request) => request.method === "pane.report_agent");
	const states = reports.map((request) => request.params.state);
	expect(socket.requests.some((request) => request.method === "pane.report_agent_session")).toBeTrue();
	expect(states[0]).toBe("idle");
	// Tolerate a future Atomic that starts a turn before provider resolution;
	// reject anything outside the reducer's vocabulary for this scenario.
	expect(states.every((state) => state === "idle" || state === "working")).toBeTrue();
	expect(reports.every((request) => request.params.pane_id === "test:pane")).toBeTrue();
	expect(reports.every((request) => request.params.source === "herdr:atomic" && request.params.agent === "atomic")).toBeTrue();
  const release = socket.requests.find((request) => request.method === "pane.release_agent");
  expect(release).toEqual({
    id: expect.any(String),
    method: "pane.release_agent",
    params: {
      pane_id: "test:pane",
      source: "herdr:atomic",
      agent: "atomic",
      seq: reports.at(-1).params.seq + 1,
    },
  });
}, 60_000);

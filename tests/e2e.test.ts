import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createFakeSocket, safeHerdrEnv, type FakeSocket } from "./fake-socket";

let socket: FakeSocket | undefined;
let child: ReturnType<typeof Bun.spawn> | undefined;
let scratch: string | undefined;
afterEach(async () => {
  try { child?.kill(); } catch {}
  await socket?.close(); socket = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
});
test("installed Atomic 0.9.17 loads the extension and reports its real RPC lifecycle", async () => {
  socket = await createFakeSocket();
  scratch = await mkdtemp(join(tmpdir(), "herdr-atomic-e2e-"));
  const env = safeHerdrEnv(socket.path);
  env.HERDR_ATOMIC_TEST_ALLOW_RPC_ROOT = "1";
  env.ATOMIC_OFFLINE = "1";
  env.ATOMIC_AGENT_DIR = join(scratch, "agent");

  child = Bun.spawn([
    "/Users/akgunay/Library/pnpm/bin/atomic",
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

  // agent_start is emitted before provider execution. Even when the hermetic
  // offline child cannot call a model, agent_settled returns it to idle.
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const states = socket.requests.filter((request) => request.method === "pane.report_agent").map((request) => request.params.state);
    if (states.includes("working") && states.at(-1) === "idle") break;
    await Bun.sleep(25);
  }
  child.stdin.end();
  await Promise.race([child.exited, Bun.sleep(5_000).then(() => child?.kill())]);

  const reports = socket.requests.filter((request) => request.method === "pane.report_agent");
  expect(socket.requests.some((request) => request.method === "pane.report_agent_session")).toBeTrue();
  expect(reports.map((request) => request.params.state)).toEqual(["idle", "working", "idle"]);
  expect(reports.every((request) => request.params.pane_id === "test:pane")).toBeTrue();
  expect(reports.every((request) => request.params.source === "herdr:atomic" && request.params.agent === "atomic")).toBeTrue();
}, 60_000);

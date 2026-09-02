import { expect, test } from "bun:test";
import { resolve } from "node:path";

const setupPath = resolve("tests/setup.ts");

test("test preload refuses any inherited enabled Herdr socket", async () => {
  const env = { ...process.env };
  env.HERDR_ENV = "1";
  env.HERDR_SOCKET_PATH = "/tmp/example-machine-live-herdr.sock";
  env.HERDR_PANE_ID = "live:pane";

  const child = Bun.spawn([
    process.execPath,
    "-e",
    `await import(${JSON.stringify(setupPath)})`,
  ], {
    cwd: resolve("."),
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [exitCode, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);

  expect(exitCode).not.toBe(0);
  expect(stderr).toContain("Refusing to run tests with inherited live Herdr reporting enabled");
  expect(stderr).toContain("/tmp/example-machine-live-herdr.sock");
});

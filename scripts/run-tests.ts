const env = { ...process.env };
env.HERDR_ENV = "0";
env.HERDR_SOCKET_PATH = "/tmp/herdr-atomic-reporter-test-runner-disabled.sock";
env.HERDR_PANE_ID = "test:pane";
delete env.HERDR_TAB_ID;
delete env.HERDR_WORKSPACE_ID;
delete env.HERDR_BIN_PATH;

const child = Bun.spawn([process.execPath, "test", ...process.argv.slice(2)], {
  cwd: new URL("..", import.meta.url).pathname,
  env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(await child.exited);

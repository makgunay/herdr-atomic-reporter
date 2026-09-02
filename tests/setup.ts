const KNOWN_LIVE_SOCKET = "/Users/akgunay/.config/herdr/herdr.sock";
const inheritedHerdrEnv = process.env.HERDR_ENV;
const inheritedSocketPath = process.env.HERDR_SOCKET_PATH;

if (inheritedSocketPath === KNOWN_LIVE_SOCKET) {
  throw new Error(`Refusing to run tests against the known live Herdr socket: ${KNOWN_LIVE_SOCKET}`);
}
if (inheritedHerdrEnv === "1" && inheritedSocketPath) {
  throw new Error(
    `Refusing to run tests with inherited live Herdr reporting enabled: ${inheritedSocketPath}`,
  );
}

// Tests that need transport enablement replace these with a listening temp socket.
process.env.HERDR_ENV = "0";
process.env.HERDR_SOCKET_PATH = "/tmp/herdr-atomic-reporter-disabled.sock";
process.env.HERDR_PANE_ID = "test:pane";
delete process.env.HERDR_TAB_ID;
delete process.env.HERDR_WORKSPACE_ID;
delete process.env.HERDR_BIN_PATH;

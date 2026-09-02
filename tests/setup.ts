const REAL_SOCKET = "/Users/akgunay/.config/herdr/herdr.sock";

if (process.env.HERDR_SOCKET_PATH === REAL_SOCKET) {
  throw new Error(`Refusing to run tests against the live Herdr socket: ${REAL_SOCKET}`);
}

// Tests that need transport enablement replace these with a listening temp socket.
process.env.HERDR_ENV = "0";
process.env.HERDR_SOCKET_PATH = "/tmp/herdr-atomic-reporter-disabled.sock";
process.env.HERDR_PANE_ID = "test:pane";
delete process.env.HERDR_TAB_ID;
delete process.env.HERDR_WORKSPACE_ID;
delete process.env.HERDR_BIN_PATH;

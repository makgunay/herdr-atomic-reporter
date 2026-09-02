import net from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REAL_SOCKET = "/Users/akgunay/.config/herdr/herdr.sock";

export interface FakeSocket {
  path: string;
  requests: any[];
  close(): Promise<void>;
  waitFor(count: number, timeoutMs?: number): Promise<void>;
}

export async function createFakeSocket(): Promise<FakeSocket> {
  const dir = await mkdtemp(join(tmpdir(), "herdr-atomic-test-"));
  const path = join(dir, "herdr.sock");
  if (path === REAL_SOCKET) throw new Error("Refusing to use the live Herdr socket");
  const requests: any[] = [];
  const server = net.createServer((socket) => {
    let input = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      input += chunk;
      let newline: number;
      while ((newline = input.indexOf("\n")) >= 0) {
        const line = input.slice(0, newline);
        input = input.slice(newline + 1);
        if (line) requests.push(JSON.parse(line));
        socket.write('{"result":{}}\n');
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, resolve);
  });
  return {
    path,
    requests,
    async waitFor(count, timeoutMs = 4_000) {
      const deadline = Date.now() + timeoutMs;
      while (requests.length < count && Date.now() < deadline) {
        await Bun.sleep(10);
      }
      if (requests.length < count) {
        throw new Error(`Timed out waiting for ${count} requests; received ${requests.length}`);
      }
    },
    async close() {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export function safeHerdrEnv(socketPath: string): NodeJS.ProcessEnv {
  if (socketPath === REAL_SOCKET) throw new Error("Refusing to construct a live Herdr environment");
  const env = { ...process.env };
  env.HERDR_ENV = "1";
  env.HERDR_SOCKET_PATH = socketPath;
  env.HERDR_PANE_ID = "test:pane";
  delete env.HERDR_TAB_ID;
  delete env.HERDR_WORKSPACE_ID;
  delete env.HERDR_BIN_PATH;
  return env;
}

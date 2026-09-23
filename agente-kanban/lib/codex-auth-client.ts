import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { WorkspaceError } from "./workspace-schema";
import { codexHome } from "./workspace-ai";

export type AuthMethod =
  | "initialize"
  | "account/login/start"
  | "account/login/cancel"
  | "account/read"
  | "account/logout";
export interface AuthClient {
  initialize(): Promise<void>;
  request(
    method: AuthMethod,
    params?: Record<string, unknown>,
  ): Promise<unknown>;
  onNotification: (method: string, params: unknown) => void;
  onClose: () => void;
  close(): void;
}

/** The subprocess only handles account RPCs. It never creates a model thread. */
export class CodexAuthClient implements AuthClient {
  onNotification: AuthClient["onNotification"] = () => {};
  onClose: AuthClient["onClose"] = () => {};
  private child: ChildProcessWithoutNullStreams;
  private nextId = 0;
  private closed = false;
  private pending = new Map<
    number,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(directory = codexHome()) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const require = createRequire(path.join(process.cwd(), "package.json"));
    const binary = path.join(
      path.dirname(require.resolve("@openai/codex/package.json")),
      "bin/codex.js",
    );
    this.child = spawn(
      process.execPath,
      [
        binary,
        "-c",
        'cli_auth_credentials_store="file"',
        "app-server",
        "--stdio",
      ],
      {
        cwd: directory,
        env: {
          PATH: process.env.PATH || "",
          HOME: process.env.HOME || "",
          CODEX_HOME: directory,
          NODE_ENV: process.env.NODE_ENV,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const lines = createInterface({
      input: this.child.stdout,
      crlfDelay: Infinity,
    });
    lines.on("line", (line) => {
      if (line.length > 1_000_000) {
        this.close();
        return;
      }
      let message: {
        id?: number;
        method?: string;
        params?: unknown;
        result?: unknown;
        error?: unknown;
      };
      try {
        message = JSON.parse(line);
      } catch {
        this.close();
        return;
      }
      if (!message || typeof message !== "object" || Array.isArray(message)) {
        this.close();
        return;
      }
      if (message.method && message.id !== undefined) {
        // Never approve provider-initiated actions from this authentication-only client.
        this.write({
          id: message.id,
          error: { code: -32601, message: "Unsupported account operation" },
        });
      } else if (message.id !== undefined) {
        const request = this.pending.get(message.id);
        if (!request) return;
        clearTimeout(request.timeout);
        this.pending.delete(message.id);
        if (message.error)
          request.reject(
            new WorkspaceError(
              "O login foi recusado. Confira se o login por dispositivo está habilitado na sua conta ChatGPT e tente novamente.",
              502,
            ),
          );
        else request.resolve(message.result);
      } else if (message.method)
        this.onNotification(message.method, message.params);
    });
    // Provider logs can contain account information. Drain them without recording or returning them.
    this.child.stderr.resume();
    this.child.stdin.on("error", () => this.close());
    this.child.on("error", () => this.close());
    this.child.on("exit", () => {
      lines.close();
      this.finish();
    });
  }

  private write(message: unknown) {
    if (!this.closed && this.child.stdin.writable)
      this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }
  private finish() {
    if (this.closed) return;
    this.closed = true;
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(
        new WorkspaceError(
          "A conexão de login foi interrompida. Tente novamente.",
          502,
        ),
      );
    }
    this.pending.clear();
    this.onClose();
  }
  async initialize() {
    await this.request("initialize", {
      clientInfo: {
        name: "orbit_kanban",
        title: "Orbit Kanban",
        version: "0.1.0",
      },
    });
    this.write({ method: "initialized", params: {} });
  }
  request(
    method: AuthMethod,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    if (this.closed)
      return Promise.reject(
        new WorkspaceError("A conexão de login foi encerrada.", 502),
      );
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new WorkspaceError(
            "O serviço de login demorou a responder. Tente novamente.",
            504,
          ),
        );
      }, 30000);
      this.pending.set(id, { resolve, reject, timeout });
      this.write({ id, method, params });
    });
  }
  close() {
    if (this.closed) return;
    this.finish();
    this.child.stdin.end();
    this.child.kill("SIGTERM");
    const terminate = setTimeout(() => {
      if (this.child.exitCode === null && this.child.signalCode === null)
        this.child.kill("SIGKILL");
    }, 1000);
    terminate.unref();
  }
}

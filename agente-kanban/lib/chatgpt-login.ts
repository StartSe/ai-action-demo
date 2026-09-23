import { z } from "zod";
import { chatgptConfigured } from "./workspace-ai";
import { CodexAuthClient, type AuthClient } from "./codex-auth-client";
import { WorkspaceError } from "./workspace-schema";
import type { ChatGPTLogin } from "./workspace-types";

const loginResponse = z.object({
  type: z.literal("chatgptDeviceCode"),
  loginId: z.string().min(1),
  userCode: z.string().min(1).max(40),
  verificationUrl: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "auth.openai.com" &&
      !url.username &&
      !url.password &&
      !url.port
    );
  }),
});
const completed = z.object({ loginId: z.string(), success: z.boolean() });
const account = z.object({
  account: z.object({ type: z.literal("chatgpt") }).passthrough(),
});
const pendingPhases = new Set(["starting", "waiting", "cancelling"]);

export class ChatGPTLoginManager {
  private state: ChatGPTLogin = { phase: "idle" };
  private client: AuthClient | null = null;
  private loginId: string | null = null;
  private expiry: ReturnType<typeof setTimeout> | null = null;
  private startPromise: Promise<ChatGPTLogin> | null = null;

  constructor(
    private createClient: () => AuthClient = () => new CodexAuthClient(),
    private configured = chatgptConfigured,
    private lifetime = 10 * 60000,
  ) {}

  status(): ChatGPTLogin {
    if (!pendingPhases.has(this.state.phase) && this.configured())
      return this.state.phase === "error"
        ? { phase: "connected", message: this.state.message }
        : { phase: "connected" };
    if (this.state.phase === "connected" && !this.configured())
      return { phase: "idle" };
    return { ...this.state };
  }
  start(): Promise<ChatGPTLogin> {
    if (this.startPromise) return this.startPromise;
    const status = this.status();
    if (status.phase === "connected" || status.phase === "waiting")
      return Promise.resolve(status);
    if (status.phase === "cancelling")
      throw new WorkspaceError(
        "Aguarde o cancelamento do login anterior.",
        409,
      );
    this.state = { phase: "starting" };
    this.startPromise = this.open().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }
  private async open() {
    try {
      const client = this.createClient();
      this.client = client;
      client.onClose = () => {
        if (this.client === client && pendingPhases.has(this.state.phase))
          this.finish({
            phase: "error",
            message: "O login foi interrompido. Inicie uma nova conexão.",
          });
      };
      client.onNotification = (method, raw) => {
        if (
          this.client !== client ||
          this.state.phase !== "waiting" ||
          method !== "account/login/completed"
        )
          return;
        const result = completed.safeParse(raw);
        if (!result.success || result.data.loginId !== this.loginId) return;
        if (!result.data.success)
          this.finish({
            phase: "error",
            message:
              "O login não foi concluído. Confira o código e tente conectar novamente.",
          });
        else void this.verify(client);
      };
      await client.initialize();
      const result = loginResponse.parse(
        await client.request("account/login/start", {
          type: "chatgptDeviceCode",
        }),
      );
      if (this.client !== client) return this.status();
      this.loginId = result.loginId;
      if (this.state.phase !== "starting") return this.status();
      this.state = {
        phase: "waiting",
        code: result.userCode,
        url: result.verificationUrl,
        expiresAt: new Date(Date.now() + this.lifetime).toISOString(),
      };
      this.expiry = setTimeout(() => {
        void this.cancel(true);
      }, this.lifetime);
      this.expiry.unref();
      return this.status();
    } catch (error) {
      if (this.state.phase !== "cancelling")
        this.finish({
          phase: "error",
          message:
            error instanceof WorkspaceError
              ? error.message
              : "Não foi possível iniciar o login. Tente novamente ou use a alternativa pelo terminal.",
        });
      return this.status();
    }
  }
  private async verify(client: AuthClient) {
    try {
      const result = await client.request("account/read", {
        refreshToken: false,
      });
      if (this.client !== client || this.state.phase !== "waiting") return;
      if (!account.safeParse(result).success || !this.configured())
        throw new Error("Login not persisted");
      this.finish({ phase: "connected" });
    } catch {
      if (this.client === client && this.state.phase === "waiting")
        this.finish({
          phase: "error",
          message:
            "O login retornou, mas não foi possível confirmar a conta. Tente novamente.",
        });
    }
  }
  async cancel(expired = false): Promise<ChatGPTLogin> {
    const client = this.client;
    if (!client || !pendingPhases.has(this.state.phase)) return this.status();
    if (this.state.phase === "cancelling") return this.status();
    this.state = { phase: "cancelling" };
    if (this.expiry) clearTimeout(this.expiry);
    try {
      if (this.startPromise) await this.startPromise;
      if (this.loginId)
        await client.request("account/login/cancel", { loginId: this.loginId });
      // The flow started without a saved account. Clear a login that raced with cancellation.
      await client.request("account/logout");
      this.finish({
        phase: expired ? "expired" : "cancelled",
        message: expired
          ? "Este código expirou. Inicie uma nova conexão."
          : "Login cancelado.",
      });
    } catch {
      this.finish({
        phase: "error",
        message:
          "Não foi possível confirmar o cancelamento. Verifique o estado da conexão.",
      });
    }
    return this.status();
  }
  private finish(state: ChatGPTLogin) {
    this.state = state;
    const client = this.client;
    this.client = null;
    this.loginId = null;
    if (this.expiry) clearTimeout(this.expiry);
    this.expiry = null;
    client?.close();
  }
}

const runtime = globalThis as typeof globalThis & {
  orbitChatGPTLogin?: ChatGPTLoginManager;
};
export function chatgptLogin() {
  return (runtime.orbitChatGPTLogin ??= new ChatGPTLoginManager());
}

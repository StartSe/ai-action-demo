import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  OAuth2Client,
  CodeChallengeMethod,
  type Credentials,
} from "google-auth-library";
import { AppError } from "./api";

export const YOUTUBE_SCOPE =
  "https://www.googleapis.com/auth/youtube.force-ssl";
export const YOUTUBE_CALLBACK = "/api/youtube/oauth/callback";
export const YOUTUBE_COOKIE = "mapify_youtube_oauth";
const CLIENT_ID = "YOUTUBE_CLIENT_ID";
const CLIENT_SECRET = "YOUTUBE_CLIENT_SECRET";
const ACCOUNT = "YOUTUBE_ACCOUNT";
const PENDING = "YOUTUBE_OAUTH_PENDING";
const REVISION = "YOUTUBE_CONNECTION_REVISION";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const nonce = () => randomBytes(32).toString("base64url");

export type YouTubeStatus = {
  configured: boolean;
  managed: boolean;
  clientId: string;
  redirectUri: string;
  connected: boolean;
  reconnect: boolean;
  channel: string | null;
};
type Account = {
  revision: string;
  clientId: string;
  tokens: Credentials;
  channel: string | null;
  reconnect?: boolean;
};
type Pending = {
  revision: string;
  stateHash: string;
  browserHash: string;
  expires: number;
  verifier: string;
  redirectUri: string;
  clientId: string;
};
export type OAuthPort = {
  authorize: (state: string, challenge: string) => string;
  exchange: (code: string, verifier: string) => Promise<Credentials>;
  refresh: (token: string) => Promise<Credentials>;
  scopes: (token: string) => Promise<string[]>;
  revoke: (token: string) => Promise<void>;
};
type Dependencies = {
  get: (key: string) => string | undefined;
  set: (key: string, value: string | null) => void;
  managed: () => boolean;
  fetcher?: typeof fetch;
  now?: () => number;
  oauth?: (id: string, secret: string, redirect: string) => OAuthPort;
};

function oauthClient(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): OAuthPort {
  const client = new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri,
    transporterOptions: { timeout: 15000, retry: false },
  });
  return {
    authorize: (state, challenge) =>
      client.generateAuthUrl({
        scope: [YOUTUBE_SCOPE],
        access_type: "offline",
        prompt: "consent",
        state,
        code_challenge: challenge,
        code_challenge_method: CodeChallengeMethod.S256,
      }),
    exchange: async (code, codeVerifier) =>
      (await client.getToken({ code, codeVerifier })).tokens,
    refresh: async (refresh_token) => {
      client.setCredentials({ refresh_token });
      return (await client.refreshAccessToken()).credentials;
    },
    scopes: async (token) => (await client.getTokenInfo(token)).scopes,
    revoke: async (token) => {
      await client.revokeToken(token);
    },
  };
}

function read<T>(raw: string | undefined): T | null {
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function matches(value: string, expected: string) {
  const actual = hash(value);
  return (
    expected.length === actual.length &&
    timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  );
}
export function youtubeOrigin(req: Request) {
  const fallback = new URL(req.url);
  const host =
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    fallback.host;
  const protocol =
    req.headers.get("x-forwarded-proto") || fallback.protocol.replace(":", "");
  const origin = new URL(
    process.env.APP_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      `${protocol}://${host}`,
  );
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (
    origin.username ||
    origin.password ||
    (origin.protocol !== "https:" && !(local && origin.protocol === "http:"))
  )
    throw new AppError(
      "A conexão Google exige HTTPS. Para testes locais, use localhost.",
    );
  return origin.origin;
}

/** One administrator per installation. All durable values use the encrypted config store. */
export class YouTubeOAuth {
  private fetcher: typeof fetch;
  private now: () => number;
  private oauth: NonNullable<Dependencies["oauth"]>;
  private refreshing = new Map<string, Promise<Account>>();
  private deps: Dependencies;
  constructor(deps: Dependencies) {
    this.deps = deps;
    this.fetcher = deps.fetcher || fetch;
    this.now = deps.now || Date.now;
    this.oauth = deps.oauth || oauthClient;
  }
  private account() {
    return read<Account>(this.deps.get(ACCOUNT));
  }
  hasConnection() {
    return !!this.account();
  }
  status(origin: string): YouTubeStatus {
    const account = this.account();
    return {
      configured: !!(this.deps.get(CLIENT_ID) && this.deps.get(CLIENT_SECRET)),
      managed: this.deps.managed(),
      clientId: this.deps.get(CLIENT_ID) || "",
      redirectUri: origin + YOUTUBE_CALLBACK,
      connected: !!account && !account.reconnect,
      reconnect: !!account?.reconnect,
      channel: account?.channel || null,
    };
  }
  configure(clientId: string, clientSecret: string) {
    if (this.deps.managed())
      throw new AppError(
        "As credenciais Google desta instalação são definidas pelo administrador no ambiente.",
      );
    if (
      !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId) ||
      clientId.length > 300
    )
      throw new AppError(
        "Informe o ID do cliente OAuth do tipo Aplicativo da Web, fornecido pelo Google.",
      );
    const previous = this.deps.get(CLIENT_ID);
    const secret =
      clientSecret ||
      (previous === clientId ? this.deps.get(CLIENT_SECRET) : "");
    if (!secret || secret.length > 1000 || /\s/.test(secret))
      throw new AppError("Informe o segredo do cliente Google.");
    if (previous !== clientId || secret !== this.deps.get(CLIENT_SECRET)) {
      this.deps.set(ACCOUNT, null);
      this.deps.set(PENDING, null);
      this.deps.set(REVISION, nonce());
    }
    this.deps.set(CLIENT_ID, clientId);
    this.deps.set(CLIENT_SECRET, secret);
  }
  private client(redirect = "") {
    const id = this.deps.get(CLIENT_ID),
      secret = this.deps.get(CLIENT_SECRET);
    if (!id || !secret)
      throw new AppError(
        "Configure o cliente Google antes de conectar o YouTube.",
      );
    return this.oauth(id, secret, redirect);
  }
  begin(origin: string) {
    const redirectUri = origin + YOUTUBE_CALLBACK;
    const client = this.client(redirectUri);
    const state = nonce(),
      browser = nonce(),
      verifier = nonce(),
      revision = nonce();
    const pending: Pending = {
      revision,
      stateHash: hash(state),
      browserHash: hash(browser),
      verifier,
      expires: this.now() + 10 * 60_000,
      redirectUri,
      clientId: this.deps.get(CLIENT_ID)!,
    };
    this.deps.set(REVISION, revision);
    this.deps.set(PENDING, JSON.stringify(pending));
    return {
      url: client.authorize(
        state,
        createHash("sha256").update(verifier).digest("base64url"),
      ),
      browser,
    };
  }
  async complete(state: string, browser: string, code: string, denied = false) {
    const pending = read<Pending>(this.deps.get(PENDING));
    if (
      !pending ||
      !state ||
      !browser ||
      pending.expires < this.now() ||
      !matches(state, pending.stateHash) ||
      !matches(browser, pending.browserHash) ||
      pending.clientId !== this.deps.get(CLIENT_ID) ||
      pending.revision !== this.deps.get(REVISION)
    )
      throw new AppError(
        "A autorização expirou ou pertence a outro navegador. Conecte o YouTube novamente.",
      );
    // Consume before any network I/O: authorization callbacks cannot be replayed.
    this.deps.set(PENDING, null);
    if (denied)
      throw new AppError(
        "A autorização do YouTube foi cancelada. Você pode tentar novamente.",
      );
    if (!code || code.length > 4096)
      throw new AppError(
        "O Google não enviou um código de autorização válido.",
      );
    const client = this.client(pending.redirectUri);
    let tokens: Credentials;
    try {
      tokens = await client.exchange(code, pending.verifier);
    } catch {
      throw new AppError(
        "Não foi possível concluir a autorização Google. Confira o cliente, o segredo e a URL de retorno e tente novamente.",
      );
    }
    if (!tokens.access_token || !tokens.refresh_token)
      throw new AppError(
        "O Google não concedeu acesso persistente. Conecte novamente e autorize o acesso solicitado.",
      );
    let scopes: string[];
    try {
      scopes =
        tokens.scope?.split(" ") || (await client.scopes(tokens.access_token));
    } catch {
      throw new AppError(
        "Não foi possível confirmar as permissões concedidas pelo Google.",
      );
    }
    if (!scopes.includes(YOUTUBE_SCOPE))
      throw new AppError(
        "Autorize a permissão do YouTube para permitir a importação das legendas.",
      );
    const account: Account = {
      revision: pending.revision,
      clientId: pending.clientId,
      channel: null,
      tokens: this.cleanTokens(tokens),
    };
    account.channel = await this.channel(tokens.access_token);
    if (this.deps.get(REVISION) !== pending.revision)
      throw new AppError("Essa conexão foi cancelada. Tente novamente.");
    this.deps.set(ACCOUNT, JSON.stringify(account));
  }
  private cleanTokens(tokens: Credentials): Credentials {
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope,
      token_type: "Bearer",
    };
  }
  private async request(path: string, token: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    let response: Response;
    try {
      response = await this.fetcher(
        `https://www.googleapis.com/youtube/v3/${path}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          redirect: "error",
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
            : AbortSignal.timeout(15000),
        },
      );
    } catch {
      signal?.throwIfAborted();
      throw new AppError("O YouTube não respondeu a tempo. Tente novamente.");
    }
    return response;
  }
  private async failure(response: Response): Promise<never> {
    const data = await response.json().catch(() => ({}));
    const reason = data.error?.errors?.[0]?.reason || data.error?.status;
    if (
      [
        "quotaExceeded",
        "dailyLimitExceeded",
        "rateLimitExceeded",
        "RESOURCE_EXHAUSTED",
      ].includes(reason) ||
      response.status === 429
    )
      throw new AppError(
        "A cota da API do YouTube foi atingida. Aguarde a renovação da cota ou confira o projeto no Google Cloud.",
        429,
      );
    if (["accessNotConfigured", "SERVICE_DISABLED"].includes(reason))
      throw new AppError(
        "Ative a YouTube Data API v3 no projeto Google usado nesta conexão.",
      );
    if (response.status === 401)
      throw new AppError(
        "A autorização Google expirou ou foi revogada. Reconecte o YouTube em Configurações.",
      );
    if (response.status === 403)
      throw new AppError(
        "A conta Google conectada não tem permissão para acessar estas legendas. A API oficial exige permissão para editar o vídeo; conecte a conta do canal correto.",
      );
    if (response.status === 404)
      throw new AppError(
        "O vídeo ou a legenda não está disponível para esta conta Google.",
      );
    throw new AppError(
      "Não foi possível obter os dados pela API oficial do YouTube. Tente novamente.",
    );
  }
  private async channel(token: string) {
    const response = await this.request(
      "channels?part=snippet&mine=true&maxResults=1",
      token,
    );
    if (!response.ok) return this.failure(response);
    const data = await response.json();
    return typeof data.items?.[0]?.snippet?.title === "string"
      ? (data.items[0].snippet.title as string)
      : null;
  }
  private async refresh(account: Account) {
    const active = this.refreshing.get(account.revision);
    if (active) return active;
    const operation = (async () => {
      let tokens: Credentials;
      try {
        tokens = await this.client().refresh(account.tokens.refresh_token!);
      } catch (error) {
        const code = (error as { response?: { data?: { error?: string } } })
          .response?.data?.error;
        if (
          ["invalid_grant", "invalid_client", "unauthorized_client"].includes(
            code || "",
          )
        ) {
          if (this.account()?.revision === account.revision)
            this.deps.set(
              ACCOUNT,
              JSON.stringify({ ...account, reconnect: true }),
            );
          throw new AppError(
            "A autorização Google expirou ou foi revogada. Reconecte o YouTube em Configurações.",
          );
        }
        throw new AppError(
          "Não foi possível renovar a conexão Google agora. Tente novamente.",
        );
      }
      if (!tokens.access_token)
        throw new AppError(
          "O Google não renovou o acesso. Reconecte o YouTube em Configurações.",
        );
      const renewed = {
        ...account,
        tokens: this.cleanTokens({
          ...account.tokens,
          ...tokens,
          refresh_token: tokens.refresh_token || account.tokens.refresh_token,
        }),
      };
      if (this.account()?.revision !== account.revision)
        throw new AppError("A conexão YouTube foi alterada. Tente novamente.");
      this.deps.set(ACCOUNT, JSON.stringify(renewed));
      return renewed;
    })();
    this.refreshing.set(account.revision, operation);
    try {
      return await operation;
    } finally {
      this.refreshing.delete(account.revision);
    }
  }
  async api(path: string, signal?: AbortSignal) {
    // Callers provide only known relative API routes, never user-supplied URLs.
    if (!/^(channels|videos|captions)(\?|\/)/.test(path))
      throw new AppError("Recurso do YouTube inválido.");
    let account = this.account();
    if (
      !account ||
      account.reconnect ||
      account.clientId !== this.deps.get(CLIENT_ID)
    )
      throw new AppError(
        "Conecte o YouTube em Configurações para importar pela API oficial.",
      );
    if (
      !account.tokens.access_token ||
      !account.tokens.expiry_date ||
      account.tokens.expiry_date < this.now() + 60000
    )
      account = await this.refresh(account);
    let response = await this.request(
      path,
      account.tokens.access_token!,
      signal,
    );
    if (response.status === 401) {
      account = await this.refresh(account);
      response = await this.request(path, account.tokens.access_token!, signal);
      if (response.status === 401 && this.account()?.revision === account.revision)
        this.deps.set(ACCOUNT, JSON.stringify({ ...account, reconnect: true }));
    }
    if (!response.ok) return this.failure(response);
    return response;
  }
  async test() {
    const revision = this.account()?.revision;
    const response = await this.api(
      "channels?part=snippet&mine=true&maxResults=1",
    );
    const data = await response.json();
    const account = this.account();
    if (!account || account.revision !== revision)
      throw new AppError(
        "A conexão YouTube foi alterada. Verifique novamente.",
      );
    const channel = data.items?.[0]?.snippet?.title || null;
    this.deps.set(ACCOUNT, JSON.stringify({ ...account, channel }));
    return {
      channel,
      message: channel
        ? `Conexão confirmada com o canal ${channel}.`
        : "Conexão Google confirmada. Esta conta não retornou um canal próprio; a importação depende da permissão sobre o vídeo.",
    };
  }
  async disconnect() {
    const account = this.account();
    this.deps.set(ACCOUNT, null);
    this.deps.set(PENDING, null);
    this.deps.set(REVISION, nonce());
    const token = account?.tokens.refresh_token || account?.tokens.access_token;
    if (token) {
      try {
        await this.client().revoke(token);
      } catch {
        return {
          message:
            "Conexão removida do Mapify. O Google não confirmou a revogação; remova também o acesso em myaccount.google.com/connections.",
        };
      }
    }
    return { message: "YouTube desconectado." };
  }
}

let instance: YouTubeOAuth | undefined;
export async function youtubeIntegration() {
  if (!instance) {
    const { getConfig, setConfig, origemConfig } = await import("./store");
    instance = new YouTubeOAuth({
      get: getConfig,
      set: setConfig,
      managed: () =>
        origemConfig(CLIENT_ID) === "env" ||
        origemConfig(CLIENT_SECRET) === "env",
    });
  }
  return instance;
}

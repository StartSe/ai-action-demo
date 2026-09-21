import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  YouTubeOAuth,
  YOUTUBE_SCOPE,
  youtubeOrigin,
  type OAuthPort,
} from "./youtube-oauth";
import { officialCaptions, parseSrt } from "./youtube-official";

const dir = mkdtempSync(join(tmpdir(), "mapify-google-"));
process.env.DATA_DIR = dir;
const CLIENT = "test.apps.googleusercontent.com";
const SECRET = "client-secret-test";
const text =
  "Conhecimento organizado em mapas mentais facilita o aprendizado e conecta os principais conceitos apresentados neste vídeo.";
const srt = `1\n00:00:01,250 --> 00:00:08,000\n<b>${text}</b>\n\n2\n00:01:12,000 --> 00:01:18,000\nOutra ideia &amp; aplicação.\n`;
test.after(() => rmSync(dir, { recursive: true, force: true }));

function fixture() {
  const values = new Map<string, string>();
  let now = 1800000000000,
    exchanges = 0,
    refreshes = 0,
    revocations = 0;
  let exchangeFailure = false,
    scope = YOUTUBE_SCOPE,
    refreshToken: string | null = "refresh-secret",
    refreshFailure = "";
  let response = () =>
    Response.json({ items: [{ snippet: { title: "Canal de teste" } }] });
  const requests: { url: string; authorization: string }[] = [];
  const port: OAuthPort = {
    authorize: (state, challenge) =>
      `https://accounts.google.com/o/oauth2/v2/auth?state=${state}&code_challenge=${challenge}`,
    exchange: async (code, verifier) => {
      exchanges++;
      assert.equal(code, "valid-code");
      assert.ok(verifier.length >= 43);
      if (exchangeFailure) throw new Error(`provider body ${SECRET}`);
      return {
        access_token: "access-secret",
        refresh_token: refreshToken,
        expiry_date: now + 3600000,
        scope,
      };
    },
    refresh: async (token) => {
      refreshes++;
      assert.equal(token, "refresh-secret");
      if (refreshFailure)
        throw { response: { data: { error: refreshFailure } } };
      return { access_token: "renewed-secret", expiry_date: now + 3600000 };
    },
    scopes: async () => [scope],
    revoke: async () => {
      revocations++;
    },
  };
  const service = new YouTubeOAuth({
    get: (key) => values.get(key),
    set: (key, value) => {
      if (value === null) values.delete(key);
      else values.set(key, value);
    },
    managed: () => false,
    now: () => now,
    oauth: () => port,
    fetcher: async (url, init) => {
      requests.push({
        url: String(url),
        authorization: new Headers(init?.headers).get("authorization") || "",
      });
      return response();
    },
  });
  service.configure(CLIENT, SECRET);
  const begin = () => {
    const login = service.begin("https://mapify.example.com");
    return { ...login, state: new URL(login.url).searchParams.get("state")! };
  };
  const connect = async () => {
    const login = begin();
    await service.complete(login.state, login.browser, "valid-code");
  };
  return {
    service,
    values,
    port,
    requests,
    begin,
    connect,
    counts: () => ({ exchanges, refreshes, revocations }),
    advance: (ms: number) => {
      now += ms;
    },
    failExchange: () => {
      exchangeFailure = true;
    },
    setScope: (s: string) => {
      scope = s;
    },
    removeRefresh: () => {
      refreshToken = null;
    },
    failRefresh: (s: string) => {
      refreshFailure = s;
    },
    respond: (r: () => Response) => {
      response = r;
    },
  };
}

test("OAuth real gera consentimento offline com escopo correto, estado e PKCE", () => {
  const values = new Map([
    ["YOUTUBE_CLIENT_ID", CLIENT],
    ["YOUTUBE_CLIENT_SECRET", SECRET],
  ]);
  const service = new YouTubeOAuth({
    get: (k) => values.get(k),
    set: (k, v) => {
      if (v) values.set(k, v);
    },
    managed: () => false,
  });
  const login = service.begin("https://mapify.example.com");
  const url = new URL(login.url);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("client_id"), CLIENT);
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://mapify.example.com/api/youtube/oauth/callback",
  );
  assert.equal(url.searchParams.get("scope"), YOUTUBE_SCOPE);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  const pending = JSON.parse(values.get("YOUTUBE_OAUTH_PENDING")!);
  assert.equal(
    url.searchParams.get("code_challenge"),
    createHash("sha256").update(pending.verifier).digest("base64url"),
  );
  assert.ok(!JSON.stringify(pending).includes(url.searchParams.get("state")!));
  assert.ok(!login.url.includes(SECRET));
});

test("callback vincula navegador e estado, é de uso único e não expõe tokens", async () => {
  const f = fixture(),
    login = f.begin();
  await assert.rejects(
    f.service.complete("wrong-state", login.browser, "valid-code"),
    /outro navegador/,
  );
  await assert.rejects(
    f.service.complete(login.state, "wrong-browser", "valid-code"),
    /outro navegador/,
  );
  assert.equal(f.counts().exchanges, 0);
  await f.service.complete(login.state, login.browser, "valid-code");
  const status = f.service.status("https://mapify.example.com");
  assert.equal(status.connected, true);
  assert.equal(status.channel, "Canal de teste");
  assert.doesNotMatch(
    JSON.stringify(status),
    /access-secret|refresh-secret|client-secret/,
  );
  await assert.rejects(
    f.service.complete(login.state, login.browser, "valid-code"),
    /expirou/,
  );
  assert.equal(f.counts().exchanges, 1);
});

test("autorização expirada, cancelada ou sem escopo/acesso persistente não conecta", async () => {
  const expired = fixture(),
    first = expired.begin();
  expired.advance(601000);
  await assert.rejects(
    expired.service.complete(first.state, first.browser, "valid-code"),
    /expirou/,
  );
  assert.equal(expired.counts().exchanges, 0);
  const denied = fixture(),
    second = denied.begin();
  await assert.rejects(
    denied.service.complete(second.state, second.browser, "", true),
    /cancelada/,
  );
  assert.equal(denied.service.hasConnection(), false);
  assert.equal(denied.counts().exchanges, 0);
  const partial = fixture();
  partial.setScope("https://www.googleapis.com/auth/youtube.readonly");
  await assert.rejects(partial.connect(), /Autorize a permissão/);
  assert.equal(partial.service.hasConnection(), false);
  const ephemeral = fixture();
  ephemeral.removeRefresh();
  await assert.rejects(ephemeral.connect(), /persistente/);
});

test("erros do provedor são sanitizados e alteração do cliente invalida a tentativa", async () => {
  const f = fixture();
  f.failExchange();
  await assert.rejects(
    f.connect(),
    (error) =>
      error instanceof Error &&
      !error.message.includes(SECRET) &&
      /concluir/.test(error.message),
  );
  const g = fixture(),
    login = g.begin();
  assert.throws(
    () => g.service.configure("other.apps.googleusercontent.com", ""),
    /segredo/,
  );
  g.service.configure("other.apps.googleusercontent.com", "another-secret");
  await assert.rejects(
    g.service.complete(login.state, login.browser, "valid-code"),
    /expirou/,
  );
  assert.equal(g.counts().exchanges, 0);
});

test("renovação concorrente acontece uma vez, preserva refresh token e usa bearer", async () => {
  const f = fixture();
  await f.connect();
  f.advance(3600000);
  await Promise.all([f.service.test(), f.service.test()]);
  assert.equal(f.counts().refreshes, 1);
  assert.equal(
    JSON.parse(f.values.get("YOUTUBE_ACCOUNT")!).tokens.refresh_token,
    "refresh-secret",
  );
  assert.ok(
    f.requests
      .slice(1)
      .every((r) => r.authorization === "Bearer renewed-secret"),
  );
  assert.ok(f.requests.every((r) => !r.url.includes("secret")));
});

test("401 renova uma vez; quota e permissão são erros distintos sem repetição", async () => {
  const f = fixture();
  await f.connect();
  let calls = 0;
  f.respond(() =>
    ++calls === 1
      ? Response.json({}, { status: 401 })
      : Response.json({ items: [] }),
  );
  await f.service.api("captions?part=snippet&videoId=1QNsdr-Qx_I");
  assert.equal(calls, 2);
  assert.equal(f.counts().refreshes, 1);
  f.respond(() =>
    Response.json(
      { error: { errors: [{ reason: "quotaExceeded" }] } },
      { status: 403 },
    ),
  );
  await assert.rejects(f.service.api("captions?part=snippet"), /cota/);
  f.respond(() =>
    Response.json(
      { error: { errors: [{ reason: "forbidden" }] } },
      { status: 403 },
    ),
  );
  await assert.rejects(
    f.service.api("captions?part=snippet"),
    /permissão.*editar/,
  );
  f.respond(() =>
    Response.json(
      { error: { errors: [{ reason: "accessNotConfigured" }] } },
      { status: 403 },
    ),
  );
  await assert.rejects(f.service.test(), /Ative a YouTube Data API/);
  assert.equal(f.counts().refreshes, 1);
  f.respond(() => Response.json({}, { status: 401 }));
  await assert.rejects(f.service.test(), /Reconecte/);
  assert.equal(f.counts().refreshes, 2);
  assert.equal(f.service.status("https://mapify.example.com").reconnect, true);
});

test("revogação exige reconectar, erro transitório preserva autorização e desconectar limpa tokens", async () => {
  const f = fixture();
  await f.connect();
  f.advance(3600000);
  f.failRefresh("temporarily_unavailable");
  await assert.rejects(f.service.test(), /agora/);
  assert.equal(f.service.status("https://mapify.example.com").connected, true);
  f.failRefresh("invalid_grant");
  await assert.rejects(f.service.test(), /revogada/);
  assert.equal(f.service.status("https://mapify.example.com").reconnect, true);
  await f.service.disconnect();
  assert.equal(f.service.hasConnection(), false);
  assert.equal(f.values.has("YOUTUBE_OAUTH_PENDING"), false);
  assert.equal(f.counts().revocations, 1);
});

test("callback em andamento não restaura conexão após desconectar", async () => {
  const f = fixture();
  let release!: () => void;
  const original = f.port.exchange;
  f.port.exchange = async (code, verifier) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return original(code, verifier);
  };
  const login = f.begin();
  const completing = f.service.complete(
    login.state,
    login.browser,
    "valid-code",
  );
  await f.service.disconnect();
  release();
  await assert.rejects(completing, /cancelada/);
  assert.equal(f.service.hasConnection(), false);
});

test("legenda oficial escolhe português manual, preserva texto e timestamps", async () => {
  const paths: string[] = [];
  const result = await officialCaptions("1QNsdr-Qx_I", {
    api: async (path) => {
      paths.push(path);
      return path.startsWith("captions?")
        ? Response.json({
            items: [
              { id: "english", snippet: { language: "en", status: "serving" } },
              {
                id: "pt-auto",
                snippet: {
                  language: "pt",
                  trackKind: "ASR",
                  status: "serving",
                },
              },
              {
                id: "pt-manual",
                snippet: { language: "pt", status: "serving" },
              },
              { id: "draft", snippet: { language: "pt", isDraft: true } },
            ],
          })
        : new Response(srt);
    },
  });
  assert.equal(paths[1], "captions/pt-manual?tfmt=srt");
  assert.deepEqual(result, [
    { text, start: 1.25 },
    { text: "Outra ideia & aplicação.", start: 72 },
  ]);
  assert.throws(() => parseSrt("not subtitles"), /formato inválido/);
  await assert.rejects(
    officialCaptions("1QNsdr-Qx_I", {
      api: async () => Response.json({ items: [] }),
    }),
    /não tem legendas/,
  );
});

test("legenda grande é recusada e cancelamento interrompe o download", async () => {
  const api = {
    api: async (path: string) =>
      path.startsWith("captions?")
        ? Response.json({
            items: [{ id: "track", snippet: { language: "pt" } }],
          })
        : new Response("a".repeat(2000001)),
  };
  await assert.rejects(officialCaptions("1QNsdr-Qx_I", api), /tamanho/);
  await assert.rejects(
    officialCaptions("1QNsdr-Qx_I", api, AbortSignal.abort()),
    /abort/i,
  );
});

test("origem usa HTTPS do proxy e permite localhost para teste", () => {
  assert.equal(
    youtubeOrigin(
      new Request("http://localhost:10000/api/youtube", {
        headers: {
          "x-forwarded-host": "mapify.example.com",
          "x-forwarded-proto": "https",
        },
      }),
    ),
    "https://mapify.example.com",
  );
  assert.equal(
    youtubeOrigin(new Request("http://localhost:3021/api/youtube")),
    "http://localhost:3021",
  );
  assert.throws(
    () => youtubeOrigin(new Request("http://example.com/api/youtube")),
    /HTTPS/,
  );
});

test("fonte real usa a API oficial e configurações persistem cifradas", async () => {
  const { setConfig, abrirBanco } = await import("./store");
  setConfig("YOUTUBE_CLIENT_ID", CLIENT);
  setConfig("YOUTUBE_CLIENT_SECRET", SECRET);
  setConfig(
    "YOUTUBE_ACCOUNT",
    JSON.stringify({
      revision: "saved",
      clientId: CLIENT,
      channel: "Canal",
      tokens: {
        access_token: "access-secret",
        refresh_token: "refresh-secret",
        expiry_date: Date.now() + 3600000,
      },
    }),
  );
  const raw = abrirBanco().prepare("SELECT valor FROM config").all();
  assert.doesNotMatch(
    JSON.stringify(raw),
    /access-secret|refresh-secret|client-secret/,
  );
  const original = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    paths.push(url);
    if (url.includes("/oembed?"))
      return Response.json({ title: "Vídeo autorizado" });
    return url.includes("/captions?")
      ? Response.json({ items: [{ id: "track", snippet: { language: "pt" } }] })
      : new Response(srt);
  };
  try {
    const { youtubeSource } = await import("./sources");
    const source = await youtubeSource(
      "https://www.youtube.com/watch?v=1QNsdr-Qx_I",
    );
    assert.equal(source.title, "Vídeo autorizado");
    assert.equal(source.segments[0].seconds, 1);
    assert.match(source.segments[0].text, /Conhecimento organizado/);
    assert.ok(
      paths.some((p) => p.includes("www.googleapis.com/youtube/v3/captions")),
    );
  } finally {
    globalThis.fetch = original;
  }
});

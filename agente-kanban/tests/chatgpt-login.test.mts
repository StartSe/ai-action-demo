import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ChatGPTLoginManager } from "../lib/chatgpt-login";
import {
  CodexAuthClient,
  type AuthClient,
  type AuthMethod,
} from "../lib/codex-auth-client";

const device = {
  type: "chatgptDeviceCode",
  loginId: "login-123",
  userCode: "ABCD-1234",
  verificationUrl: "https://auth.openai.com/codex/device",
};

class FakeAuthClient implements AuthClient {
  onNotification: AuthClient["onNotification"] = () => {};
  onClose = () => {};
  calls: { method: AuthMethod; params: Record<string, unknown> }[] = [];
  closed = false;
  loggedIn = false;
  initialGate: Promise<void> = Promise.resolve();
  response: unknown = device;
  accountType = "chatgpt";
  async initialize() {
    await this.initialGate;
  }
  async request(method: AuthMethod, params: Record<string, unknown> = {}) {
    this.calls.push({ method, params });
    if (method === "account/login/start") return this.response;
    if (method === "account/read")
      return { account: this.loggedIn ? { type: this.accountType } : null };
    if (method === "account/logout") this.loggedIn = false;
    return {};
  }
  close() {
    this.closed = true;
    this.onClose();
  }
  complete(loginId = device.loginId, success = true) {
    this.onNotification("account/login/completed", { loginId, success });
  }
}
function setup(lifetime?: number) {
  const client = new FakeAuthClient();
  const manager = new ChatGPTLoginManager(
    () => client,
    () => client.loggedIn,
    lifetime,
  );
  return { client, manager };
}
async function eventually(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await delay(10);
  }
  assert.fail("The expected login state did not arrive");
}

test("device login starts once, resumes its code and verifies the matching completed account", async () => {
  const { manager, client } = setup();
  assert.equal(manager.status().phase, "idle");
  const [first, second] = await Promise.all([manager.start(), manager.start()]);
  assert.equal(first.phase, "waiting");
  assert.deepEqual(first, second);
  assert.equal(first.code, "ABCD-1234");
  assert.equal(first.url, device.verificationUrl);
  assert.equal(client.calls.length, 1);
  assert.deepEqual(await manager.start(), first);
  client.complete("another-login");
  assert.equal(manager.status().phase, "waiting");
  client.loggedIn = true;
  client.complete();
  await eventually(() => manager.status().phase === "connected");
  assert.deepEqual(manager.status(), { phase: "connected" });
  assert.equal(client.closed, true);
  assert.deepEqual(client.calls.at(-1), {
    method: "account/read",
    params: { refreshToken: false },
  });
});

test("cancellation clears a login completed just before the cancellation request", async () => {
  const { manager, client } = setup();
  await manager.start();
  client.loggedIn = true;
  const status = await manager.cancel();
  assert.equal(status.phase, "cancelled");
  assert.equal(status.code, undefined);
  assert.equal(client.loggedIn, false);
  assert.deepEqual(client.calls.slice(1), [
    { method: "account/login/cancel", params: { loginId: device.loginId } },
    { method: "account/logout", params: {} },
  ]);
  assert.equal(client.closed, true);
});

test("cancellation while initialization is pending cancels the resulting provider login", async () => {
  const { manager, client } = setup();
  let release!: () => void;
  client.initialGate = new Promise((resolve) => {
    release = resolve;
  });
  const starting = manager.start();
  const cancelling = manager.cancel();
  assert.equal(manager.status().phase, "cancelling");
  release();
  await starting;
  assert.equal((await cancelling).phase, "cancelled");
  assert.ok(
    client.calls.some(
      (call) =>
        call.method === "account/login/cancel" &&
        call.params.loginId === device.loginId,
    ),
  );
});

test("an expired code is cancelled and removed from status", async () => {
  const { manager, client } = setup(20);
  await manager.start();
  await eventually(() => manager.status().phase === "expired");
  assert.equal(manager.status().code, undefined);
  assert.equal(client.closed, true);
  assert.ok(client.calls.some((call) => call.method === "account/logout"));
});

test("an existing account does not start or cancel another login", async () => {
  const { manager, client } = setup();
  client.loggedIn = true;
  assert.equal((await manager.start()).phase, "connected");
  assert.equal((await manager.cancel()).phase, "connected");
  assert.deepEqual(client.calls, []);
});

test("a failed provider response is recoverable and never returns untrusted URLs or private errors", async () => {
  const { manager, client } = setup();
  client.response = {
    ...device,
    verificationUrl: "https://attacker.invalid/login?token=secret",
  };
  assert.equal((await manager.start()).phase, "error");
  assert.equal(manager.status().url, undefined);
  assert.ok(!JSON.stringify(manager.status()).includes("secret"));
  assert.equal(client.closed, true);

  const failed = setup();
  failed.client.initialGate = Promise.reject(
    new Error("secret-token-from-provider"),
  );
  assert.equal((await failed.manager.start()).phase, "error");
  assert.ok(!JSON.stringify(failed.manager.status()).includes("secret-token"));
});

test("provider interruption and rejected login remove the waiting code", async () => {
  for (const fail of [
    (client: FakeAuthClient) => client.onClose(),
    (client: FakeAuthClient) => client.complete(device.loginId, false),
  ]) {
    const { manager, client } = setup();
    await manager.start();
    fail(client);
    assert.equal(manager.status().phase, "error");
    assert.equal(manager.status().code, undefined);
    assert.equal(client.closed, true);
  }
});

test("a completion without a saved ChatGPT account is not reported as connected", async () => {
  const { manager, client } = setup();
  await manager.start();
  client.complete();
  await eventually(() => manager.status().phase === "error");
  assert.equal(manager.status().code, undefined);
  assert.equal(client.closed, true);
});

test(
  "the installed Codex account protocol initializes and reads an empty dedicated home without logging in",
  { timeout: 20000 },
  async (context) => {
    const directory = mkdtempSync(path.join(tmpdir(), "orbit-auth-protocol-"));
    const client = new CodexAuthClient(directory);
    context.after(() => {
      client.close();
      rmSync(directory, { recursive: true, force: true });
    });
    await client.initialize();
    const result = (await client.request("account/read", {
      refreshToken: false,
    })) as { account: unknown };
    assert.equal(result.account, null);
  },
);

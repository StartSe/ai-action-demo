import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'site-chatgpt-test-'));
const { ChatGPTBridge } = await import('../lib/chatgpt.ts');

test('ponte oficial envia referência ao ChatGPT e usa login de dispositivo', async () => {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  const requests = [];
  const send = (m) => child.stdout.write(JSON.stringify(m) + '\n');
  child.stdin.on('data', (bytes) => {
    for (const line of String(bytes).trim().split('\n')) {
      const m = JSON.parse(line); requests.push(m);
      if (!m.method || m.id === undefined) continue;
      let result = {};
      if (m.method === 'account/read') result = { account: { type: 'chatgpt', email: 'teste@example.com', planType: 'plus' } };
      if (m.method === 'account/login/start') result = { loginId: 'login-test', verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'TEST-1234' };
      if (m.method === 'thread/start') result = { thread: { id: 'thread-test' } };
      if (m.method === 'turn/start') result = { turn: { id: 'turn-test' } };
      queueMicrotask(() => {
        send({ id: m.id, result });
        if (m.method === 'turn/start') {
          send({ method: 'item/agentMessage/delta', params: { threadId: 'thread-test', delta: 'Referência analisada.' } });
          send({ method: 'turn/completed', params: { threadId: 'thread-test', turn: { status: 'completed' } } });
        }
      });
    }
  });
  const bridge = new ChatGPTBridge(() => child);
  const login = await bridge.beginLogin(); assert.equal(login.userCode, 'TEST-1234');
  assert.equal(requests.find((r) => r.method === 'account/login/start').params.type, 'chatgptDeviceCode');
  const imagem = 'data:image/png;base64,teste';
  assert.equal(await bridge.run({ system: 'Planeje este site', prompt: 'Use a referência', image: imagem }), 'Referência analisada.');
  assert.deepEqual(requests.find((r) => r.method === 'turn/start').params.input, [{ type: 'text', text: 'Use a referência' }, { type: 'image', url: imagem }]);
  const thread = requests.find((r) => r.method === 'thread/start').params;
  assert.equal(thread.sandbox, 'read-only'); assert.equal(thread.config['features.shell_tool'], false);
  child.emit('exit');
});

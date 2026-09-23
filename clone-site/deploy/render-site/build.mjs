// Executado exclusivamente no build de cada Static Site. Depois disso o Render serve todos os
// arquivos, sem consultas ao app. Não instala dependências nem executa o HTML do usuário.
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const url = new URL(process.env.SITE_RELEASE_URL || '');
if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Endereço do pacote inválido.');
const r = await fetch(url, { signal: AbortSignal.timeout(120000), redirect: 'error' });
if (!r.ok) throw new Error(`Não foi possível baixar a versão (${r.status}).`);
const dados = Buffer.from(await r.arrayBuffer());
if (createHash('sha256').update(dados).digest('hex') !== process.env.SITE_RELEASE_SHA256) throw new Error('A integridade do pacote não confere.');
const { arquivos } = JSON.parse(gunzipSync(dados, { maxOutputLength: 64 * 1024 * 1024 }).toString('utf8'));
if (!arquivos || typeof arquivos['index.html'] !== 'string') throw new Error('Pacote sem página inicial.');
await rm('public', { recursive: true, force: true });
for (const [nome, base64] of Object.entries(arquivos)) {
  if (!(nome === 'index.html' || /^assets\/[A-Za-z0-9_-]+\.(png|jpg|webp|svg|bin)$/.test(nome)) || typeof base64 !== 'string') throw new Error('Arquivo inválido no pacote.');
  const destino = join('public', nome);
  await mkdir(dirname(destino), { recursive: true });
  await writeFile(destino, Buffer.from(base64, 'base64'));
}
console.log('Versão e imagens prontas para publicação.');

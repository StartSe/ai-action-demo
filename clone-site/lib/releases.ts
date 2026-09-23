// Pacote imutável: somente HTML e imagens da versão aprovada. O identificador aleatório é uma
// capacidade de leitura restrita a este pacote, usada pelo build do serviço independente no Render.
import crypto from "node:crypto";
import { gzipSync } from "node:zlib";
import { abrirBanco } from "./store";
import { arquivosDaPublicacao } from "./netlify";

type Release = { id: string; projetoId: string; versao: number; sha256: string; dados: Uint8Array };
function db() {
  const d = abrirBanco();
  d.exec(`CREATE TABLE IF NOT EXISTS releases (
    id TEXT PRIMARY KEY, projetoId TEXT NOT NULL, versao INTEGER NOT NULL,
    sha256 TEXT NOT NULL, dados BLOB NOT NULL, UNIQUE(projetoId, versao)
  )`);
  return d;
}
export function prepararRelease(projetoId: string, versao: number, html: string): Release {
  const d = db();
  const anterior = d.prepare("SELECT * FROM releases WHERE projetoId = ? AND versao = ?").get(projetoId, versao) as Release | undefined;
  if (anterior) return anterior;
  const arquivos = Object.fromEntries([...arquivosDaPublicacao(projetoId, html)].map(([caminho, dados]) => [caminho.slice(1), dados.toString("base64")]));
  const dados = gzipSync(Buffer.from(JSON.stringify({ arquivos })), { level: 9 });
  const release = { id: crypto.randomBytes(32).toString("hex"), projetoId, versao, sha256: crypto.createHash("sha256").update(dados).digest("hex"), dados };
  d.prepare("INSERT INTO releases (id, projetoId, versao, sha256, dados) VALUES (?, ?, ?, ?, ?)").run(release.id, projetoId, versao, release.sha256, dados);
  return release;
}
export function obterRelease(id: string): Release | null {
  if (!/^[a-f0-9]{64}$/.test(id)) return null;
  return db().prepare("SELECT * FROM releases WHERE id = ?").get(id) as Release | undefined ?? null;
}
export function apagarReleases(projetoId: string) {
  db().prepare("DELETE FROM releases WHERE projetoId = ?").run(projetoId);
}

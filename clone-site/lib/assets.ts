// Logo e imagens do cliente, por site. Ficam no mesmo app.sqlite (tabela `assets`, base64) e são servidas
// em /s/<projetoId>/a/<assetId> (público, cache de 1 h) — um endereço absoluto que funciona na prévia
// (srcDoc), no link /s/<slug> e no domínio próprio. O gerador e o agente recebem a lista pelo bloco
// "Imagens da empresa" (montarBlocoAssets) e referenciam esses endereços com <img>.
import crypto from "node:crypto";
import { ErroDePedido } from "./gerador";
import { abrirBanco } from "./store";

export type PapelAsset = "logo" | "imagem";
export type Asset = { id: string; projetoId: string; papel: PapelAsset; nome: string; mime: string; tamanho: number; descricao: string; criadoEm: string; url: string };

export const LIMITE_ASSET_BYTES = 2 * 1024 * 1024;
export const LIMITE_ASSETS_POR_SITE = 12;
const MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

let tabelaPronta = false;
function db() {
  const d = abrirBanco();
  if (!tabelaPronta) {
    d.exec(`CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      projetoId TEXT NOT NULL,
      papel TEXT NOT NULL,
      nome TEXT NOT NULL,
      mime TEXT NOT NULL,
      tamanho INTEGER NOT NULL,
      dados TEXT NOT NULL,
      descricao TEXT NOT NULL DEFAULT '',
      criadoEm TEXT NOT NULL
    )`);
    d.exec(`CREATE INDEX IF NOT EXISTS assets_projeto ON assets (projetoId, criadoEm)`);
    tabelaPronta = true;
  }
  return d;
}

type Linha = { id: string; projetoId: string; papel: PapelAsset; nome: string; mime: string; tamanho: number; descricao: string; criadoEm: string };
const COLUNAS = "id, projetoId, papel, nome, mime, tamanho, descricao, criadoEm";

export function urlDoAsset(projetoId: string, assetId: string): string {
  return `/s/${projetoId}/a/${assetId}`;
}

function paraAsset(l: Linha): Asset {
  return { ...l, url: urlDoAsset(l.projetoId, l.id) };
}

/** Reconhece o formato pelos primeiros bytes (PNG, JPG, WEBP) ou pelo texto (SVG sem script), nunca só pelo cabeçalho enviado. */
export function detectarMime(buffer: Buffer): string | null {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  const inicio = buffer.subarray(0, 2048).toString("utf8").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(inicio)) {
    const texto = buffer.toString("utf8");
    // Um SVG com script ou evento nunca entra: mesmo servido com CSP restrita, não vale o risco.
    if (/<script\b|\bon[a-z]+\s*=|javascript:|<foreignObject\b|<iframe\b|<embed\b|<object\b/i.test(texto)) return null;
    return "image/svg+xml";
  }
  return null;
}

/** Grava um asset. PNG, JPG, WEBP ou SVG; até 2 MB; até 12 por site; um só logo (o novo substitui o anterior). */
export function adicionar(projetoId: string, { papel, nome, buffer, descricao }: { papel: unknown; nome: unknown; buffer: Buffer; descricao?: unknown }): Asset {
  const papelValido: PapelAsset = papel === "logo" ? "logo" : "imagem";
  if (buffer.byteLength === 0) throw new ErroDePedido("O arquivo enviado está vazio.");
  if (buffer.byteLength > LIMITE_ASSET_BYTES) throw new ErroDePedido("A imagem passa de 2 MB. Reduza e envie de novo.");
  const mime = detectarMime(buffer);
  if (!mime || !MIMES.has(mime)) throw new ErroDePedido("Envie uma imagem PNG, JPG, WEBP ou SVG (sem script).");
  const total = (db().prepare("SELECT COUNT(*) AS n FROM assets WHERE projetoId = ? AND papel = 'imagem'").get(projetoId) as { n: number }).n;
  if (papelValido === "imagem" && total >= LIMITE_ASSETS_POR_SITE) throw new ErroDePedido(`Cada site aceita até ${LIMITE_ASSETS_POR_SITE} imagens. Apague alguma para enviar outra.`);
  if (papelValido === "logo") db().prepare("DELETE FROM assets WHERE projetoId = ? AND papel = 'logo'").run(projetoId);
  const id = crypto.randomBytes(9).toString("base64url");
  const nomeLimpo = (typeof nome === "string" && nome.trim() ? nome.trim() : papelValido === "logo" ? "logo" : "imagem").slice(0, 120);
  const descricaoLimpa = (typeof descricao === "string" ? descricao.trim() : "").slice(0, 200);
  db().prepare("INSERT INTO assets (id, projetoId, papel, nome, mime, tamanho, dados, descricao, criadoEm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, projetoId, papelValido, nomeLimpo, mime, buffer.byteLength, buffer.toString("base64"), descricaoLimpa, new Date().toISOString());
  return obter(id)!;
}

export function listar(projetoId: string): Asset[] {
  const linhas = db().prepare(`SELECT ${COLUNAS} FROM assets WHERE projetoId = ? ORDER BY CASE papel WHEN 'logo' THEN 0 ELSE 1 END, criadoEm`).all(projetoId) as Linha[];
  return linhas.map(paraAsset);
}

export function obter(id: string): Asset | null {
  const l = db().prepare(`SELECT ${COLUNAS} FROM assets WHERE id = ?`).get(id) as Linha | undefined;
  return l ? paraAsset(l) : null;
}

/** O conteúdo do arquivo, só para a rota pública que o serve. */
export function conteudo(projetoId: string, id: string): { mime: string; dados: Buffer } | null {
  const l = db().prepare("SELECT mime, dados FROM assets WHERE id = ? AND projetoId = ?").get(id, projetoId) as { mime: string; dados: string } | undefined;
  return l ? { mime: l.mime, dados: Buffer.from(l.dados, "base64") } : null;
}

export function apagar(projetoId: string, id: string): boolean {
  const { changes } = db().prepare("DELETE FROM assets WHERE id = ? AND projetoId = ?").run(id, projetoId);
  return Number(changes) > 0;
}

export function apagarDoProjeto(projetoId: string): void {
  db().prepare("DELETE FROM assets WHERE projetoId = ?").run(projetoId);
}

/**
 * O bloco "Imagens da empresa" que acompanha os prompts de geração e edição: papel, descrição e endereço
 * absoluto de cada asset, mais a regra de uso. String vazia quando o site não tem imagens.
 */
export function montarBlocoAssets(projetoId: string): string {
  const assets = listar(projetoId);
  if (!assets.length) return "";
  const linhas = assets.map((a) => `- ${a.papel === "logo" ? "Logo da empresa" : "Imagem"}: ${a.url}${a.descricao ? ` — ${a.descricao}` : ""}${a.mime === "image/svg+xml" ? " (SVG, escala sem perder qualidade)" : ""}`);
  return `Imagens da empresa (use exatamente estes endereços em <img src="...">, com alt em português):
${linhas.join("\n")}
Regras: use o logo no cabeçalho (altura entre 32 e 48 px, largura automática) e no rodapé, com alt igual ao nome da marca; use as imagens onde a referência tinha fotos, com object-fit: cover (ou classe object-cover) e o tamanho do bloco original; onde faltar imagem, continue com o bloco na cor da marca. Nunca invente endereços de imagem além destes.`;
}

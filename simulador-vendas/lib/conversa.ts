// Conversão de uma conversa colada em texto (uma fala por linha, "Vendedor: ..." ou "Cliente: ...")
// para o formato estruturado (LinhaTranscricao[]) usado pela análise. Arquivo puro (sem node:*):
// pode ser chamado tanto do painel (para validar antes de enviar) quanto do servidor.
import type { LinhaTranscricao } from "./types";

const PREFIXOS_VENDEDOR = ["vendedor", "vendedora", "eu"];
const PREFIXOS_CLIENTE = ["cliente"];

function normalizar(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** "Vendedor: Bom dia..." vira {papel:"vendedor", texto:"Bom dia..."}; linhas sem um prefixo reconhecido são ignoradas. */
export function parseConversaColada(bruto: string): LinhaTranscricao[] {
  const linhas: LinhaTranscricao[] = [];
  for (const linhaBruta of bruto.split("\n")) {
    const linha = linhaBruta.trim();
    if (!linha) continue;
    const i = linha.indexOf(":");
    if (i < 0) continue;
    const prefixo = normalizar(linha.slice(0, i));
    const texto = linha.slice(i + 1).trim();
    if (!texto) continue;
    if (PREFIXOS_VENDEDOR.includes(prefixo)) linhas.push({ papel: "vendedor", texto });
    else if (PREFIXOS_CLIENTE.includes(prefixo)) linhas.push({ papel: "cliente", texto });
  }
  return linhas;
}

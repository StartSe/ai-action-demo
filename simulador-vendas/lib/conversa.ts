// Conversão de uma conversa colada em texto (uma fala por linha, "Vendedor: ..." ou "Cliente: ...")
// para o formato estruturado (LinhaTranscricao[]) usado pela análise. Arquivo puro (sem node:*):
// pode ser chamado tanto do painel (para validar antes de enviar) quanto do servidor.
//
// Além do formato canônico, aceita o que as ferramentas de gravação costumam produzir: "Atendente",
// "Comprador", "Falante 1/2" (e "Speaker 1/2") e carimbos de tempo antes do nome ("[00:12] Vendedor:",
// "00:12 Cliente:", "(1:03) Vendedor:"). Uma linha sem prefixo reconhecido continua sendo ignorada —
// quem avisa a pessoa de que nada foi reconhecido é a rota (app/api/analisar/route.ts), olhando o
// resultado desta função.
import type { LinhaTranscricao } from "./types";

const PREFIXOS_VENDEDOR = ["vendedor", "vendedora", "eu", "atendente", "consultor", "consultora", "representante", "falante 1", "speaker 1", "pessoa 1"];
const PREFIXOS_CLIENTE = ["cliente", "comprador", "compradora", "prospecto", "falante 2", "speaker 2", "pessoa 2"];

/** Carimbo de tempo no começo da linha: "[00:12]", "(1:03)", "00:12:45", "12:03 -" e afins. */
const CARIMBO_INICIAL = /^\s*[[(<]?\s*\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?\s*[\])>]?\s*(?:[-–—]\s*)?/;

/** Sufixo de sistema depois do nome: "Vendedor (00:12):", "Cliente [2]:", "Falante 1 - 00:12:". */
const SUFIXO_RUIDO = /[([<-][^)\]>]*[)\]>]?\s*$/;

function normalizar(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/** "Falante 1 (00:12)" -> "falante 1"; devolve o papel do prefixo, ou null quando não reconhece. */
function papelDoPrefixo(bruto: string): LinhaTranscricao["papel"] | null {
  const candidatos = [normalizar(bruto), normalizar(bruto.replace(SUFIXO_RUIDO, ""))];
  for (const candidato of candidatos) {
    if (!candidato) continue;
    if (PREFIXOS_VENDEDOR.includes(candidato)) return "vendedor";
    if (PREFIXOS_CLIENTE.includes(candidato)) return "cliente";
  }
  return null;
}

/** "Vendedor: Bom dia..." vira {papel:"vendedor", texto:"Bom dia..."}; linhas sem um prefixo reconhecido são ignoradas. */
export function parseConversaColada(bruto: string): LinhaTranscricao[] {
  const linhas: LinhaTranscricao[] = [];
  for (const linhaBruta of bruto.split("\n")) {
    const linha = linhaBruta.replace(CARIMBO_INICIAL, "").trim();
    if (!linha) continue;
    const i = linha.indexOf(":");
    if (i < 0) continue;
    const papel = papelDoPrefixo(linha.slice(0, i));
    if (!papel) continue;
    const texto = linha.slice(i + 1).trim();
    if (!texto) continue;
    linhas.push({ papel, texto });
  }
  return linhas;
}

/** Frase única mostrada quando nenhuma linha foi reconhecida (rota e painel usam a mesma). */
export const AVISO_SEM_FALAS = 'Não reconheci nenhuma fala. Comece cada linha com "Vendedor:" ou "Cliente:".';

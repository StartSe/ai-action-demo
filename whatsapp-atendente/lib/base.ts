// Base de perguntas e respostas aprovadas pela equipe (via "Aprovar"/"Corrigir" no simulador e nas
// conversas), persistida em SQLite numa única chave. Diferente de `config.baseConhecimento` (texto
// livre editado no formulário), aqui cada item é um par { pergunta, resposta } já validado por alguém.
import { getConfig as getStoreConfig, setConfig as setStoreConfig } from "./store";

const CHAVE = "ATENDENTE_BASE";

export interface ParBase {
  pergunta: string;
  resposta: string;
}

function normalizar(texto: string): string {
  return texto.trim().toLowerCase();
}

export function listarBase(): ParBase[] {
  const bruto = getStoreConfig(CHAVE);
  if (!bruto) return [];
  try {
    return JSON.parse(bruto) as ParBase[];
  } catch (err) {
    console.error("Falha ao ler a base de respostas aprovadas", err);
    return [];
  }
}

/** Aprova (ou corrige) um par pergunta/resposta: substitui o par já existente com a mesma pergunta, senão adiciona. */
export function aprovarPar({ pergunta, resposta }: ParBase): ParBase[] {
  const lista = listarBase();
  const indice = lista.findIndex((p) => normalizar(p.pergunta) === normalizar(pergunta));
  if (indice > -1) lista[indice] = { pergunta, resposta };
  else lista.push({ pergunta, resposta });
  setStoreConfig(CHAVE, JSON.stringify(lista));
  return lista;
}

/** Formata a base aprovada como um bloco de perguntas frequentes, para somar ao texto livre da configuração. */
export function baseAprovadaComoTexto(): string {
  const pares = listarBase();
  if (pares.length === 0) return "";
  return pares.map((p) => `${p.pergunta} ${p.resposta}`).join("\n\n");
}

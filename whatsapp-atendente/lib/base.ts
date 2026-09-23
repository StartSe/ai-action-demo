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

const IGNORAR = new Set("a o as os um uma de da do das dos em no na nos nas para por com que qual quais como quanto quando onde e eu voce vocês meu minha tem ser se isso esse essa sobre ola oi bom boa dia tarde noite".split(" "));

/** As palavras que valem numa comparação (sem acento, sem pontuação, sem as palavras de ligação). */
function palavras(texto: string): string[] {
  return (
    texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .match(/[a-z0-9]{3,}/g)
      ?.filter((t) => !IGNORAR.has(t)) ?? []
  );
}

/**
 * As respostas aprovadas que têm a ver com a pergunta do cliente, para o bloco "Por que respondeu
 * assim" dizer que a resposta pode ter vindo delas. A comparação é por palavras em comum (metade das
 * palavras da pergunta, no mínimo uma), a mesma técnica de lib/demo.ts:respostaLocal — a base aprovada
 * vai INTEIRA para o prompt, então isto é uma pista honesta do que casou, não uma medição do modelo.
 */
export function baseAprovadaRelevante(pergunta: string): ParBase[] {
  const termos = palavras(pergunta);
  if (termos.length === 0) return [];
  const minimo = Math.max(1, Math.ceil(termos.length * 0.5));
  return listarBase()
    .map((par) => {
      const doPar = new Set(palavras(`${par.pergunta} ${par.resposta}`));
      return { par, casou: termos.filter((t) => doPar.has(t)).length };
    })
    .filter((x) => x.casou >= minimo)
    .sort((a, b) => b.casou - a.casou)
    .map((x) => x.par);
}

/** Formata a base aprovada como um bloco de perguntas frequentes, para somar ao texto livre da configuração. */
export function baseAprovadaComoTexto(): string {
  const pares = listarBase();
  if (pares.length === 0) return "";
  return pares.map((p) => `${p.pergunta} ${p.resposta}`).join("\n\n");
}

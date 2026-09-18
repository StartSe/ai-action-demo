// A cultura da empresa: o que ela valoriza, cadastrado UMA vez em Configurações e reaproveitado por
// toda vaga (US-003). É o que permite a entrevistadora perguntar sobre cultura com os mesmos
// critérios em toda entrevista, sem a pessoa de RH redigitar valores a cada vaga aberta.
//
// Guardado como um JSON só, sob a chave `CULTURA_EMPRESA` de lib/store.ts, e não numa tabela nova:
// é um registro único por instalação (nunca uma lista), exatamente a forma para a qual `config` foi
// feita. Enquanto nada foi salvo, `obterCultura()` devolve a cultura de exemplo de lib/demo.ts com
// `exemplo: true` — as telas nunca ficam sem material para mostrar, mas sabem dizer que aquilo ainda
// é um exemplo.
//
// Server-only: importa lib/store.ts (node:sqlite).
import crypto from "node:crypto";
import { culturaDemo } from "./demo";
import { getConfig, setConfig } from "./store";

export const CHAVE_CULTURA = "CULTURA_EMPRESA";

/** Tetos, aplicados aqui (no módulo que grava) e não na rota: valem para a tela, para a IA e para qualquer porta que venha depois. */
export const MAX_VALORES = 6;
export const LIMITE_NOME = 40;
export const LIMITE_DESCRICAO = 200;
export const LIMITE_TEXTO = 1000;

export type ValorCultura = { id: string; nome: string; descricao: string };

export type Cultura = {
  valores: ValorCultura[];
  /** O que se espera no dia a dia. */
  comportamentos: string;
  /** O que não funciona aqui. */
  naoCombina: string;
  atualizadoEm: string;
};

/** A cultura como as telas a recebem: `exemplo: true` enquanto ninguém salvou a da própria empresa. */
export type CulturaEmUso = Cultura & { exemplo: boolean };

export type Validacao = { ok: true; cultura: Cultura } | { ok: false; erro: string };

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

/** Uma linha: quebras de linha viram espaço para o nome do valor não virar um parágrafo. */
function linha(valor: unknown): string {
  return texto(valor).replace(/\s+/g, " ");
}

function idDoValor(bruto: unknown): string {
  const atual = texto(bruto);
  if (atual && /^[a-z0-9-]{1,40}$/i.test(atual)) return atual;
  return crypto.randomUUID().slice(0, 8);
}

function cortar(valor: string, limite: number): string {
  return valor.length > limite ? `${valor.slice(0, limite - 1).trimEnd()}…` : valor;
}

function listaBruta(valor: unknown): Record<string, unknown>[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === "object");
}

/**
 * Valida o que uma PESSOA digitou: estourar um teto é erro, com a frase que a tela mostra.
 * Valores sem nome são descartados em silêncio (é a linha em branco que sobrou do formulário),
 * mas um nome longo demais é um aviso de verdade — a pessoa precisa saber que precisa encurtar.
 */
export function validarCultura(bruto: unknown): Validacao {
  const dados = (bruto ?? {}) as Record<string, unknown>;
  const valores: ValorCultura[] = [];
  for (const item of listaBruta(dados.valores)) {
    const nome = linha(item.nome);
    const descricao = linha(item.descricao);
    if (!nome && !descricao) continue;
    if (!nome) return { ok: false, erro: "Dê um nome curto a cada valor, ou apague a linha em branco." };
    if (nome.length > LIMITE_NOME) return { ok: false, erro: `O nome de um valor pode ter até ${LIMITE_NOME} caracteres. Encurte "${cortar(nome, 24)}".` };
    if (descricao.length > LIMITE_DESCRICAO) return { ok: false, erro: `A frase de "${nome}" pode ter até ${LIMITE_DESCRICAO} caracteres. Deixe uma frase só.` };
    valores.push({ id: idDoValor(item.id), nome, descricao });
  }
  if (valores.length > MAX_VALORES) return { ok: false, erro: `Escolha no máximo ${MAX_VALORES} valores. Mais do que isso e nenhum deles pesa na avaliação.` };

  const comportamentos = texto(dados.comportamentos);
  const naoCombina = texto(dados.naoCombina);
  if (comportamentos.length > LIMITE_TEXTO) return { ok: false, erro: `O texto do dia a dia pode ter até ${LIMITE_TEXTO} caracteres.` };
  if (naoCombina.length > LIMITE_TEXTO) return { ok: false, erro: `O texto sobre o que não funciona pode ter até ${LIMITE_TEXTO} caracteres.` };

  return { ok: true, cultura: { valores, comportamentos, naoCombina, atualizadoEm: new Date().toISOString() } };
}

/**
 * Normaliza o que a IA devolveu: aqui o excesso é CORTADO, nunca recusado. Um texto comprido demais
 * vindo do modelo é material para o gestor revisar, não um erro para ele resolver — o contrário de
 * `validarCultura`, que fala com quem digitou.
 */
export function normalizarCultura(bruto: unknown): Cultura {
  const dados = (bruto ?? {}) as Record<string, unknown>;
  const valores = listaBruta(dados.valores)
    .map((item) => ({ id: idDoValor(item.id), nome: cortar(linha(item.nome), LIMITE_NOME), descricao: cortar(linha(item.descricao), LIMITE_DESCRICAO) }))
    .filter((v) => Boolean(v.nome))
    .slice(0, MAX_VALORES);
  return {
    valores,
    comportamentos: cortar(texto(dados.comportamentos), LIMITE_TEXTO),
    naoCombina: cortar(texto(dados.naoCombina), LIMITE_TEXTO),
    atualizadoEm: new Date().toISOString(),
  };
}

/** Um formulário salvo em branco é a mesma coisa que nunca ter salvo nada — e volta a valer a cultura de exemplo. */
function culturaVazia(c: Cultura): boolean {
  return c.valores.length === 0 && !c.comportamentos && !c.naoCombina;
}

/**
 * A cultura salva, ou `null` enquanto ninguém salvou nenhuma. Lê pelo caminho que CORTA (e nunca
 * recusa): um valor gravado por uma versão anterior com um teto mais folgado continua abrindo, só
 * encurtado — o contrário deixaria a empresa sem cultura nenhuma por causa de um caractere a mais.
 */
export function culturaSalva(): Cultura | null {
  const cru = getConfig(CHAVE_CULTURA);
  if (!cru) return null;
  try {
    const dados = (JSON.parse(cru) ?? {}) as Record<string, unknown>;
    const cultura = normalizarCultura(dados);
    if (culturaVazia(cultura)) return null;
    return { ...cultura, atualizadoEm: texto(dados.atualizadoEm) || cultura.atualizadoEm };
  } catch (err) {
    console.error("Não foi possível ler a cultura salva; vale a de exemplo.", err);
    return null;
  }
}

/** A cultura que vale agora: a da empresa quando existe, senão a de exemplo marcada como tal. */
export function obterCultura(): CulturaEmUso {
  const salva = culturaSalva();
  if (salva) return { ...salva, exemplo: false };
  return { ...culturaDemo(), exemplo: true };
}

/** Salvar tudo em branco apaga a chave: volta a valer a cultura de exemplo, sem deixar um registro vazio no lugar. */
export function salvarCultura(cultura: Cultura): CulturaEmUso {
  if (culturaVazia(cultura)) {
    setConfig(CHAVE_CULTURA, null);
    return { ...culturaDemo(), exemplo: true };
  }
  setConfig(CHAVE_CULTURA, JSON.stringify(cultura));
  return { ...cultura, exemplo: false };
}

/** Alimenta `integrations.cultura` de "/api/status": a tela inicial e a vaga nova avisam quando ainda não há cultura própria. */
export function culturaConfigurada(): boolean {
  return culturaSalva() !== null;
}

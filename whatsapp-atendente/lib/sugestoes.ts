// Formulário interno para a equipe alimentar a base de conhecimento sem editar texto corrido:
// um link permanente (/f/<código>) com pergunta/resposta/categoria, que aparece em "Sugestões da
// equipe" no painel até alguém aprovar (entra em lib/base.ts) ou descartar. Próprio deste app
// (não replicado): reaproveita a infraestrutura de formulários públicos de lib/formularios.ts,
// mesmo espírito da caixa de entrada pública do agente-kanban (US-057), mas sem processar sozinho
// no envio — a decisão de aprovar/descartar é sempre manual.
import { aprovarPar } from "./base";
import { criar, listarRespostas, type CampoFormulario, type ParametrosPublicos } from "./formularios";
import { getConfig, setConfig } from "./store";

export const TIPO_SUGESTAO = "sugestao-base";

const CAMPOS_SUGESTAO: CampoFormulario[] = [
  { chave: "pergunta", rotulo: "Pergunta do cliente", tipo: "texto", obrigatorio: true },
  { chave: "resposta", rotulo: "Resposta correta", tipo: "textarea", obrigatorio: true },
  { chave: "categoria", rotulo: "Categoria", tipo: "texto" },
];

const CHAVE_CODIGO = "SUGESTOES_BASE_CODIGO";
const CHAVE_TRATADAS = "SUGESTOES_BASE_TRATADAS";

export type DadosSugestao = { pergunta: string; resposta: string; categoria?: string };
export type Sugestao = { id: string; pergunta: string; resposta: string; categoria: string; criadoEm: string };

export function linkExistente(): string | null {
  return getConfig(CHAVE_CODIGO) || null;
}

/** Cria o link único desta instância (idempotente: se já existir, devolve o código já gerado). */
export function criarLink(): string {
  const existente = linkExistente();
  if (existente) return existente;
  const parametros: ParametrosPublicos = {
    marca: "W",
    nome: "Atendente no WhatsApp",
    titulo: "Sugerir uma resposta para a base",
    descricao: "Viu o cliente perguntar algo que o atendente não sabia responder bem? Registre aqui a pergunta e a resposta certa.",
  };
  const codigo = criar({ tipo: TIPO_SUGESTAO, campos: CAMPOS_SUGESTAO, parametros });
  setConfig(CHAVE_CODIGO, codigo);
  return codigo;
}

function idsTratados(): Set<string> {
  const bruto = getConfig(CHAVE_TRATADAS);
  if (!bruto) return new Set();
  try {
    return new Set(JSON.parse(bruto) as string[]);
  } catch {
    return new Set();
  }
}

function marcarTratada(id: string): void {
  const ids = idsTratados();
  ids.add(id);
  setConfig(CHAVE_TRATADAS, JSON.stringify([...ids]));
}

/** Sugestões enviadas pela equipe que ainda não foram aprovadas nem descartadas, mais recentes primeiro. */
export function sugestoesPendentes(): Sugestao[] {
  const codigo = linkExistente();
  if (!codigo) return [];
  const tratadas = idsTratados();
  return listarRespostas<DadosSugestao>(codigo)
    .filter((r) => !tratadas.has(r.id))
    .map((r) => ({ id: r.id, pergunta: r.dados.pergunta, resposta: r.dados.resposta, categoria: r.dados.categoria || "", criadoEm: r.criadoEm }));
}

/** Aprova a sugestão: grava o par na base de respostas aprovadas e some da lista de pendentes. */
export function aprovarSugestao(id: string): { ok: true } | { ok: false } {
  const codigo = linkExistente();
  if (!codigo) return { ok: false };
  const sugestao = listarRespostas<DadosSugestao>(codigo).find((r) => r.id === id);
  if (!sugestao) return { ok: false };
  aprovarPar({ pergunta: sugestao.dados.pergunta, resposta: sugestao.dados.resposta });
  marcarTratada(id);
  return { ok: true };
}

/** Descarta a sugestão sem gravar nada na base. */
export function descartarSugestao(id: string): { ok: true } | { ok: false } {
  const codigo = linkExistente();
  if (!codigo) return { ok: false };
  const existe = listarRespostas<DadosSugestao>(codigo).some((r) => r.id === id);
  if (!existe) return { ok: false };
  marcarTratada(id);
  return { ok: true };
}

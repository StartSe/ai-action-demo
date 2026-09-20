import type { ContextoAssessment, Questionario } from "./types";
export function validarQuestionario(valor: unknown): valor is Questionario {
  if (!valor || typeof valor !== "object") return false;
  const q = valor as Questionario;
  if (typeof q.titulo !== "string" || !q.titulo.trim() || q.titulo.length > 200 || !Array.isArray(q.dimensoes) || !q.dimensoes.length || q.dimensoes.length > 12 || !Array.isArray(q.perguntas) || !q.perguntas.length || q.perguntas.length > 100) return false;
  const seguro = (id: unknown) => typeof id === "string" && /^[\w-]{1,100}$/.test(id) && !["__proto__", "constructor", "prototype", "area", "cargo"].includes(id);
  if (q.dimensoes.some(d => !d || !seguro(d.id) || typeof d.nome !== "string" || !d.nome.trim() || d.nome.length > 100)) return false;
  if (new Set(q.dimensoes.map(d=>d.id)).size !== q.dimensoes.length || new Set(q.dimensoes.map(d=>d.nome)).size !== q.dimensoes.length) return false;
  if (new Set(q.perguntas.map(p=>p?.id)).size !== q.perguntas.length) return false;
  return q.perguntas.every(p => p && seguro(p.id) && typeof p.texto === "string" && p.texto.trim().length > 0 && p.texto.length <= 2000 && q.dimensoes.some(d=>d.nome === p.dimensao) && ["escala","texto","escolha"].includes(p.tipo) && (p.tipo !== "escolha" || (Array.isArray(p.opcoes) && p.opcoes.length >= 2 && p.opcoes.length <= 20 && new Set(p.opcoes.map(o=>o?.valor)).size === p.opcoes.length && p.opcoes.every(o=>o && typeof o.valor === "string" && o.valor.length > 0 && o.valor.length <= 100 && typeof o.rotulo === "string" && o.rotulo.trim().length > 0 && o.rotulo.length <= 300))));
}
export function validarAdaptacao(valor: unknown, original: Questionario): valor is Questionario {
  if (!validarQuestionario(valor)) return false;
  return valor.dimensoes.length === original.dimensoes.length && original.dimensoes.every(d=>valor.dimensoes.some(v=>v.id===d.id && v.nome===d.nome)) && valor.perguntas.length===original.perguntas.length && original.perguntas.every(p=>valor.perguntas.some(v=>v.id===p.id && v.tipo===p.tipo && v.dimensao===p.dimensao));
}
export function lerContexto(corpo: Record<string, unknown>): ContextoAssessment {
  const grupoTipo = corpo.grupoTipo ?? "empresa";
  if (grupoTipo !== "empresa" && grupoTipo !== "area") throw new Error("Escolha empresa ou área para o grupo.");
  const texto = (key: string, max: number) => {const v=corpo[key]; if(v===undefined||v===null)return "";if(typeof v!=="string"||v.length>max)throw new Error(`Revise o campo ${key}.`);return v.trim();};
  const grupoNome = texto("grupoNome", 120);
  if (grupoTipo === "area" && !grupoNome) throw new Error("Informe o nome da área.");
  const participantes = corpo.participantes;
  if (participantes !== undefined && participantes !== null && (!Number.isInteger(participantes) || Number(participantes) < 1 || Number(participantes) > 100000)) throw new Error("A meta de participantes deve ser um número inteiro entre 1 e 100.000.");
  return { grupoTipo, grupoNome: grupoTipo === "area" ? grupoNome : "", participantes: participantes == null ? undefined : Number(participantes), objetivo: texto("objetivo",1000), setor:texto("setor",150), porte:texto("porte",100) };
}

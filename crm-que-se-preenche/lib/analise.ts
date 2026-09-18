// O motor: lê a transcrição de uma reunião e propõe uma atualização do negócio —
// nunca aplica sozinho. Cada campo proposto cita o trecho exato da transcrição que
// o sustenta; sem trecho, o campo some da proposta (null), nunca é estimado.
import { aiEnabled, askJSON, meta } from "./ai";
import { esperar, propostaDemo } from "./demo";
import { ETAPAS } from "./types";
import type { Negocio, Proposta } from "./types";

const SYSTEM_ANALISE = `Você analisa a transcrição de uma reunião de vendas e propõe uma atualização para o negócio no CRM, sem aplicar nada sozinho.

Regras rígidas:
- Só proponha um campo quando houver EVIDÊNCIA CLARA na transcrição. Cite o TRECHO exato (recorte literal, até 200 caracteres) que sustenta a proposta.
- Sem evidência clara para um campo, devolva esse campo como null. NUNCA infira, estime ou complete com suposição — um campo null é o comportamento correto quando a reunião não tocou nesse assunto.
- "etapa" só pode ser um destes valores, exatamente como escrito: ${ETAPAS.join(", ")}.
- "valor" é o valor em reais da proposta/negócio mencionado na reunião — só o número, sem "R$" e sem separador de milhar.
- "concorrente" é o nome de um concorrente que o cliente citou estar avaliando como alternativa.
- "proximoPasso" é a próxima ação combinada com o cliente durante a própria reunião (ex.: "Enviar proposta até sexta"), não uma tarefa interna do vendedor.

Responda somente com este formato JSON:
{"etapa": {"valor":"...","trecho":"..."} | null, "valor": {"valor":0,"trecho":"..."} | null, "concorrente": {"valor":"...","trecho":"..."} | null, "proximoPasso": {"valor":"...","trecho":"..."} | null}`;

function descreverNegocio(negocio: Negocio): string {
  return [
    `Empresa: ${negocio.empresa}`,
    `Etapa atual: ${negocio.etapa}`,
    `Valor atual: ${negocio.valor != null ? negocio.valor : "não informado"}`,
    `Concorrente atual: ${negocio.concorrente || "não informado"}`,
    `Próximo passo atual: ${negocio.proximoPasso || "não informado"}`,
  ].join("\n");
}

/** Reaproveitada pela rota HTTP (app/api/negocios/[id]/analisar) e pela ferramenta MCP (lib/ferramentas.ts). */
export async function analisarReuniao(transcricao: string, negocioAtual: Negocio, model?: string): Promise<{ proposta: Proposta; meta: ReturnType<typeof meta> }> {
  const insumo = "transcrição da reunião e negócio atual";
  if (!aiEnabled()) {
    await esperar();
    return { proposta: propostaDemo(), meta: meta({ demo: true, insumo }) };
  }
  const prompt = `NEGÓCIO ATUAL:\n${descreverNegocio(negocioAtual)}\n\nTRANSCRIÇÃO DA REUNIÃO:\n${transcricao}`;
  const bruta = await askJSON<Proposta>({ system: SYSTEM_ANALISE, prompt, model });
  return { proposta: normalizarProposta(bruta), meta: meta({ demo: false, insumo }) };
}

/** Garante a forma exata mesmo quando o modelo devolve um campo ausente ou malformado — nunca deixa passar suposição disfarçada de dado. */
function normalizarProposta(bruta: unknown): Proposta {
  const p = (bruta || {}) as Record<string, unknown>;
  return {
    etapa: normalizarCampoEtapa(p.etapa),
    valor: normalizarCampoNumero(p.valor),
    concorrente: normalizarCampoTexto(p.concorrente),
    proximoPasso: normalizarCampoTexto(p.proximoPasso),
  };
}

function normalizarCampoTexto(campo: unknown) {
  if (!campo || typeof campo !== "object") return null;
  const c = campo as { valor?: unknown; trecho?: unknown };
  if (typeof c.valor !== "string" || !c.valor.trim() || typeof c.trecho !== "string" || !c.trecho.trim()) return null;
  return { valor: c.valor.trim(), trecho: c.trecho.trim() };
}

function normalizarCampoNumero(campo: unknown) {
  if (!campo || typeof campo !== "object") return null;
  const c = campo as { valor?: unknown; trecho?: unknown };
  const numero = Number(c.valor);
  if (!Number.isFinite(numero) || typeof c.trecho !== "string" || !c.trecho.trim()) return null;
  return { valor: numero, trecho: c.trecho.trim() };
}

function normalizarCampoEtapa(campo: unknown) {
  const texto = normalizarCampoTexto(campo);
  if (!texto) return null;
  if (!(ETAPAS as readonly string[]).includes(texto.valor)) return null;
  return texto as { valor: (typeof ETAPAS)[number]; trecho: string };
}

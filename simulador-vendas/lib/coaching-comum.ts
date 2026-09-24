import type { AvaliacaoSessao, CriterioAvaliado } from "./avaliacao";

export const ACERTOS_TREINO = {
  descoberta: "Boa pergunta para entender o cliente",
  escuta: "Você acolheu o ponto do cliente",
  valor: "Você conectou valor à necessidade",
  proximoPasso: "Bom encaminhamento dos próximos passos",
};
export type AcertoTreino = { tipo: keyof typeof ACERTOS_TREINO; evidencia: string };
export type DicaTreino = { texto: string; origem: "ia" | "orientacao" | "demo"; acerto?: AcertoTreino };

/** O elogio precisa apontar um trecho da última fala do vendedor, nunca do cliente. */
export function validarAcerto(valor: unknown, ultimaFalaVendedor: string): AcertoTreino | undefined {
  if (!valor || typeof valor !== "object") return;
  const { tipo, evidencia } = valor as { tipo?: unknown; evidencia?: unknown };
  if (typeof tipo !== "string" || !Object.hasOwn(ACERTOS_TREINO, tipo) || typeof evidencia !== "string") return;
  const trecho = evidencia.trim();
  if (trecho.length < 12 || trecho.length > 200 || trecho.split(/\s+/).length < 3 || !ultimaFalaVendedor.includes(trecho)) return;
  return { tipo: tipo as AcertoTreino["tipo"], evidencia: trecho };
}

export function acertoBasico(fala: string): AcertoTreino | undefined {
  const pergunta = fala.match(/(?:qual|quais|como)\b[^.!?]{8,160}\?/i)?.[0];
  if (pergunta && /desafio|dificuldade|problema|impacto|afeta|funciona hoje/i.test(pergunta)) return validarAcerto({ tipo: "descoberta", evidencia: pergunta }, fala);
}
export type AcaoTreino = { criterioId: string; acao: string; comoMedir: string };
export type PlanoTreino = { origem: "ia" | "orientacao" | "demo"; acoes: AcaoTreino[] };

export function pontosFracos(avaliacao: AvaliacaoSessao) {
  return [...avaliacao.criterios].filter(c => c.nota < 7).sort((a, b) => a.nota - b.nota).slice(0, 2);
}
export function acaoDoCriterio(c: CriterioAvaliado): string {
  if (c.comoMelhorar && !/configurações|conecte a ia/i.test(c.comoMelhorar)) return c.comoMelhorar;
  const sugestoes = {
    "Descoberta": "Faça uma pergunta aberta sobre o problema e outra sobre seu impacto antes de propor a solução.",
    "Proposta de valor": "Relacione um benefício do produto a uma necessidade que o cliente acabou de mencionar.",
    "Objeções": "Confirme a preocupação do cliente com suas palavras e pergunte o que ajudaria a resolvê-la.",
    "Fechamento": "Combine o próximo passo, um responsável e uma data antes de encerrar.",
  };
  return sugestoes[c.grupo];
}
export function planoBase(avaliacao: AvaliacaoSessao): PlanoTreino {
  const prioridades = [...avaliacao.criterios].sort((a, b) => a.nota - b.nota).slice(0, 3);
  return { origem: "orientacao", acoes: prioridades.map(c => ({
    criterioId: c.id,
    acao: acaoDoCriterio(c),
    comoMedir: `Ao terminar o próximo treino, identifique uma fala sua que demonstre ${c.nome.toLowerCase()}.`,
  })) };
}
export function validarPlano(valor: unknown, avaliacao: AvaliacaoSessao): AcaoTreino[] {
  const itens = (valor as { acoes?: unknown })?.acoes;
  if (!Array.isArray(itens)) return [];
  const ids = new Set<string>();
  return itens.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const { criterioId, acao, comoMedir } = item;
    if (typeof criterioId !== "string" || !avaliacao.criterios.some(c => c.id === criterioId) || ids.has(criterioId)) return [];
    if (typeof acao !== "string" || !acao.trim() || acao.length > 220 || typeof comoMedir !== "string" || !comoMedir.trim() || comoMedir.length > 220) return [];
    ids.add(criterioId);
    return [{ criterioId, acao: acao.trim(), comoMedir: comoMedir.trim() }];
  }).slice(0, 3);
}
export function dicaBase(ultimaFala: string): string {
  if (/encerrar|preciso ir|próxima reunião|retomar.*outra conversa/i.test(ultimaFala)) return "Combine os pontos que ficam para depois e proponha uma data para retomar. Agradeça o tempo do cliente.";
  if (/preço|custo|orçamento|caro/i.test(ultimaFala)) return "Antes de discutir desconto, pergunte qual resultado justificaria o investimento para o cliente.";
  if (/prova|número|parecido|promessa/i.test(ultimaFala)) return "Pergunte qual evidência daria segurança para avançar. Use apenas exemplos e números que você conhece.";
  if (/tempo|pressa|reunião/i.test(ultimaFala)) return "Reconheça o tempo curto e faça uma pergunta sobre a principal dificuldade do cliente.";
  if (/próximo|material|escrito|passos/i.test(ultimaFala)) return "Combine uma ação concreta, quem fica responsável e uma data para retomar a conversa.";
  return "Retome um ponto que o cliente trouxe e pergunte como isso afeta o dia a dia dele.";
}

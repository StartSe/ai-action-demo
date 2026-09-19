import type { AvaliacaoSessao, CriterioAvaliado } from "./avaliacao";

export type DicaTreino = { texto: string; origem: "ia" | "orientacao" | "demo" };
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
  if (/preço|custo|orçamento|caro/i.test(ultimaFala)) return "Antes de discutir desconto, pergunte qual resultado justificaria o investimento para o cliente.";
  if (/prova|número|parecido|promessa/i.test(ultimaFala)) return "Pergunte qual evidência daria segurança para avançar. Use apenas exemplos e números que você conhece.";
  if (/tempo|pressa|reunião/i.test(ultimaFala)) return "Reconheça o tempo curto e faça uma pergunta sobre a principal dificuldade do cliente.";
  if (/próximo|material|escrito|passos/i.test(ultimaFala)) return "Combine uma ação concreta, quem fica responsável e uma data para retomar a conversa.";
  return "Retome um ponto que o cliente trouxe e pergunte como isso afeta o dia a dia dele.";
}

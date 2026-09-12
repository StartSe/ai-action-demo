// Respostas de exemplo usadas quando não há chave de IA configurada.
import type { Scorecard, Troca, Vaga } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRequisitos(requisitos: string | undefined) {
  return String(requisitos || "")
    .split(/\n|;/)
    .map((s) => s.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

const MODELOS: ((item: string) => string)[] = [
  (item) => `Me conta sobre uma experiência real em que você usou ${item}.`,
  (item) => `Qual foi um desafio que você enfrentou envolvendo ${item} e como você resolveu?`,
  (item) => `Como você avalia o seu nível hoje em ${item}? Me dê um exemplo concreto que sustente isso.`,
  (item) => `Fale sobre um resultado do qual você se orgulha relacionado a ${item}.`,
];

// Roteiro fixo: uma pergunta de abertura, perguntas cicladas pelos requisitos informados
// e um follow-up simples quando a última resposta do candidato foi muito curta.
export function proximaPerguntaDemo({ vaga, historico, perguntasFeitas }: { vaga: Vaga; historico: Troca[]; perguntasFeitas: number }): string {
  if (perguntasFeitas === 0) {
    return `Para começar, me conta rapidamente sobre sua trajetória e o que te chamou atenção na vaga de ${vaga.titulo}.`;
  }
  const ultimaResposta = [...historico].reverse().find((h) => h.papel === "candidato")?.texto || "";
  const palavras = ultimaResposta.trim().split(/\s+/).filter(Boolean).length;
  if (palavras > 0 && palavras < 8) {
    return "Pode detalhar com um exemplo concreto? Uma situação real ajuda bastante a entender melhor.";
  }
  const itens = parseRequisitos(vaga.requisitos);
  const item = itens.length ? itens[(perguntasFeitas - 1) % itens.length].toLowerCase() : "os requisitos da vaga";
  const modelo = MODELOS[(perguntasFeitas - 1) % MODELOS.length];
  return modelo(item);
}

export function mensagemEncerramento({ vaga }: { vaga?: Vaga } = {}): string {
  const nome = vaga?.candidato ? vaga.candidato.split(" ")[0] : "";
  const saudacao = nome ? `Muito obrigada, ${nome}!` : "Muito obrigada pelo seu tempo!";
  return `${saudacao} Foi ótimo te conhecer melhor. Vou repassar essa conversa para o gestor da vaga, que entra em contato em breve com os próximos passos.`;
}

export function scorecardDemo({ vaga }: { vaga?: Vaga } = {}): Scorecard {
  const nome = vaga?.candidato || "Candidato(a)";
  const titulo = vaga?.titulo || "a vaga";
  const itens = parseRequisitos(vaga?.requisitos);
  const base = itens.length >= 3 ? itens.slice(0, 4) : ["Comunicação", "Experiência técnica", "Adequação cultural", "Motivação"];
  const notas = [8, 7, 6.5, 8];
  return {
    nota_geral: 7.4,
    resumo: `${nome} demonstrou boa aderência aos requisitos de ${titulo}, com respostas objetivas e exemplos concretos na maior parte das perguntas. Recomenda-se uma conversa com o gestor para aprofundar dois pontos específicos antes de avançar.`,
    criterios: base.map((c, i) => ({
      criterio: c,
      nota: notas[i % notas.length],
      evidencia: `Trouxe um exemplo concreto relacionado a ${c.toLowerCase()} durante a conversa.`,
    })),
    pontos_fortes: [
      "Comunicação clara e direta nas respostas.",
      "Exemplos concretos ligados aos requisitos da vaga.",
      "Demonstrou motivação genuína para a posição.",
    ],
    pontos_atencao: [
      "Pouca profundidade ao falar de resultados quantitativos.",
      "Não abordou experiência com um dos requisitos priorizados.",
    ],
    recomendacao: "avaliar com o gestor",
    proximos_passos: [
      "Aprofundar, em entrevista técnica, a experiência com o requisito menos explorado.",
      "Validar pretensão salarial e disponibilidade de início.",
      "Confirmar referências com o último gestor direto.",
    ],
  };
}

// Respostas de exemplo usadas quando não há chave de IA configurada.
import type { Cultura } from "./cultura";
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
  (item) => `O que costuma ser mais difícil, na prática, quando o assunto é ${item}?`,
  (item) => `Me dá um exemplo de como ${item} apareceu no seu dia a dia recentemente?`,
];

// Roteiro fixo: uma pergunta de abertura, perguntas cicladas pelos requisitos informados
// (um requisito por vez, com um modelo diferente a cada volta pela lista, para não repetir a mesma
// frase para requisitos diferentes) e um follow-up simples quando a última resposta foi muito curta.
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
  const item = itens.length ? itens[(perguntasFeitas - 1) % itens.length] : "os requisitos da vaga";
  const modelo = MODELOS[(perguntasFeitas - 1) % MODELOS.length];
  return modelo(item);
}

export function mensagemEncerramento({ vaga }: { vaga?: Vaga } = {}): string {
  const nome = vaga?.candidato ? vaga.candidato.split(" ")[0] : "";
  const saudacao = nome ? `Muito obrigada, ${nome}!` : "Muito obrigada pelo seu tempo!";
  return `${saudacao} Foi ótimo te conhecer melhor. Vou repassar essa conversa para o gestor da vaga, que entra em contato em breve com os próximos passos.`;
}

/** Para cada pergunta da entrevistadora (numerada na ordem em que aparece), a resposta do candidato que a sucede. */
function paresPerguntaResposta(historico: Troca[]): { pergunta: number; resposta: string }[] {
  const pares: { pergunta: number; resposta: string }[] = [];
  let n = 0;
  historico.forEach((h, i) => {
    if (h.papel !== "entrevistadora") return;
    n++;
    const resposta = historico.slice(i + 1).find((h2) => h2.papel === "candidato");
    if (resposta) pares.push({ pergunta: n, resposta: resposta.texto });
  });
  return pares;
}

function trecho(texto: string, max = 130) {
  const limpo = texto.trim();
  return limpo.length > max ? `${limpo.slice(0, max).trim()}...` : limpo;
}

// Evidências distintas por critério: cada uma cita a resposta real do candidato à pergunta correspondente
// (a primeira pergunta, de abertura, não conta — as seguintes seguem a ordem dos requisitos da vaga).
export function scorecardDemo({ vaga, historico = [] }: { vaga?: Vaga; historico?: Troca[] } = {}): Scorecard {
  const nome = vaga?.candidato || "Candidato(a)";
  const titulo = vaga?.titulo || "a vaga";
  const itens = parseRequisitos(vaga?.requisitos);
  const base = itens.length >= 3 ? itens.slice(0, 4) : ["Comunicação", "Experiência técnica", "Adequação cultural", "Motivação"];
  const notas = [8, 7, 6.5, 8];
  const paresPorRequisito = paresPerguntaResposta(historico).slice(1);
  return {
    nota_geral: 7.4,
    resumo: `${nome} demonstrou boa aderência aos requisitos de ${titulo}, com respostas objetivas e exemplos concretos na maior parte das perguntas. Recomenda-se uma conversa com o gestor para aprofundar dois pontos específicos antes de avançar.`,
    criterios: base.map((c, i) => {
      const par = paresPorRequisito[i];
      return {
        criterio: c,
        nota: notas[i % notas.length],
        evidencia: par
          ? `Ao ser perguntado(a) sobre ${c}, respondeu: "${trecho(par.resposta)}"`
          : `Não trouxe um exemplo direto sobre ${c} durante a conversa.`,
        pergunta: par?.pergunta,
      };
    }),
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

/**
 * A cultura de uma empresa de serviços B2B qualquer, usada enquanto ninguém cadastrou a da própria
 * empresa (lib/cultura.ts) e como resposta de "Gerar a partir de um texto" no modo demonstração.
 * Existe para que a entrevistadora tenha sempre o que avaliar em cultura — quem vê a tela precisa
 * entender o que esse cadastro faz antes de decidir preenchê-lo.
 *
 * `atualizadoEm` vazio de propósito: nada disso foi salvo por ninguém, e a tela não pode dizer
 * "atualizado em" sobre um exemplo.
 */
export function culturaDemo(): Cultura {
  return {
    valores: [
      { id: "cliente-no-centro", nome: "Cliente no centro", descricao: "Toda decisão começa pela pergunta do que muda para quem contrata a gente." },
      { id: "dono-do-resultado", nome: "Dono do resultado", descricao: "Quem pega um problema leva até o fim, mesmo quando depende de outra área." },
      { id: "clareza-antes-da-pressa", nome: "Clareza antes da pressa", descricao: "Combinar por escrito o que se espera antes de sair executando." },
      { id: "melhora-continua", nome: "Melhora contínua", descricao: "Cada entrega deixa um aprendizado registrado para a próxima sair melhor." },
    ],
    comportamentos:
      "As pessoas aqui trazem o problema junto com uma proposta, avisam cedo quando um prazo vai escorregar e escrevem o que combinaram. Discordar em reunião é esperado; sair da reunião sem uma decisão, não. Quem atende cliente tem autonomia para resolver na hora e responder depois pelo que decidiu.",
    naoCombina:
      "Não funciona aqui quem precisa de aprovação para cada passo, quem entrega no prazo escondendo um problema conhecido ou quem trata o time de entrega como fornecedor interno. Também não combina disputar crédito por resultado que foi de várias pessoas.",
    atualizadoEm: "",
  };
}

// Conversa em tempo real da sala de simulação pública (app/simular/[código]): a IA faz o papel do
// cliente simulado, uma fala por vez, a partir do cenário escolhido e do que já foi dito até aqui.
// Usado pela rota app/api/salas/[token]/conversar. Em modo demonstração, um roteiro fixo de 4 falas
// substitui a IA, para o exemplo nunca depender de uma chave configurada.
import { aiEnabled, askText } from "./ai";
import { esperar } from "./demo";
import type { Cenario, LinhaTranscricao } from "./types";

const ROTEIRO_DEMO = [
  "Oi, tudo bem? Pode falar, mas já adianto que estou com pouco tempo agora.",
  "Entendi o que você está propondo. Só não sei se isso resolve mesmo o que a gente mais sente falta hoje.",
  "Faz sentido o que você acabou de dizer. Minha maior dúvida ainda é sobre o prazo e o que muda no nosso dia a dia.",
  "Certo, isso ajuda bastante. Pode me mandar os próximos passos por escrito para eu avaliar com calma?",
];

function transcricaoParaTexto(transcricao: LinhaTranscricao[]): string {
  return transcricao.map((l) => `${l.papel === "vendedor" ? "Vendedor" : "Cliente"}: ${l.texto}`).join("\n");
}

function systemSimulacao(cenario: Cenario | null): string {
  const base = `Você faz o papel do CLIENTE numa ligação de vendas simulada, para treinar um vendedor. Nunca saia do personagem, nunca dê dicas de vendas e nunca revele que isto é uma simulação.
Regras:
- Responda só como o cliente, em português do Brasil, numa fala curta (1 a 3 frases).
- Reaja de forma realista ao que o vendedor disser, mantendo sempre o mesmo tom e a mesma postura.
- Não conduza nem encerre a ligação sozinho; quem decide quando terminar é o vendedor.`;
  if (!cenario) return `${base}\nVocê é um cliente genérico, educado mas ocupado, sem contexto específico definido.`;
  return `${base}\nVocê é ${cenario.cliente.nome}, ${cenario.cliente.cargo} da ${cenario.cliente.empresa}. Contexto: ${cenario.cliente.contexto} Objetivo do vendedor nesta ligação: ${cenario.objetivo} Seu tom: ${cenario.tom} Objeções que você pode levantar quando fizer sentido: ${cenario.objecoes.join(" | ")}`;
}

/** Próxima fala do cliente simulado, a partir da transcrição completa até agora (a última linha é sempre do vendedor). */
export async function responderComoCliente(transcricao: LinhaTranscricao[], cenario: Cenario | null): Promise<string> {
  if (!aiEnabled()) {
    await esperar(700);
    const turno = transcricao.filter((l) => l.papel === "cliente").length;
    return ROTEIRO_DEMO[Math.min(turno, ROTEIRO_DEMO.length - 1)];
  }
  const prompt = `${transcricaoParaTexto(transcricao)}\n\nResponda agora como o cliente, só a próxima fala.`;
  const resposta = await askText({ system: systemSimulacao(cenario), prompt, maxTokens: 220, temperature: 0.6 });
  return resposta.trim();
}

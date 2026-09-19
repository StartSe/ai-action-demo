import { banco } from "./banco";
import { montarPersonagem } from "./cliente-simulado";
import { personasDe } from "./personas";
import { obter as obterProduto } from "./produtos";
import type { Sessao } from "./sessoes";
import type { Simulacao } from "./simulacoes";

export type Roteiro = {
  cliente: { nome: string; cargo: string; empresa: string; contexto: string };
  objetivo: string;
  etapas: string[];
  instrucoes: string;
};

/** Snapshot anterior à conversa: mudanças no produto não mudam o cliente no meio do treino. */
export function prepararRoteiro(sessao: Sessao, simulacao: Simulacao): Roteiro {
  const db = banco();
  db.exec(`CREATE TABLE IF NOT EXISTS roteiros_sessao (
    sessaoId TEXT PRIMARY KEY REFERENCES sessoes_treino(id) ON DELETE CASCADE,
    roteiro TEXT NOT NULL
  )`);
  const salvo = db.prepare("SELECT roteiro FROM roteiros_sessao WHERE sessaoId = ?").get(sessao.id) as { roteiro: string } | undefined;
  if (salvo) return JSON.parse(salvo.roteiro) as Roteiro;
  const produto = obterProduto(simulacao.produtoId);
  const personagem = montarPersonagem({ persona: personasDe([sessao.personaId])[0], dificuldade: simulacao.dificuldade,
    produto: produto ?? { nome: simulacao.nome }, semente: sessao.id });
  const objetivo = simulacao.objetivo?.trim() || "Entender a situação do cliente e sair da conversa com um próximo passo combinado.";
  const etapas = [
    "Apresente-se e confirme o tempo disponível para conversar.",
    "Explore a situação atual, as necessidades e o impacto dos problemas do cliente.",
    `Relacione os benefícios de ${produto?.nome ?? simulacao.nome} às necessidades que descobriu.`,
    "Esclareça dúvidas e objeções usando apenas informações que você conhece sobre o produto.",
    "Confirme o entendimento e combine um próximo passo concreto.",
  ];
  const { nome, cargo, empresa, contexto } = personagem;
  const roteiro: Roteiro = { cliente: { nome, cargo, empresa, contexto }, objetivo, etapas,
    instrucoes: `${personagem.instrucoes}\n\nROTEIRO DA CONVERSA (${simulacao.duracaoMin} minutos):\n${etapas.map((e, i) => `${i + 1}. ${e}`).join("\n")}\nObjetivo do vendedor: ${objetivo}\nSiga este arco com flexibilidade, reagindo ao que o vendedor realmente disser. Não recite o roteiro nem interprete o vendedor. Faça uma pergunta por vez, em português brasileiro, com respostas curtas e naturais. Não invente preços, provas ou promessas. O vendedor pode interromper: escute e adapte sua resposta.` };
  db.prepare("INSERT INTO roteiros_sessao (sessaoId, roteiro) VALUES (?, ?)").run(sessao.id, JSON.stringify(roteiro));
  return roteiro;
}

// Um turno da conversa da sala de treino (US-015): o vendedor falou, o cliente simulado responde.
//
// A diferença em relação a lib/simulacao.ts — a sala antiga, que recebia a conversa inteira do
// navegador a cada turno — é de onde vem a memória: aqui a transcrição mora no servidor
// (`mensagens_sessao`), e esta função recebe só as últimas falas já gravadas mais o system prompt do
// personagem (lib/cliente-simulado.ts). É por ali que a ficha do produto entra na conversa: nenhuma
// fonte crua de `fontes_produto` chega ao modelo (D12 do PRD).
//
// Sem chave de IA, um roteiro fixo de seis falas toma o lugar do modelo — a sala inteira tem de
// funcionar por voz em modo demonstração, sem depender de nada configurado.
import { aiEnabled, askText } from "./ai";
import { esperar } from "./demo";
import type { MensagemSessao } from "./sessoes";
import { AVISO_TEMPO_DEMO, INSTRUCAO_APOS_AVISO, INSTRUCAO_AVISO_TEMPO } from "./tempo-conversa";

/** Quantas falas do fim da conversa vão para o prompt de cada turno (o resto fica gravado, só não é relido). */
export const FALAS_NO_PROMPT = 20;

/**
 * O cliente do modo demonstração. As seis falas percorrem o arco de uma conversa de vendas de verdade
 * — abertura com pressa, "por que agora", impacto no time, pedido de prova, preço e próximo passo —
 * para o vendedor treinar o roteiro inteiro mesmo sem IA conectada.
 */
const ROTEIRO_DEMO = [
  "Oi, tudo bem? Pode falar, mas já adianto que estou com pouco tempo agora.",
  "Entendi. E por que eu deveria olhar isso agora, se hoje a gente resolve do jeito que dá?",
  "Essa parte faz sentido. Minha dúvida é o que muda no dia a dia do meu time.",
  "Já ouvi promessa parecida antes. Você tem número de algum cliente parecido com a gente?",
  "Certo. E o preço, como funciona? Preciso saber se cabe no orçamento deste ano.",
  "Isso ajuda bastante. Me manda os próximos passos por escrito que eu avalio com calma.",
];

const DESPEDIDA_DEMO = "Preciso ir para a próxima reunião. Obrigado pela conversa, me manda o material por escrito.";

/** O que o modelo recebe a mais quando o cronômetro chegou ao fim: uma despedida, nada de assunto novo. */
const INSTRUCAO_DESPEDIDA = `AGORA: o tempo da conversa terminou. Despeça-se em UMA fala curta, do seu jeito, sem começar assunto novo e sem combinar nada que ainda não foi combinado.`;

function historicoParaTexto(historico: MensagemSessao[]): string {
  return historico.map((m) => `${m.papel === "vendedor" ? "Vendedor" : "Cliente"}: ${m.texto}`).join("\n");
}

/**
 * A próxima fala do cliente simulado.
 *
 * `instrucoes` é o system prompt do personagem da sessão (quem ele é, como se comporta, o que sabe do
 * produto e quais objeções tem). `historico` são as últimas falas em ordem, com a do vendedor no fim.
 * `despedir` liga a última fala da conversa, quando o tempo acabou.
 */
export async function falaDoCliente({
  instrucoes,
  historico,
  despedir = false,
  faseTempo = "normal",
}: {
  instrucoes: string;
  historico: MensagemSessao[];
  despedir?: boolean;
  faseTempo?: "normal" | "avisar" | "concluir";
}): Promise<string> {
  if (!aiEnabled()) {
    await esperar(700);
    if (despedir) return DESPEDIDA_DEMO;
    if (faseTempo === "avisar") return AVISO_TEMPO_DEMO;
    if (faseTempo === "concluir") return "Obrigado por compartilhar. Podemos retomar esses pontos na próxima conversa. Até mais!";
    const turno = historico.filter((m) => m.papel === "cliente").length;
    return ROTEIRO_DEMO[Math.min(turno, ROTEIRO_DEMO.length - 1)];
  }

  const orientacaoTempo = despedir ? INSTRUCAO_DESPEDIDA : faseTempo === "avisar" ? INSTRUCAO_AVISO_TEMPO : faseTempo === "concluir" ? INSTRUCAO_APOS_AVISO : "";
  const system = `${instrucoes}\n\n${orientacaoTempo}`;
  const prompt = `${historicoParaTexto(historico)}\n\nResponda agora como o cliente, só a próxima fala.`;
  const resposta = await askText({ system, prompt, maxTokens: 220, temperature: 0.6 });
  return resposta.trim();
}

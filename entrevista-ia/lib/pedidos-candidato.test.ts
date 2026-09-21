// Os pedidos do candidato (lib/pedidos-candidato.ts): o que faz a entrevistadora repetir a última fala
// ou devolver a palavra, e o que NÃO pode fazer isso. Cada frase aqui é uma que uma pessoa disse (ou
// diria) num microfone, transcrita como o reconhecimento entrega — sem pontuação, sem maiúscula.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pedeContinuar, pedeRepeticao } from "./pedidos-candidato";

describe("pedeRepeticao", () => {
  it("reconhece os jeitos de pedir a pergunta de novo, com e sem pontuação", () => {
    for (const texto of [
      "Pode repetir?",
      "pode repetir a pergunta",
      "Você pode repetir a pergunta, por favor?",
      "Poderia repetir a pergunta por favor",
      "Repete, por favor.",
      "Repita a pergunta",
      "Desculpa, não ouvi.",
      "desculpa nao escutei direito",
      "Não entendi a pergunta.",
      "Não entendi, pode repetir?",
      "Ahn, não consegui ouvir, você pode repetir a pergunta",
      "Qual era a pergunta?",
      "qual foi mesmo a pergunta",
      "Como é a pergunta mesmo?",
      "Hã?",
      "Oi?",
      "Como?",
      "O quê?",
      "Cortou aqui.",
      "O áudio falhou, pode repetir?",
      "Dá pra falar de novo?",
      "Pode falar mais devagar?",
      "Não deu pra ouvir.",
      "Perdão, pode refazer a pergunta?",
      "A pergunta de novo, por favor.",
    ]) assert.equal(pedeRepeticao(texto), true, texto);
  });

  it("não confunde uma resposta que fala de repetir, entender ou ouvir com um pedido", () => {
    for (const texto of [
      "Eu tive que repetir o treinamento com a equipe inteira.",
      "Repeti o processo três vezes até dar certo.",
      "Não entendi bem o cliente na época, mas resolvi conversando.",
      "Não ouvi reclamação nenhuma depois da mudança.",
      "Sim.",
      "Não.",
      "Não sei responder.",
      "Prefiro não responder.",
      "Trabalhei com atendimento a clientes por quatro anos, cuidando de sessenta contas.",
      "Como líder, eu priorizava a comunicação direta com o time.",
      "Qual é o salário?",
      "A vaga é híbrida ou remota?",
      "Não entendi muito bem a pergunta mas vou tentar responder do meu jeito: eu trabalhei em suporte e depois em vendas.",
    ]) assert.equal(pedeRepeticao(texto), false, texto);
  });
});

describe("pedeContinuar", () => {
  it("reconhece o pedido de um momento e o aviso de que não terminou", () => {
    for (const texto of [
      "Espera.",
      "Espera aí",
      "Só um momento.",
      "so um minuto por favor",
      "Um segundo.",
      "Peraí",
      "Calma aí, deixa eu pensar",
      "Deixa eu pensar.",
      "Preciso pensar um pouco.",
      "Não terminei.",
      "Espera, eu não terminei.",
      "Ainda não acabei.",
      "Deixa eu terminar.",
      "Posso continuar?",
      "Deixa eu completar a resposta.",
      "Só completando.",
      "Só mais uma coisa.",
      "Desculpa, eu ainda não tinha terminado.",
    ]) assert.equal(pedeContinuar(texto), true, texto);
  });

  it("não trata o começo de uma resposta como pedido de pausa", () => {
    for (const texto of [
      "Deixa eu pensar, acho que foi em 2019 quando eu assumi a carteira.",
      "Terminei o projeto em três meses.",
      "Eu continuei na empresa por mais dois anos depois disso.",
      "Um momento importante foi quando o cliente ameaçou cancelar.",
      "Sim.",
      "Pode pular.",
      "Não sei.",
      "Só trabalhei com isso uma vez.",
    ]) assert.equal(pedeContinuar(texto), false, texto);
  });

  it("um pedido nunca é as duas coisas ao mesmo tempo", () => {
    for (const texto of ["Pode repetir?", "Não ouvi.", "Espera.", "Não terminei."]) {
      assert.notEqual(pedeRepeticao(texto), pedeContinuar(texto), texto);
    }
  });
});

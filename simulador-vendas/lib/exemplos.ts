// Quando o dado de exemplo sai de cena (US-030).
//
// O app nasce cheio: um produto, dois treinos, três pessoas e seis conversas avaliadas, semeados por
// `lib/semear-demo.ts` para quem está avaliando o app ver o valor antes de conectar a IA. Este módulo
// é a outra metade dessa promessa — **o exemplo sai de cena assim que o primeiro dado real do mesmo
// tipo aparece**, para ninguém tomar decisão olhando número inventado.
//
// Duas portas chegam aqui, e as duas ficam no módulo que grava (não na rota): `lib/produtos.ts` quando
// nasce um produto de verdade e `lib/sessoes.ts` quando começa a primeira conversa de verdade. Assim a
// regra vale igual para a tela, para o assistente e para qualquer porta que venha depois.
//
// Toda remoção é guardada pela mesma pergunta: **nada de verdade aponta para mim?** É o que permite
// apagar sem pensar duas vezes — um treino de exemplo com uma conversa real dentro fica, um produto de
// exemplo com um treino real em cima fica, e o resto vai embora.
//
// Este arquivo importa só `lib/banco.ts` e `lib/historico.ts` de propósito: ele é chamado de dentro de
// `lib/produtos.ts` e `lib/sessoes.ts`, então qualquer import que voltasse a eles (pela avaliação, por
// exemplo) fecharia um ciclo. A semeadura, que precisa da avaliação, mora no outro módulo.
import { banco } from "./banco";
import { apagar as apagarResultado } from "./historico";

/** As conversas semeadas, com o resultado de cada uma. */
function sessoesDeExemplo(): { id: string; resultadoId: string | null }[] {
  return banco().prepare("SELECT id, resultadoId FROM sessoes_treino WHERE exemplo = 1").all() as {
    id: string;
    resultadoId: string | null;
  }[];
}

/** Já existe alguma sessão de exemplo? É a pergunta que evita semear duas vezes e a que evita varrer
 * o banco a cada início de conversa depois que o exemplo já saiu. */
export function temSessoesDeExemplo(): boolean {
  return sessoesDeExemplo().length > 0;
}

/**
 * Apaga as conversas de exemplo, com as falas e as avaliações delas.
 *
 * Chamada quando a primeira conversa de verdade **começa** (não quando o link é aberto): quem abre o
 * link, vê quem é o cliente e fecha a aba não conversou — é a mesma régua de `historicoDe` e de
 * `tentativasDe`, que deixam de fora o que ficou em preparação ou foi abandonado.
 *
 * As pessoas de exemplo vão junto quando não sobra conversa nenhuma delas: uma linha na Equipe com
 * zero conversas e o chip "Exemplo" não diria nada a ninguém.
 */
export function removerSessoesDeExemplo(): void {
  const sessoes = sessoesDeExemplo();
  if (!sessoes.length) return;

  const d = banco();
  const marcadores = sessoes.map(() => "?").join(", ");
  const ids = sessoes.map((s) => s.id);
  d.prepare(`DELETE FROM mensagens_sessao WHERE sessaoId IN (${marcadores})`).run(...ids);
  d.prepare(`DELETE FROM sessoes_treino WHERE id IN (${marcadores})`).run(...ids);

  // O resultado mora em `resultados` (lib/historico.ts), que tem conexão própria para o mesmo
  // `app.sqlite`: os DELETE acima não podem estar dentro de uma transação aberta aqui, senão a outra
  // conexão encontra o banco ocupado. Por isso nenhum BEGIN neste módulo.
  for (const s of sessoes) {
    if (s.resultadoId) apagarResultado(s.resultadoId);
  }

  removerPessoasSemConversa();
}

/** Pessoa de exemplo que não tem mais nenhuma conversa no banco. */
function removerPessoasSemConversa(): void {
  banco()
    .prepare("DELETE FROM participantes WHERE exemplo = 1 AND id NOT IN (SELECT participanteId FROM sessoes_treino)")
    .run();
}

/**
 * Apaga o conjunto de exemplo inteiro — conversas, treinos, pessoas e produto.
 *
 * Chamada quando nasce um produto de verdade: é o momento em que o gestor deixou de estar avaliando o
 * app e passou a usá-lo, e a biblioteca dele não pode ter um produto que ele nunca cadastrou.
 *
 * Cada nível só cai se nada de verdade depender dele. Um treino de exemplo em que alguém conversou de
 * verdade fica (com a conversa dela); o produto de exemplo em que algum treino de verdade foi montado
 * fica — é o mesmo caso que `lib/produtos.ts` já resolvia escondendo-o da biblioteca.
 */
export function removerConjuntoDeExemplo(): void {
  removerSessoesDeExemplo();
  removerPessoasSemConversa();

  const d = banco();
  d.prepare("DELETE FROM simulacoes WHERE exemplo = 1 AND codigo NOT IN (SELECT simulacaoCodigo FROM sessoes_treino)").run();
  d.prepare("DELETE FROM fontes_produto WHERE produtoId IN (SELECT id FROM produtos WHERE exemplo = 1) AND produtoId NOT IN (SELECT produtoId FROM simulacoes)").run();
  d.prepare("DELETE FROM produtos WHERE exemplo = 1 AND id NOT IN (SELECT produtoId FROM simulacoes)").run();
}

// Quando o dado de exemplo sai de cena (US-004).
//
// O app nasce cheio: uma vaga, quatro candidatos e quatro entrevistas semeados por
// `lib/semear-demo.ts`, para quem está avaliando o app ver o valor antes de conectar a IA. Este
// módulo é a outra metade dessa promessa — **o exemplo sai de cena assim que o primeiro dado real do
// mesmo tipo aparece**, para ninguém decidir sobre uma pessoa olhando ficha inventada.
//
// Duas portas chegam aqui, e as duas ficam no módulo que grava (não na rota): `lib/vagas.ts` quando
// nasce uma vaga de verdade e `lib/candidatos.ts` quando nasce um candidato de verdade. Assim a regra
// vale igual para a tela, para o assistente (MCP) e para qualquer porta que venha depois. A terceira
// porta é a pessoa: "Apagar os dados de exemplo" em Configurações chama `removerTudoDeExemplo`.
//
// Toda remoção é guardada pela mesma pergunta: **nada de verdade aponta para mim?** Uma vaga de
// exemplo com um candidato de verdade convidado fica (com a entrevista dela), e o mesmo vale ao
// contrário. Só cai o que é de exemplo de ponta a ponta.
//
// Este arquivo importa só `lib/banco.ts` e `lib/historico.ts` de propósito: ele é chamado de dentro de
// `lib/vagas.ts` e `lib/candidatos.ts`, então qualquer import que voltasse a eles fecharia um ciclo.
// A semeadura, que precisa do conteúdo de `lib/demo.ts`, mora no outro módulo.
import { banco } from "./banco";
import { apagar as apagarResultado } from "./historico";

/** Contagem do que existe de exemplo agora; alimenta o cartão de Configurações e os avisos das listas. */
export type ContagemExemplo = { vagas: number; candidatos: number; entrevistas: number };

function contar(consulta: string): number {
  return Number((banco().prepare(consulta).get() as { total: number }).total);
}

export function contarExemplos(): ContagemExemplo {
  return {
    vagas: contar("SELECT COUNT(*) AS total FROM vagas WHERE exemplo = 1"),
    candidatos: contar("SELECT COUNT(*) AS total FROM candidatos WHERE exemplo = 1"),
    entrevistas: contar("SELECT COUNT(*) AS total FROM entrevistas WHERE exemplo = 1"),
  };
}

export function temDadosDeExemplo(): boolean {
  const c = contarExemplos();
  return c.vagas + c.candidatos + c.entrevistas > 0;
}

/**
 * Apaga as entrevistas de exemplo que casam com a condição dada (um trecho de SQL sobre `entrevistas`)
 * e devolve os ids de parecer que ficaram órfãos.
 *
 * O parecer mora em `resultados` (lib/historico.ts), que tem conexão própria para o mesmo
 * `app.sqlite`: apagá-lo de dentro de uma transação aberta aqui encontraria o banco ocupado. Por isso
 * nenhum BEGIN neste módulo e por isso o chamador apaga os pareceres **depois**.
 */
function apagarEntrevistasDeExemplo(condicao: string): string[] {
  const d = banco();
  const alvo = `SELECT id, resultadoId FROM entrevistas WHERE exemplo = 1 AND ${condicao}`;
  const linhas = d.prepare(alvo).all() as { id: string; resultadoId: string | null }[];
  if (!linhas.length) return [];

  const marcadores = linhas.map(() => "?").join(", ");
  const ids = linhas.map((l) => l.id);
  d.prepare(`DELETE FROM mensagens_entrevista WHERE entrevistaId IN (${marcadores})`).run(...ids);
  d.prepare(`DELETE FROM entrevistas WHERE id IN (${marcadores})`).run(...ids);
  return linhas.map((l) => l.resultadoId).filter((id): id is string => Boolean(id));
}

function apagarPareceres(ids: string[]): void {
  for (const id of ids) apagarResultado(id);
}

/**
 * Apaga as vagas de exemplo e as entrevistas delas.
 *
 * Chamada quando a primeira vaga de verdade é criada: é o momento em que quem instalou deixou de
 * estar avaliando o app e passou a usá-lo, e a lista de vagas dele não pode ter uma vaga que ele
 * nunca abriu. Uma vaga de exemplo com alguma entrevista de verdade dentro fica de pé — a entrevista
 * real é o dado que manda.
 */
export function removerVagasDeExemplo(): void {
  const d = banco();
  const orfaos = apagarEntrevistasDeExemplo("vagaId IN (SELECT id FROM vagas WHERE exemplo = 1)");
  const { changes } = d.prepare("DELETE FROM vagas WHERE exemplo = 1 AND id NOT IN (SELECT vagaId FROM entrevistas)").run();
  apagarPareceres(orfaos);
  if (Number(changes) > 0 || orfaos.length) {
    console.info(`Primeira vaga de verdade criada: ${Number(changes)} vaga(s) de exemplo e ${orfaos.length} parecer(es) de exemplo removidos.`);
  }
  removerCandidatosSemEntrevista();
}

/**
 * Apaga os candidatos de exemplo, com as fontes e as entrevistas deles.
 *
 * Chamada quando o primeiro candidato de verdade é cadastrado. A vaga de exemplo pode sobreviver a
 * isto (é para ela que o candidato novo costuma ser convidado enquanto ninguém abriu a própria), e é
 * `removerVagasDeExemplo` quem a tira de cena depois.
 */
export function removerCandidatosDeExemplo(): void {
  const d = banco();
  const orfaos = apagarEntrevistasDeExemplo("candidatoId IN (SELECT id FROM candidatos WHERE exemplo = 1)");
  d.prepare("DELETE FROM fontes_candidato WHERE candidatoId IN (SELECT id FROM candidatos WHERE exemplo = 1 AND id NOT IN (SELECT candidatoId FROM entrevistas))").run();
  const { changes } = d.prepare("DELETE FROM candidatos WHERE exemplo = 1 AND id NOT IN (SELECT candidatoId FROM entrevistas)").run();
  apagarPareceres(orfaos);
  if (Number(changes) > 0 || orfaos.length) {
    console.info(`Primeiro candidato de verdade cadastrado: ${Number(changes)} candidato(s) de exemplo e ${orfaos.length} parecer(es) de exemplo removidos.`);
  }
}

/** Candidato de exemplo que não tem mais nenhuma entrevista: uma linha na lista sem histórico nenhum
 * e com o chip "Exemplo" não diria nada a ninguém. */
function removerCandidatosSemEntrevista(): void {
  const d = banco();
  d.prepare("DELETE FROM fontes_candidato WHERE candidatoId IN (SELECT id FROM candidatos WHERE exemplo = 1 AND id NOT IN (SELECT candidatoId FROM entrevistas))").run();
  d.prepare("DELETE FROM candidatos WHERE exemplo = 1 AND id NOT IN (SELECT candidatoId FROM entrevistas)").run();
}

/**
 * Apaga o conjunto de exemplo inteiro, a pedido de quem clicou em "Apagar os dados de exemplo".
 *
 * Aqui a pergunta "nada de verdade aponta para mim?" não se aplica: quem pediu para apagar sabe o que
 * está pedindo. Mesmo assim, só o que está marcado como exemplo é tocado — uma entrevista de verdade
 * numa vaga de exemplo continua de pé, e a vaga com ela.
 */
export function removerTudoDeExemplo(): ContagemExemplo {
  const antes = contarExemplos();
  const d = banco();
  const orfaos = apagarEntrevistasDeExemplo("1 = 1");
  d.prepare("DELETE FROM fontes_candidato WHERE candidatoId IN (SELECT id FROM candidatos WHERE exemplo = 1 AND id NOT IN (SELECT candidatoId FROM entrevistas))").run();
  d.prepare("DELETE FROM candidatos WHERE exemplo = 1 AND id NOT IN (SELECT candidatoId FROM entrevistas)").run();
  d.prepare("DELETE FROM vagas WHERE exemplo = 1 AND id NOT IN (SELECT vagaId FROM entrevistas)").run();
  apagarPareceres(orfaos);

  const depois = contarExemplos();
  const removidos: ContagemExemplo = {
    vagas: antes.vagas - depois.vagas,
    candidatos: antes.candidatos - depois.candidatos,
    entrevistas: antes.entrevistas - depois.entrevistas,
  };
  console.info(`Dados de exemplo apagados a pedido: ${removidos.vagas} vaga(s), ${removidos.candidatos} candidato(s) e ${removidos.entrevistas} entrevista(s).`);
  return removidos;
}

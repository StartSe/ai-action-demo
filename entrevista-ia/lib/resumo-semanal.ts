// O resumo semanal (US-027): o que andou no processo desde a última vez, entregue por e-mail ou
// Slack sem ninguém abrir o app (`lib/rotinas-do-app.ts`).
//
// Mora acima das entidades, como `lib/painel.ts`, `lib/relatorios.ts` e `lib/comparacao.ts`: junta
// entrevista, candidato, vaga e parecer numa leitura só, e nenhum módulo de entidade o importa de
// volta. Tudo aqui é **soma sobre o que já está gravado** — nenhuma chamada de IA nasce numa rotina
// que roda de madrugada, e duas execuções seguidas têm de dizer a mesma coisa.
//
// **A janela aqui é de ACONTECIMENTOS, não de turma.** O Início e os Relatórios recortam a turma de
// convites (a data em que a entrevista nasceu) porque calculam taxas, e misturar turmas infla a
// conversão. Um resumo semanal responde outra pergunta — "o que aconteceu desde sexta?" —, então
// cada linha é lida pelo carimbo do próprio acontecimento: o convite pela data em que saiu, a
// conversa pela data em que terminou. Nenhuma taxa é calculada aqui, justamente por isso.
//
// A fila de decisão é a exceção e é de propósito: "o que está esperando você" é um estoque de agora,
// não um movimento da semana — um parecer parado há três semanas continua parado hoje.
import { faixaDaEntrevista, listarEntrevistasNoPainel, type EntrevistaNoPainel } from "./painel";
import { numero } from "./formato";
import { obter as obterVaga } from "./vagas";
import type { Recomendacao } from "./types";

/** Quantas entrevistas o resumo carrega. O mesmo teto das outras leituras do painel. */
const LIMITE = 500;

/** Quantas vagas cabem no texto antes de ele virar uma lista que ninguém lê. */
const VAGAS_NA_MENSAGEM = 6;

/** Uma vaga que teve movimento na semana, ou que tem parecer esperando decisão agora. */
export type VagaNoResumo = {
  vagaId: string;
  cargo: string;
  aberta: boolean;
  /** Convites que saíram dentro da janela. */
  convites: number;
  /** Conversas que terminaram dentro da janela. */
  concluidas: number;
  /** Pareceres prontos e sem decisão **agora** (estoque, não movimento da semana). */
  aguardandoDecisao: number;
};

/** O candidato mais bem avaliado entre as conversas concluídas na janela. */
export type MelhorDaSemana = {
  entrevistaId: string;
  candidatoNome: string;
  cargo: string;
  notaGeral: number;
  recomendacao: Recomendacao;
  /** O parecer em `lib/historico.ts`, para a notificação linkar `/r/<id>`. */
  resultadoId?: string;
};

export type ResumoSemanal = {
  de: string;
  ate: string;
  /** Uma linha por vaga com movimento na janela ou com decisão pendente; abertas primeiro. */
  vagas: VagaNoResumo[];
  convites: number;
  concluidas: number;
  aguardandoDecisao: number;
  melhor: MelhorDaSemana | null;
  /** Tudo o que este resumo conta é dado de exemplo (US-004). */
  exemplo: boolean;
  /** Nada se moveu e nada está esperando: a rotina não tem o que avisar. */
  vazio: boolean;
};

function dentro(carimbo: string | undefined, de: number, ate: number): boolean {
  if (!carimbo) return false;
  const instante = new Date(carimbo).getTime();
  return Number.isFinite(instante) && instante >= de && instante <= ate;
}

/** Um parecer pronto e ninguém decidiu ainda.
 *
 * A fila é a mesma aba "Concluídas" da tela Entrevistas (`faixaDaEntrevista`), restrita ao que já tem
 * parecer: uma entrevista `concluida` sem `avaliada` também está naquela aba, mas ali o que falta é o
 * parecer, não a decisão de quem lê o aviso — cobrá-la de quem recebe o e-mail seria pedir uma
 * decisão sobre uma conversa que ninguém leu ainda. */
function esperaDecisao(e: EntrevistaNoPainel): boolean {
  return e.status === "avaliada" && faixaDaEntrevista(e) === "concluidas";
}

/**
 * O resumo da janela, inteiro.
 *
 * Entrevistas canceladas ficam de fora, pelo mesmo motivo dos Relatórios: um convite que a própria
 * casa cancelou (ao encerrar a vaga, por exemplo) não é movimento do processo. Vencidas continuam
 * contando como convite enviado — o convite saiu de verdade.
 *
 * A quebra por vaga inclui vaga **encerrada** que ainda tem parecer esperando decisão: encerrar a
 * vaga não decide o que ficou pendente, e um resumo que só olha vagas abertas some justamente com o
 * que ninguém mais vai ver.
 */
export function resumoSemanal(desde: string, ate = new Date().toISOString()): ResumoSemanal {
  const de = new Date(desde).getTime();
  const fim = new Date(ate).getTime();

  const entrevistas = listarEntrevistasNoPainel({ limite: LIMITE }).filter((e) => e.status !== "cancelada");

  const porVaga = new Map<string, VagaNoResumo>();
  const cargos = new Map<string, { cargo: string; aberta: boolean }>();
  let exemplos = 0;
  let consideradas = 0;

  for (const entrevista of entrevistas) {
    const convidou = dentro(entrevista.convidadaEm ?? entrevista.criadoEm, de, fim);
    const concluiu = dentro(entrevista.concluidaEm, de, fim);
    const pendente = esperaDecisao(entrevista);
    if (!convidou && !concluiu && !pendente) continue;

    consideradas += 1;
    if (entrevista.exemplo) exemplos += 1;

    if (!cargos.has(entrevista.vagaId)) {
      const vaga = obterVaga(entrevista.vagaId);
      cargos.set(entrevista.vagaId, { cargo: vaga?.cargo ?? entrevista.vagaCargo, aberta: vaga?.status === "aberta" });
    }
    const dados = cargos.get(entrevista.vagaId) as { cargo: string; aberta: boolean };
    const linha = porVaga.get(entrevista.vagaId) ?? {
      vagaId: entrevista.vagaId,
      cargo: dados.cargo,
      aberta: dados.aberta,
      convites: 0,
      concluidas: 0,
      aguardandoDecisao: 0,
    };
    if (convidou) linha.convites += 1;
    if (concluiu) linha.concluidas += 1;
    if (pendente) linha.aguardandoDecisao += 1;
    porVaga.set(entrevista.vagaId, linha);
  }

  const vagas = [...porVaga.values()].sort((a, b) => {
    if (a.aberta !== b.aberta) return a.aberta ? -1 : 1;
    return b.convites + b.concluidas + b.aguardandoDecisao - (a.convites + a.concluidas + a.aguardandoDecisao);
  });

  const soma = (campo: keyof Pick<VagaNoResumo, "convites" | "concluidas" | "aguardandoDecisao">) =>
    vagas.reduce((total, v) => total + v[campo], 0);

  // O melhor da semana sai das conversas que TERMINARAM na janela: não existe carimbo de "o parecer
  // ficou pronto", e derivar a data de um `atualizadoEm` faria o mesmo candidato reaparecer toda vez
  // que alguém corrigisse um campo da vaga.
  const melhor = entrevistas
    .filter((e) => dentro(e.concluidaEm, de, fim) && typeof e.notaGeral === "number" && e.recomendacao)
    .sort((a, b) => (b.notaGeral as number) - (a.notaGeral as number))[0];

  return {
    de: new Date(de).toISOString(),
    ate: new Date(fim).toISOString(),
    vagas,
    convites: soma("convites"),
    concluidas: soma("concluidas"),
    aguardandoDecisao: soma("aguardandoDecisao"),
    melhor: melhor
      ? {
          entrevistaId: melhor.id,
          candidatoNome: melhor.candidatoNome,
          cargo: melhor.vagaCargo,
          notaGeral: melhor.notaGeral as number,
          recomendacao: melhor.recomendacao as Recomendacao,
          resultadoId: melhor.resultadoId,
        }
      : null,
    exemplo: consideradas > 0 && exemplos === consideradas,
    vazio: consideradas === 0,
  };
}

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * O resumo em palavras, do jeito que ele chega no e-mail ou no Slack.
 *
 * Fica aqui, e não no executor da rotina, pelo mesmo motivo da mensagem de convite (`lib/convite.ts`):
 * texto que sai do app é escrito uma vez só. Sem números soltos sem legenda — cada linha diz de qual
 * vaga está falando, porque quem lê no celular não tem a tela ao lado para conferir.
 */
export function textoDoResumo(resumo: ResumoSemanal, limiteVagas = VAGAS_NA_MENSAGEM): string {
  const linhas: string[] = [];

  linhas.push(
    `${plural(resumo.convites, "convite enviado", "convites enviados")}, ${plural(resumo.concluidas, "conversa concluída", "conversas concluídas")} e ${plural(resumo.aguardandoDecisao, "parecer esperando", "pareceres esperando")} a sua decisão.`,
  );

  if (resumo.vagas.length > 0) {
    linhas.push("");
    for (const vaga of resumo.vagas.slice(0, limiteVagas)) {
      const partes = [`${vaga.convites} convidado${vaga.convites === 1 ? "" : "s"}`, `${vaga.concluidas} concluída${vaga.concluidas === 1 ? "" : "s"}`];
      if (vaga.aguardandoDecisao > 0) partes.push(`${vaga.aguardandoDecisao} esperando decisão`);
      linhas.push(`· ${vaga.cargo}${vaga.aberta ? "" : " (encerrada)"}: ${partes.join(", ")}.`);
    }
    const sobrando = resumo.vagas.length - limiteVagas;
    if (sobrando > 0) linhas.push(`· e mais ${plural(sobrando, "vaga", "vagas")}.`);
  }

  if (resumo.melhor) {
    linhas.push(
      "",
      `Melhor avaliado da semana: ${resumo.melhor.candidatoNome} (${resumo.melhor.cargo}), nota ${numero(resumo.melhor.notaGeral, 1)} — recomendação: ${resumo.melhor.recomendacao}.`,
    );
  }

  // O selo de exemplo vem por último e sempre com o caminho de saída: um resumo bonito montado sobre
  // dados de demonstração é a única coisa que este aviso não pode deixar parecer real.
  if (resumo.exemplo) {
    linhas.push("", "Estes números são dos dados de exemplo do app. Conecte a inteligência artificial em Configurações e cadastre uma vaga de verdade para receber os seus.");
  }

  return linhas.join("\n");
}

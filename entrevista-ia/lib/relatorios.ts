// Os Relatórios (US-026): "quantos convites viram entrevista, quanto tempo isso leva e o que saiu
// disso?", por vaga e por período.
//
// Tudo aqui é **cálculo puro sobre o que já está gravado**, como no Início (`lib/inicio.ts`): nenhuma
// chamada de IA nasce ao abrir esta tela. Um número que a soma responde não pode depender de um
// modelo — duas aberturas seguidas discordariam entre si, e é justamente este relatório que vai para
// a liderança.
//
// Mora acima das entidades (como `lib/painel.ts` e `lib/comparacao.ts`): junta entrevista, candidato,
// vaga e parecer, e nenhum módulo de entidade pode importá-lo de volta.
//
// **O período recorta a TURMA de convites, não os acontecimentos.** A janela é aplicada sobre a data
// em que a entrevista nasceu (`criadoEm`, o mesmo filtro de `listar()`), e não sobre a conclusão:
// contar as conversas concluídas nos últimos 30 dias contra os convites enviados nos últimos 30 dias
// misturaria duas turmas diferentes, e a taxa de conclusão de um mês movimentado apareceria maior do
// que é. Aqui todas as linhas do funil falam das MESMAS pessoas.
import { listarEntrevistasNoPainel, type EntrevistaNoPainel } from "./painel";
import { ROTULO_DECISAO, ROTULO_NIVEL_VOZ, situacaoDaEntrevista } from "./formato";
import { obter as obterVaga } from "./vagas";
import { contarEntrevistas, type Decisao, type NivelVoz } from "./entrevistas";
import type { Recomendacao } from "./types";

const DIA_MS = 86_400_000;
const HORA_MS = 3_600_000;

/** Os períodos prontos que a tela oferece; qualquer outro valor cai no padrão. */
export const DIAS_OFERECIDOS = [7, 30, 90] as const;
export const DIAS_PADRAO = 30;

/** Quantas entrevistas o relatório carrega. O mesmo teto das outras leituras do painel. */
const LIMITE = 500;

/** Uma etapa do funil. A ordem é a do processo, e os valores são sempre decrescentes por construção
 * (ver `etapaAlcancada`): um funil que sobe no meio é lido como erro de conta, não como informação. */
export type EtapaFunil = {
  chave: "convidados" | "abriram" | "concluiram" | "avaliadas" | "decididas";
  rotulo: string;
  valor: number;
};

/** Uma fatia de distribuição (recomendações, decisões, como a conversa aconteceu). */
export type Fatia = { chave: string; rotulo: string; valor: number };

/** Uma entrevista do período como a tabela e a planilha a mostram. */
export type LinhaRelatorio = {
  entrevistaId: string;
  candidatoId: string;
  candidatoNome: string;
  vagaId: string;
  vagaCargo: string;
  /** A situação em palavras (`situacaoDaEntrevista`), a mesma das outras telas. */
  situacao: string;
  convidadaEm: string;
  concluidaEm?: string;
  /** Do convite à conclusão, em horas com uma casa; ausente enquanto a conversa não terminou. */
  horas?: number;
  nivelVoz?: NivelVoz;
  notaGeral?: number;
  recomendacao?: string;
  decisao?: Decisao;
  resultadoId?: string;
  exemplo: boolean;
};

export type Relatorio = {
  periodo: {
    de: string;
    ate: string;
    /** Quantos dias o atalho escolhido cobre; `null` quando o período foi digitado à mão. */
    dias: number | null;
  };
  /** A vaga escolhida no filtro; `null` quando o relatório é de todas. */
  vaga: { id: string; cargo: string } | null;
  funil: EtapaFunil[];
  /** Do convite à conclusão, em horas. `null` quando ninguém concluiu no período. */
  tempoMedioHoras: number | null;
  tempoMedianoHoras: number | null;
  /** Concluídas ÷ convidados, entre 0 e 1. `null` quando não houve convite no período. */
  taxaConclusao: number | null;
  /** A média das notas dos pareceres do período. `null` enquanto nenhum ficou pronto. */
  notaMedia: number | null;
  recomendacoes: Fatia[];
  decisoes: Fatia[];
  comoFoi: Fatia[];
  itens: LinhaRelatorio[];
  /** Tudo o que este relatório mostra é dado de exemplo (US-004). */
  exemplo: boolean;
  /** Quantas entrevistas existem sem filtro nenhum: é o que separa "o app ainda está vazio" de
   * "nada aconteceu neste período", que pedem telas diferentes. */
  totalGeral: number;
};

/** O recorte pedido, já resolvido em duas datas. */
export type PeriodoPedido = { vagaId?: string; de: string; ate: string; dias: number | null };

function comecoDoDia(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, (mes ?? 1) - 1, dia ?? 1, 0, 0, 0, 0);
}

/**
 * O período que veio na barra de endereço, para a tela, a planilha, a impressão e o relatório salvo
 * lerem o MESMO recorte a partir dos mesmos parâmetros.
 *
 * `dias=7|30|90` é o atalho; `de`/`ate` (em `aaaa-mm-dd`) é o período digitado, e nele o dia final
 * entra inteiro — quem escolhe "até 18/09" espera ver o que aconteceu no dia 18. Qualquer valor que
 * não dê para entender cai nos últimos 30 dias, porque uma tela de números não pode ficar em branco
 * por causa de um endereço malformado.
 */
export function periodoDoPedido(params: URLSearchParams, agora = new Date()): PeriodoPedido {
  const vagaId = params.get("vagaId") || undefined;
  const de = params.get("de") ?? "";
  const ate = params.get("ate") ?? "";
  const formato = /^\d{4}-\d{2}-\d{2}$/;

  if (formato.test(de) && formato.test(ate)) {
    const inicio = comecoDoDia(de);
    const fim = comecoDoDia(ate);
    fim.setHours(23, 59, 59, 999);
    if (!Number.isNaN(inicio.getTime()) && !Number.isNaN(fim.getTime()) && inicio <= fim) {
      return { vagaId, de: inicio.toISOString(), ate: fim.toISOString(), dias: null };
    }
  }

  const pedidos = Number(params.get("dias"));
  const dias = (DIAS_OFERECIDOS as readonly number[]).includes(pedidos) ? pedidos : DIAS_PADRAO;
  return { vagaId, de: new Date(agora.getTime() - dias * DIA_MS).toISOString(), ate: agora.toISOString(), dias };
}

/**
 * Até que etapa esta entrevista chegou.
 *
 * Os carimbos são lidos em cascata, de trás para frente: quem concluiu abriu o link, mesmo sem
 * `abertaEm` — uma conversa conduzida pelo agente da ElevenLabs volta pelo aviso de pós-conversa e
 * nunca passa pela rota que carimba a abertura. Sem a cascata, o funil mostraria mais gente
 * concluindo do que abrindo, que é a forma mais rápida de um painel perder a confiança de quem lê.
 */
function etapaAlcancada(e: EntrevistaNoPainel): number {
  if (e.decisao) return 5;
  if (e.resultadoId || e.status === "avaliada") return 4;
  if (e.concluidaEm || e.status === "concluida") return 3;
  if (e.abertaEm || e.iniciadaEm || e.status === "aberta" || e.status === "em_andamento") return 2;
  return 1;
}

/** Do convite à conclusão, em horas com uma casa. */
function horasAteConcluir(e: EntrevistaNoPainel): number | undefined {
  if (!e.concluidaEm) return undefined;
  const inicio = new Date(e.convidadaEm ?? e.criadoEm).getTime();
  const fim = new Date(e.concluidaEm).getTime();
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim < inicio) return undefined;
  return Math.round(((fim - inicio) / HORA_MS) * 10) / 10;
}

function media(valores: number[]): number | null {
  if (!valores.length) return null;
  return Math.round((valores.reduce((soma, v) => soma + v, 0) / valores.length) * 10) / 10;
}

/** A mediana acompanha a média porque uma entrevista respondida duas semanas depois puxa a média
 * inteira: "metade respondeu em até X horas" é o número que descreve o processo. */
function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  const valor = ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
  return Math.round(valor * 10) / 10;
}

const RECOMENDACOES: Recomendacao[] = ["avançar", "avaliar com o gestor", "não avançar"];
const DECISOES: Decisao[] = ["avancar", "aguardar", "reprovar"];
const NIVEIS: NivelVoz[] = ["agente", "navegador", "texto"];

function contar<T extends string>(valores: (T | undefined)[], chaves: T[], rotulo: (c: T) => string): Fatia[] {
  return chaves.map((chave) => ({ chave, rotulo: rotulo(chave), valor: valores.filter((v) => v === chave).length }));
}

/**
 * Como as conversas concluídas aconteceram (D3).
 *
 * A quarta fatia só aparece quando existe: uma conversa concluída sem nível registrado é uma que
 * entrou por um caminho que não o anotou (um aviso de pós-conversa antigo, uma conclusão feita à
 * mão). Escondê-la faria as três primeiras somarem menos que o total de concluídas na mesma tela.
 */
function comoFoi(niveis: (NivelVoz | undefined)[], concluidas: number): Fatia[] {
  const fatias = contar(niveis, NIVEIS, (n) => ROTULO_NIVEL_VOZ[n]);
  const semNivel = concluidas - fatias.reduce((soma, f) => soma + f.valor, 0);
  if (semNivel > 0) fatias.push({ chave: "nao_registrado", rotulo: "Não registrado", valor: semNivel });
  return fatias;
}

/**
 * O relatório do período, inteiro.
 *
 * Entrevistas canceladas ficam de fora de tudo: um convite cancelado pela pessoa de RH (ao encerrar a
 * vaga, por exemplo) não é uma conversa que deixou de acontecer, e contá-lo derrubaria a taxa de
 * conclusão por uma decisão da própria casa. **Convite vencido continua contando** — é exatamente o
 * que o relatório existe para mostrar.
 */
export function relatorio({ vagaId, de, ate, dias = null }: { vagaId?: string; de: string; ate: string; dias?: number | null }): Relatorio {
  const entrevistas = listarEntrevistasNoPainel({ vagaId, periodo: { de, ate }, limite: LIMITE }).filter((e) => e.status !== "cancelada");

  const etapas = entrevistas.map(etapaAlcancada);
  const naEtapa = (minimo: number) => etapas.filter((n) => n >= minimo).length;

  const horas = entrevistas.map(horasAteConcluir).filter((h): h is number => typeof h === "number");
  const notas = entrevistas.map((e) => e.notaGeral).filter((n): n is number => typeof n === "number");
  const concluidas = naEtapa(3);

  const vaga = vagaId ? obterVaga(vagaId) : null;

  return {
    periodo: { de, ate, dias },
    vaga: vaga ? { id: vaga.id, cargo: vaga.cargo } : null,
    funil: [
      { chave: "convidados", rotulo: "Convidados", valor: entrevistas.length },
      { chave: "abriram", rotulo: "Abriram o link", valor: naEtapa(2) },
      { chave: "concluiram", rotulo: "Concluíram a conversa", valor: concluidas },
      { chave: "avaliadas", rotulo: "Com parecer pronto", valor: naEtapa(4) },
      { chave: "decididas", rotulo: "Com decisão registrada", valor: naEtapa(5) },
    ],
    tempoMedioHoras: media(horas),
    tempoMedianoHoras: mediana(horas),
    taxaConclusao: entrevistas.length ? concluidas / entrevistas.length : null,
    notaMedia: media(notas),
    recomendacoes: contar(
      entrevistas.map((e) => e.recomendacao),
      RECOMENDACOES,
      (r) => r.charAt(0).toUpperCase() + r.slice(1),
    ),
    decisoes: [
      ...contar(
        entrevistas.map((e) => e.decisao),
        DECISOES,
        (d) => ROTULO_DECISAO[d],
      ),
      // Quantos pareceres prontos ainda esperam alguém: é a fila que o Início mostra, aqui em forma
      // de distribuição. Sem ela, um mês em que ninguém decidiu nada apareceria como três zeros sem
      // explicação.
      { chave: "sem_decisao", rotulo: "Ainda sem decisão", valor: naEtapa(4) - naEtapa(5) },
    ],
    comoFoi: comoFoi(entrevistas.filter((e) => etapaAlcancada(e) >= 3).map((e) => e.nivelVoz), concluidas),
    itens: entrevistas.map((e) => ({
      entrevistaId: e.id,
      candidatoId: e.candidatoId,
      candidatoNome: e.candidatoNome,
      vagaId: e.vagaId,
      vagaCargo: e.vagaCargo,
      situacao: situacaoDaEntrevista(e).rotulo,
      convidadaEm: e.convidadaEm ?? e.criadoEm,
      concluidaEm: e.concluidaEm,
      horas: horasAteConcluir(e),
      nivelVoz: e.nivelVoz,
      notaGeral: e.notaGeral,
      recomendacao: e.recomendacao,
      decisao: e.decisao,
      resultadoId: e.resultadoId,
      exemplo: e.exemplo,
    })),
    exemplo: entrevistas.length > 0 && entrevistas.every((e) => e.exemplo),
    totalGeral: contarEntrevistas(),
  };
}

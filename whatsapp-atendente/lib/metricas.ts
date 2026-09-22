/**
 * Os números do atendimento: fonte ÚNICA de tudo o que Início e Relatórios mostram. Nenhuma tela
 * calcula nada por conta própria — se um número precisa mudar, muda aqui e as duas telas mudam juntas.
 *
 * As definições, escritas uma vez para valerem em todo lugar:
 *
 * - **Conversa no período**: teve pelo menos uma mensagem do cliente dentro do período. Uma conversa
 *   antiga que ninguém reabriu não conta de novo a cada dia.
 * - **Resolvida pela IA**: a conversa está em `ia` ou `resolvida` e não tem NENHUMA mensagem escrita
 *   por uma pessoa. Basta alguém ter respondido uma vez para ela deixar de contar como resolvida pela
 *   IA, mesmo que a conversa tenha voltado para a IA depois.
 * - **Passada para uma pessoa**: a conversa passou por `atencao` ou `humano` em algum momento (coluna
 *   `passou_por_pessoa` da tabela `conversas`, gravada na mudança de status). O status de agora sozinho
 *   não serviria: uma conversa devolvida para a IA voltaria a parecer que nunca precisou de ninguém.
 * - **Tempo médio de resposta**: média de `tempo_resposta_ms` das respostas do atendente (as da IA e as
 *   escritas por uma pessoa) gravadas no período. Respostas sem essa medida ficam de fora da média em
 *   vez de entrarem como zero.
 *
 * Os períodos são alinhados à meia-noite: "hoje" é o dia de hoje, "7d" são os sete dias que terminam
 * hoje e "30d", os trinta. É o que faz o gráfico ter barras de dias inteiros e a comparação ser com um
 * período do mesmo tamanho — "hoje" contra ontem, "7d" contra os sete dias anteriores. (O filtro da
 * lista de Conversas é outra coisa: lá "7 dias" é rolante, ver `inicioDoPeriodo` em lib/conversas.ts.)
 *
 * Tudo é consultado no banco a cada chamada, sem memória entre chamadas: as telas se atualizam
 * sozinhas e um número guardado ficaria velho na primeira mensagem que chegasse.
 */
import { ASSUNTO_OUTROS } from "./assuntos";
import { bancoDeConversas, isoDeBanco, listarConversas, paraTextoDeBanco } from "./conversas";
import { contatosDe } from "./memoria";
import type { MotivoTransferencia } from "./transferencia";
import { PAPEIS_DE_CONVERSA, type AssuntoMetricas, type CanalOrigem, type DiaMetricas, type Metricas, type PeriodoMetricas, type StatusConversa, type VariacaoMetricas } from "./types";

/** Só as mensagens que são conversa (cliente, atendente, pessoa): notas e eventos não contam como mensagem. */
const SO_CONVERSA = `m.papel IN (${PAPEIS_DE_CONVERSA.map((p) => `'${p}'`).join(", ")})`;

/** Quantos dias inteiros cada período cobre, contando o de hoje. */
const DIAS: Record<PeriodoMetricas, number> = { hoje: 1, "7d": 7, "30d": 30 };

/** Conversas ainda sem assunto entram no mesmo "Outros" da lista de lib/assuntos.ts. */
const SEM_ASSUNTO = ASSUNTO_OUTROS;

interface Janela {
  inicio: Date;
  fim: Date;
}

function meiaNoite(base: Date = new Date()): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  return d;
}

function menosDias(d: Date, dias: number): Date {
  const saida = new Date(d);
  saida.setDate(saida.getDate() - dias);
  return saida;
}

/**
 * O período pedido e o período imediatamente anterior, do mesmo tamanho, para a comparação. As duas
 * janelas vão de meia-noite a meia-noite: o fim do período de hoje é a meia-noite de amanhã, não
 * "agora". Com "agora" no lugar, a mensagem gravada no mesmo segundo da consulta ficaria de fora — as
 * datas do banco são gravadas em segundos inteiros, e o limite de cima é exclusivo.
 */
function janelas(periodo: PeriodoMetricas): { atual: Janela; anterior: Janela } {
  const dias = DIAS[periodo];
  const inicio = menosDias(meiaNoite(), dias - 1);
  return {
    atual: { inicio, fim: menosDias(inicio, -dias) },
    anterior: { inicio: menosDias(inicio, dias), fim: inicio },
  };
}

/** A data local em "AAAA-MM-DD": a chave de um dia do gráfico. */
function chaveDoDia(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Quanto cresceu ou caiu, em pontos percentuais; `null` quando não havia base de comparação. */
function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

// A conversa entrou no período (tem mensagem do cliente dentro dele). Dois parâmetros: início e fim.
const NO_PERIODO = `EXISTS (
  SELECT 1 FROM mensagens m
   WHERE m.numero = c.numero AND m.papel = 'cliente' AND m.criado_em >= ? AND m.criado_em < ?
)`;

// Ninguém escreveu nessa conversa no lugar da IA, em momento nenhum.
const SEM_PESSOA = `NOT EXISTS (SELECT 1 FROM mensagens h WHERE h.numero = c.numero AND h.papel = 'humano')`;

const RESOLVIDA_PELA_IA = `c.status IN ('ia', 'resolvida') AND ${SEM_PESSOA}`;

interface Totais {
  conversas: number;
  resolvidasIA: number;
  passadasPessoa: number;
  tempoMedioMs: number;
}

function totais({ inicio, fim }: Janela): Totais {
  const d = bancoDeConversas();
  const de = paraTextoDeBanco(inicio);
  const ate = paraTextoDeBanco(fim);

  const linha = d
    .prepare(
      `SELECT COUNT(*) AS conversas,
              SUM(CASE WHEN ${RESOLVIDA_PELA_IA} THEN 1 ELSE 0 END) AS resolvidas,
              SUM(CASE WHEN c.passou_por_pessoa = 1 THEN 1 ELSE 0 END) AS pessoa
         FROM conversas c
        WHERE ${NO_PERIODO}`
    )
    .get(de, ate) as { conversas: number; resolvidas: number | null; pessoa: number | null };

  const tempo = d
    .prepare(
      `SELECT AVG(tempo_resposta_ms) AS media
         FROM mensagens
        WHERE papel IN ('atendente', 'humano') AND tempo_resposta_ms IS NOT NULL
          AND criado_em >= ? AND criado_em < ?`
    )
    .get(de, ate) as { media: number | null };

  return {
    conversas: Number(linha.conversas ?? 0),
    resolvidasIA: Number(linha.resolvidas ?? 0),
    passadasPessoa: Number(linha.pessoa ?? 0),
    tempoMedioMs: Math.round(Number(tempo.media ?? 0)),
  };
}

/** Um ponto por dia do período, os dias sem conversa nenhuma incluídos, para o gráfico não ter buracos. */
function porDia({ inicio, fim }: Janela, dias: number): DiaMetricas[] {
  const linhas = bancoDeConversas()
    .prepare(
      `SELECT date(m.criado_em, 'localtime') AS dia,
              COUNT(DISTINCT m.numero) AS conversas,
              COUNT(DISTINCT CASE WHEN ${RESOLVIDA_PELA_IA} THEN m.numero END) AS resolvidas
         FROM mensagens m
         JOIN conversas c ON c.numero = m.numero
        WHERE m.papel = 'cliente' AND m.criado_em >= ? AND m.criado_em < ?
        GROUP BY dia`
    )
    .all(paraTextoDeBanco(inicio), paraTextoDeBanco(fim)) as { dia: string; conversas: number; resolvidas: number }[];

  const medidos = new Map(linhas.map((l) => [l.dia, l]));
  const saida: DiaMetricas[] = [];
  for (let i = 0; i < dias; i++) {
    const chave = chaveDoDia(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i));
    const medido = medidos.get(chave);
    saida.push({ dia: chave, conversas: Number(medido?.conversas ?? 0), resolvidasIA: Number(medido?.resolvidas ?? 0) });
  }
  return saida;
}

/** Do assunto mais falado para o menos falado; conversas ainda sem assunto entram como "Outros". */
function assuntos({ inicio, fim }: Janela): AssuntoMetricas[] {
  const linhas = bancoDeConversas()
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(c.assunto), ''), ?) AS assunto, COUNT(*) AS total
         FROM conversas c
        WHERE ${NO_PERIODO}
        GROUP BY assunto
        ORDER BY total DESC, assunto`
    )
    .all(SEM_ASSUNTO, paraTextoDeBanco(inicio), paraTextoDeBanco(fim)) as { assunto: string; total: number }[];
  return linhas.map((l) => ({ assunto: l.assunto, total: Number(l.total) }));
}

/**
 * Todos os números do período, com a comparação com o período anterior de mesmo tamanho.
 *
 * `atencao` é a exceção proposital: ela NÃO é filtrada pelo período. Quem está esperando uma pessoa
 * desde ontem continua esperando hoje, e o cartão "precisam de você" ficaria mentindo se as conversas
 * de ontem sumissem da conta ao virar o dia.
 */
export function calcular(periodo: PeriodoMetricas): Metricas {
  const { atual, anterior } = janelas(periodo);
  const agora = totais(atual);
  const antes = totais(anterior);

  const comparacao: VariacaoMetricas = {
    conversas: variacao(agora.conversas, antes.conversas),
    resolvidasIA: variacao(agora.resolvidasIA, antes.resolvidasIA),
    passadasPessoa: variacao(agora.passadasPessoa, antes.passadasPessoa),
    tempoMedioMs: variacao(agora.tempoMedioMs, antes.tempoMedioMs),
  };

  return {
    ...agora,
    variacao: comparacao,
    porDia: porDia(atual, DIAS[periodo]),
    assuntos: assuntos(atual),
    atencao: listarConversas({ status: "atencao" }),
  };
}

// --- Exportação em planilha -------------------------------------------------------------------
//
// Uma linha por conversa do período, para quem quer olhar conversa a conversa fora do app. O recorte
// é a CONVERSA inteira, e não só o trecho dela dentro do período: quem abre a planilha quer saber
// quando aquela conversa começou, quantas mensagens ela teve e quanto o atendente levou para
// responder nela — não a fatia de sete dias. Por isso o "tempo médio de resposta" de uma linha pode
// não bater com o indicador do topo da tela, que é a média das respostas gravadas no período.

/** Uma conversa do período como a planilha a descreve (app/api/metricas/exportar). */
export interface LinhaExportacao {
  numero: string;
  nome: string;
  origem: CanalOrigem;
  status: StatusConversa;
  assunto: string | null;
  /** Primeira e última mensagem da conversa, em ISO; nulas numa conversa ainda sem mensagem. */
  primeiraMensagem: string | null;
  ultimaMensagem: string | null;
  totalMensagens: number;
  resolvidaIA: boolean;
  /** Média das respostas medidas nesta conversa, em milissegundos; 0 quando nenhuma foi medida. */
  tempoMedioMs: number;
  /** Por que a IA passou a conversa para uma pessoa; nulo quando não passou (ou já foi devolvida). */
  motivoTransferencia: MotivoTransferencia | null;
  /** O que o cliente informou de si ao longo das conversas (lib/memoria.ts); nulo quando não informou. */
  nomeInformado: string | null;
  email: string | null;
  telefoneRetorno: string | null;
  /** As etiquetas que a equipe pôs nesta conversa (lib/etiquetas.ts); lista vazia quando não há nenhuma. */
  etiquetas: string[];
}

type LinhaAgregada = {
  numero: string;
  primeira: string | null;
  ultima: string | null;
  mensagens: number;
  tempo: number | null;
  resolvida: number;
};

/**
 * As conversas do período, da mais recente para a mais antiga. O status, o nome e a origem vêm de
 * `listarConversas` (lib/conversas.ts continua sendo o dono do formato, inclusive do status que é
 * calculado na leitura); daqui saem só os números de cada conversa.
 */
export function linhasParaExportar(periodo: PeriodoMetricas): LinhaExportacao[] {
  const { atual } = janelas(periodo);
  const agregadas = bancoDeConversas()
    .prepare(
      `SELECT c.numero,
              (SELECT MIN(m.criado_em) FROM mensagens m WHERE m.numero = c.numero AND ${SO_CONVERSA}) AS primeira,
              (SELECT MAX(m.criado_em) FROM mensagens m WHERE m.numero = c.numero AND ${SO_CONVERSA}) AS ultima,
              (SELECT COUNT(*) FROM mensagens m WHERE m.numero = c.numero AND ${SO_CONVERSA}) AS mensagens,
              (SELECT AVG(m.tempo_resposta_ms) FROM mensagens m
                WHERE m.numero = c.numero AND m.papel IN ('atendente', 'humano') AND m.tempo_resposta_ms IS NOT NULL) AS tempo,
              CASE WHEN ${RESOLVIDA_PELA_IA} THEN 1 ELSE 0 END AS resolvida
         FROM conversas c
        WHERE ${NO_PERIODO}`
    )
    .all(paraTextoDeBanco(atual.inicio), paraTextoDeBanco(atual.fim)) as LinhaAgregada[];

  const porNumero = new Map(agregadas.map((l) => [l.numero, l]));
  // O que o atendente lembra de cada cliente vem numa consulta só (lib/memoria.ts é o dono da tabela):
  // é o nome, o e-mail e o telefone que ele mesmo informou, que é o que a equipe leva para o CRM.
  const contatos = contatosDe(agregadas.map((l) => l.numero));
  return listarConversas()
    .filter((c) => porNumero.has(c.numero))
    .map((c) => {
      const a = porNumero.get(c.numero) as LinhaAgregada;
      const contato = contatos.get(c.numero);
      return {
        numero: c.numero,
        nome: c.nome,
        origem: c.origem,
        status: c.status,
        assunto: c.assunto,
        primeiraMensagem: a.primeira ? isoDeBanco(a.primeira) : null,
        ultimaMensagem: a.ultima ? isoDeBanco(a.ultima) : null,
        totalMensagens: Number(a.mensagens ?? 0),
        resolvidaIA: Boolean(a.resolvida),
        tempoMedioMs: Math.round(Number(a.tempo ?? 0)),
        motivoTransferencia: c.motivoTransferencia,
        nomeInformado: contato?.nomeInformado ?? null,
        email: contato?.email ?? null,
        telefoneRetorno: contato?.telefoneRetorno ?? null,
        etiquetas: c.etiquetas,
      } satisfies LinhaExportacao;
    });
}

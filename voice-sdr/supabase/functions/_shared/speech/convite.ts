// Os textos do convite da reunião por e-mail (RF-509), um para cada lado.
//
// Moram aqui, e não em `app/src/copy/`, porque quem os emite é o servidor. Os
// dois lados têm registros diferentes (docs/padrao-de-interface.md seção 4):
//
// - **O do lead é a Sarah escrevendo**, no registro da fala: frase curta,
//   contração, o que vai acontecer dito como se diz em voz alta. É a
//   continuação da ligação em que ele acabou de ouvir "vou te mandar o convite
//   por e-mail".
// - **O do especialista é interface**: direto e declarativo, sem travessão, em
//   blocos rotulados. Quem lê está entre uma reunião e outra e procura o
//   horário, a sala e quem vai atender.
//
// Três regras seguram os dois:
//
// 1. **O horário sai no fuso de quem lê**, com o nome do fuso escrito ao lado.
//    Quem monta passa o fuso de cada destinatário; aqui não existe fuso da
//    conta.
// 2. **Marcador que pode faltar vira frase inteira alternativa**, nunca
//    remendo: lead sem nome é "Oi!", e não "Oi, !".
// 3. **Só o necessário.** O lead não recebe o resumo de passagem (é a leitura
//    que a Sarah fez dele, para o especialista); o especialista recebe o
//    telefone do lead só quando a reunião é por telefone, que é quando ele
//    precisa discar.
//
// Nomes de dia e de mês vêm de `rotularInstante`, que não depende do ICU.

import { rotularInstante } from '../agenda/horarios.ts'
import { nomeDoFuso } from '../discagem/janela.ts'

export type ModalidadeDoConvite = 'video' | 'telefone' | 'presencial'

export interface DadosDoConvite {
  readonly inicio: string
  readonly fim: string
  readonly modalidade: ModalidadeDoConvite
  /** `accounts.name`: quem a assistente representa. */
  readonly empresa: string
  /** `agents.name`: o nome com que a assistente se apresentou na ligação. */
  readonly assistente: string | null
  readonly especialista: { readonly nome: string; readonly sala: string | null; readonly fuso: string }
  readonly lead: {
    readonly nome: string | null
    readonly telefone: string | null
    readonly fuso: string
    readonly empresa: string | null
    readonly cidade: string | null
    readonly estado: string | null
    readonly origem: string | null
    readonly temperatura: string | null
    readonly entrouEm: string | null
    readonly ultimaAtividade: string | null
  }
  /** O resumo de passagem já em texto (`textoDoResumo`), ou nulo. */
  readonly resumo: string | null
  readonly notas: string | null
}

export interface TextoDoConvite {
  readonly assunto: string
  readonly corpo: string
}

const NOME_DA_MODALIDADE: Record<ModalidadeDoConvite, string> = {
  video: 'Vídeo',
  telefone: 'Telefone',
  presencial: 'Presencial',
}

/** "quinta-feira, 8 de outubro de 2026, 14h30 (horário de Manaus)". */
export function horarioNoFuso(instante: string, fuso: string): string {
  return `${rotularInstante(instante, fuso)} (horário de ${nomeDoFuso(fuso)})`
}

function duracaoEmMinutos(inicio: string, fim: string): number {
  return Math.round((Date.parse(fim) - Date.parse(inicio)) / 60_000)
}

/** Por onde o lead entra, dito como a Sarah diria. */
function caminhoDoLead(dados: DadosDoConvite): string {
  const quem = dados.especialista.nome
  if (dados.modalidade === 'video') {
    return dados.especialista.sala
      ? `É por vídeo, e o link pra entrar é este: ${dados.especialista.sala}`
      : `É por vídeo, e ${quem} te manda o link da sala antes de começar.`
  }
  if (dados.modalidade === 'telefone') return `É por telefone: ${quem} te liga no número em que a gente conversou.`
  return dados.especialista.sala
    ? `É presencial, neste endereço: ${dados.especialista.sala}`
    : `É presencial, e ${quem} te confirma o endereço antes do dia.`
}

export function textoDoConviteDoLead(dados: DadosDoConvite): TextoDoConvite {
  const nome = dados.lead.nome?.trim()
  const quem = dados.especialista.nome
  const saudacao = nome ? `Oi, ${nome}!` : 'Oi!'
  const assistente = dados.assistente?.trim() || null
  const apresentacao = assistente
    ? `Aqui é ${assistente}, da ${dados.empresa}.`
    : `Aqui é a assistente da ${dados.empresa}.`
  const corpo = [
    saudacao,
    '',
    `${apresentacao} Como a gente combinou, sua conversa com ${quem} ficou marcada pra ${horarioNoFuso(dados.inicio, dados.lead.fuso)}.`,
    '',
    caminhoDoLead(dados),
    '',
    'O convite vai anexado, é só abrir pra salvar na sua agenda.',
    '',
    'Até lá!',
    assistente ?? dados.empresa,
  ]
  return { assunto: `Sua conversa com ${quem} está marcada`, corpo: corpo.join('\n') }
}

const NOME_DA_ORIGEM: ReadonlyMap<string, string> = new Map([
  ['import', 'importação de planilha'],
  ['intake', 'formulário'],
  ['manual', 'cadastro manual'],
  ['whatsapp', 'conversa pelo WhatsApp'],
])

/** O histórico curto do lead: só as linhas que têm valor. */
function historicoDoLead(dados: DadosDoConvite): string[] {
  const lead = dados.lead
  const fuso = dados.especialista.fuso
  const local = [lead.cidade?.trim(), lead.estado?.trim()].filter(Boolean).join('/')
  const origem = lead.origem ? (NOME_DA_ORIGEM.get(lead.origem) ?? lead.origem) : null
  return [
    ...(lead.empresa?.trim() ? [`Empresa: ${lead.empresa.trim()}`] : []),
    ...(local ? [`Local: ${local}`] : []),
    ...(origem ? [`Origem: ${origem}`] : []),
    ...(lead.temperatura ? [`Temperatura: ${lead.temperatura}`] : []),
    ...(lead.entrouEm ? [`Entrou em: ${rotularInstante(lead.entrouEm, fuso)}`] : []),
    ...(lead.ultimaAtividade ? [`Última atividade: ${rotularInstante(lead.ultimaAtividade, fuso)}`] : []),
  ]
}

export function textoDoConviteDoEspecialista(dados: DadosDoConvite): TextoDoConvite {
  const nome = dados.lead.nome?.trim() || 'Lead sem nome'
  const sala = dados.especialista.sala?.trim() || null
  const historico = historicoDoLead(dados)
  const corpo = [
    'Reunião marcada pela assistente.',
    '',
    `Lead: ${nome}`,
    `Quando: ${horarioNoFuso(dados.inicio, dados.especialista.fuso)}`,
    `Duração: ${duracaoEmMinutos(dados.inicio, dados.fim)} min`,
    `Modalidade: ${NOME_DA_MODALIDADE[dados.modalidade]}`,
    ...(sala ? [`${dados.modalidade === 'presencial' ? 'Endereço' : 'Sala'}: ${sala}`] : []),
    ...(dados.modalidade === 'telefone' && dados.lead.telefone ? [`Telefone do lead: ${dados.lead.telefone}`] : []),
    '',
    'Resumo de passagem:',
    dados.resumo ?? 'Sem resumo de passagem registrado.',
    ...(historico.length > 0 ? ['', 'Histórico do lead:', ...historico] : []),
    ...(dados.notas ? ['', 'Notas da marcação:', dados.notas] : []),
  ]
  const quando = rotularInstante(dados.inicio, dados.especialista.fuso)
  return { assunto: `Reunião marcada com ${nome}: ${quando}`, corpo: corpo.join('\n') }
}

// Literais dos blocos que a F4 acrescentou à ficha da chamada (`/chamadas/:id`,
// RF-414, RF-415): de onde veio a classificação, a correção à mão e a avaliação
// por critério. O resto da ficha continua em `copy/chamadas.ts`.
//
// Três decisões de texto:
//
// - **A fonte da classificação é frase, nunca código.** `tool`, `backfill` e
//   `human` não aparecem na tela; quem escolhe a frase é `fraseDaFonte`, em
//   `chamadas/classificacao.ts`, e as frases estão aqui.
// - **A correção pede motivo, e a tela diz por quê.** O motivo vai para a
//   auditoria (RF-008) com o autor e a hora. Sem ele o botão de gravar fica
//   desligado, e a frase que explica o desligado fica ao lado do botão.
// - **Ferramenta que falhou diz o motivo em português.** A tabela dos códigos
//   está em `copy/ferramentas.ts`, ao lado dos nomes.

import type { MotivoDeFalhaDaCorrecao } from '@/chamadas/tipos'

export const fonte = {
  conversa: 'Registrada na conversa.',
  retaguarda: (porcentagem: number | null) =>
    porcentagem === null
      ? 'Classificada depois da conversa, sem confiança registrada.'
      : `Classificada depois da conversa, com confiança de ${porcentagem}%.`,
  correcao: (nome: string | null, dia: string, hora: string) =>
    `Corrigida por ${nome ?? 'alguém da equipe'} em ${dia} às ${hora}.`,
  correcaoSemHora: (nome: string | null) => `Corrigida por ${nome ?? 'alguém da equipe'}.`,
} as const

const FALHAS_DA_CORRECAO: Record<MotivoDeFalhaDaCorrecao, string> = {
  'sem-permissao': 'Seu papel nesta conta não permite corrigir a classificação.',
  'nao-encontrada': 'Esta chamada não foi encontrada nesta conta. Recarregue a ficha.',
  'classificacao-invalida':
    'A correção foi recusada: a etapa não existe mais neste funil ou o motivo chegou vazio. Recarregue a ficha e tente de novo.',
  'falha-de-comunicacao':
    'Não foi possível falar com o servidor agora. A correção não foi gravada; tente de novo em alguns instantes.',
}

export const correcao = {
  abrir: 'Corrigir a classificação',
  titulo: 'Corrigir a classificação',
  explicacao:
    'Sua correção substitui a classificação desta chamada e move o lead para a etapa escolhida. Depois dela, o processamento automático não altera mais a classificação.',
  etapa: 'Etapa correta',
  motivo: 'Motivo da correção',
  explicacaoDoMotivo: 'O motivo fica na auditoria, com seu nome e a hora da correção.',
  semMotivo: 'Escreva o motivo para liberar a gravação.',
  gravar: 'Gravar a correção',
  gravando: 'Gravando a correção',
  cancelar: 'Cancelar',
  gravada: 'Correção gravada.',
  falhas: FALHAS_DA_CORRECAO,
  soLeitura: 'Seu papel permite ver a classificação, mas não corrigi-la.',
  etapaDesconhecida: (chave: string) => `Etapa ${chave}, que não existe mais neste funil`,
} as const

export const avaliacao = {
  criterios: 'Critérios da avaliação',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  semDecisao: 'Sem decisão',
  evidencia: 'Evidência',
  semEvidencia: 'Nenhum trecho registrado para este critério.',
  semItens: 'Os critérios desta chamada ainda não foram avaliados.',
} as const

export const ferramentas = {
  motivo: 'Motivo',
} as const

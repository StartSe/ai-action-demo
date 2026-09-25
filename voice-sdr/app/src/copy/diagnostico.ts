// Os literais do cartão de diagnóstico, dentro da ficha da chamada.
//
// Registro de interface: direto e declarativo, sem travessão e sem fecho de
// efeito (docs/padrao-de-interface.md seção 4).
//
// O título, a evidência e a sugestão de cada achado não estão aqui: vêm prontos
// da borda, da tabela de `call-diagnose/regras.ts`, pelo alias `@diagnostico`.
// A regra e a frase que a explica moram juntas, e uma segunda tradução
// envelheceria sozinha.

import type { Alvo } from '@diagnostico/propostas.ts'
import type { Severidade } from '@diagnostico/regras.ts'

import { PROPOSITO_EM_PORTUGUES } from '@/copy/sarah'

export const diagnostico = {
  titulo: 'Diagnóstico',
  apoio:
    'Lê os registros desta ligação na ElevenLabs da conta, confere a configuração da assistente e sugere correções. Nada muda sem você aplicar, e nada vai ao ar sem você publicar.',

  analisar: 'Analisar esta ligação',
  analisarDeNovo: 'Analisar de novo',
  analisando: 'Lendo os registros da ElevenLabs e conferindo a configuração da assistente.',
  carregando: 'Carregando o diagnóstico.',
  falhaDaCarga: 'Não foi possível ler o diagnóstico desta ligação agora.',
  falhaGenerica: 'Não foi possível falar com o servidor agora. Tente de novo em alguns minutos.',
  feitoEm: (quando: string) => `Análise de ${quando}`,
  irParaIntegracoes: 'Abrir Integrações',

  resumo: {
    titulo: 'O que a ElevenLabs registrou',
    motivo: 'Motivo do fim',
    estado: 'Estado da conversa',
    duracao: 'Duração',
    idioma: 'Idioma do agente',
    llm: 'Modelo do agente',
    semValor: 'Não informado',
  },

  achados: {
    titulo: 'O que as verificações acharam',
    nenhum: 'Nenhuma verificação achou problema nesta ligação.',
    evidencia: 'Evidência',
    sugestao: 'O que fazer',
  },

  severidade: {
    erro: 'Erro',
    aviso: 'Atenção',
    info: 'Informação',
  } satisfies Record<Severidade, string>,

  leitura: {
    causa: 'Causa provável',
    explicacao: 'O que aconteceu',
  },

  propostas: {
    titulo: 'Correções sugeridas',
    nenhuma: 'Nenhuma correção sugerida para esta ligação.',
    antes: 'Antes',
    depois: 'Depois',
    semValor: 'Vazio',
    avisoPadrao: 'A frase padrão da assistente',
    aplicar: 'Aplicar',
    descartar: 'Descartar',
    aplicada: 'Aplicada',
    descartada: 'Descartada',
    pendente: 'Pendente',
    pelaRegra: 'Sugerida pelas verificações',
    peloModelo: 'Sugerida pelo modelo',
    soPublicar: 'Esta correção não muda nada gravado: ela é a publicação.',
  },

  confirmar: {
    titulo: 'Aplicar esta correção?',
    explicacao: (onde: string) =>
      `A mudança é gravada em ${onde}, como se você a fizesse naquela tela, com o motivo na trilha de auditoria. Ela só vale nas ligações depois de você publicar a assistente.`,
    explicacaoDoRoteiro: (onde: string) =>
      `Nasce uma versão nova em rascunho de ${onde}. Ela só vai ao ar quando você publicar.`,
    explicacaoDaPublicacao:
      'Nada é gravado. Depois de confirmar, publique a assistente para o agente no ar voltar a ser o que está gravado.',
    confirmar: 'Aplicar',
    cancelar: 'Cancelar',
    descartarTitulo: 'Descartar esta correção?',
    descartarExplicacao: 'A correção fica registrada como descartada e não pode mais ser aplicada.',
    descartar: 'Descartar',
  },

  publicar: {
    botao: 'Publicar a assistente',
    apoio: 'A correção está gravada. Publique para ela valer nas próximas ligações.',
    confirmarTitulo: 'Publicar a assistente agora?',
    explicacaoDaSarah: 'A configuração gravada vai para a ElevenLabs e vale a partir da próxima ligação.',
    explicacaoDoPlaybook: (versao: number | null) =>
      versao === null
        ? 'O rascunho do roteiro vai ao ar com a nota abaixo.'
        : `A versão ${versao} do roteiro vai ao ar com a nota abaixo.`,
    nota: (chamadaId: string) => `Aplicado do diagnóstico da chamada ${chamadaId}`,
    confirmar: 'Publicar',
    publicado: 'Publicado. A correção vale a partir da próxima ligação.',
    falhou: 'Não foi possível publicar agora. Tente de novo em alguns minutos.',
  },

  /** A frase de cada recusa do banco ao decidir, pelo SQLSTATE. */
  recusas: {
    SD001: 'O valor mudou depois desta análise. Peça uma análise nova para propor sobre o valor atual.',
    '55000': 'Esta correção já foi decidida. Recarregue a ficha para ver o estado dela.',
    '42501':
      'Você não pode decidir esta correção. Aplicar é tarefa de quem administra a conta, e o aviso de gravação é do dono.',
    P0002: 'Esta correção não existe mais. Recarregue a ficha.',
  } as Readonly<Record<string, string>>,
} as const

/** Onde cada nível de configuração se edita, para a frase da confirmação. */
const TELA_DO_NIVEL = {
  identidade: 'Identidade',
  voz: 'Voz',
  politica: 'Discagem',
  privacidade: 'Privacidade',
} as const

/** O nome de cada alvo em português, para o título da proposta e a confirmação. */
export function rotuloDoAlvo(alvo: Alvo): string {
  const [nivel, parte] = alvo.split('.') as [string, string | undefined]
  const proposito = parte && parte in PROPOSITO_EM_PORTUGUES
    ? PROPOSITO_EM_PORTUGUES[parte as keyof typeof PROPOSITO_EM_PORTUGUES]
    : parte ?? ''
  switch (alvo) {
    case 'identidade.primeira_fala':
      return 'Primeira fala'
    case 'identidade.oferta':
      return 'Oferta'
    case 'identidade.nunca_afirmar':
      return 'O que a assistente nunca afirma'
    case 'identidade.nome':
      return 'Nome da assistente'
    case 'voz.ajustes':
      return 'Ajustes da voz'
    case 'politica.duracao_maxima':
      return 'Duração máxima da ligação'
    case 'politica.intervalo_minimo':
      return 'Intervalo mínimo entre ligações'
    case 'politica.tentativas_por_numero':
      return 'Tentativas por número por dia'
    case 'politica.teto_diario':
      return 'Teto de ligações por dia'
    case 'politica.simultaneidade':
      return 'Ligações ao mesmo tempo'
    case 'privacidade.aviso_de_gravacao':
      return 'Aviso de gravação'
    case 'republicar':
      return 'Publicação'
    default:
      return nivel === 'roteiro' ? `Roteiro de ${proposito}` : `Jeito da casa de ${proposito}`
  }
}

/** Onde o alvo se edita, na frase da confirmação. */
export function telaDoAlvo(alvo: Alvo): string {
  const [nivel] = alvo.split('.') as [string]
  if (nivel in TELA_DO_NIVEL) return TELA_DO_NIVEL[nivel as keyof typeof TELA_DO_NIVEL]
  return rotuloDoAlvo(alvo)
}

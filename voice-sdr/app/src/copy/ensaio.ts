// Os literais da tela de ensaio (US-247).
//
// Registro de interface: direto e declarativo, sem travessão e sem fecho de
// efeito (docs/padrao-de-interface.md seção 4). O que a Sarah fala no ensaio
// não está aqui — é o roteiro publicado, e ele vem do servidor.
//
// As recusas da borda chegam prontas de `rehearsal-session/respostas.ts`.

import type { IdDoPerfil } from '@compartilhado/ensaio/perfis-de-lead.ts'
import type { ModoDoEnsaio } from '@ensaio/sessao.ts'

import type { EstadoDaVoz } from '@/ensaio/voz'
import { nomeOuAssistente, nomeOuAssistenteNoInicio } from '@/copy/assistente'
import type { EstadoDaConversa, TurnoAoVivo } from '@/sarah/ensaio'

/**
 * O texto do ensaio é função do nome que a conta deu à assistente: é com ela
 * que se conversa, e a transcrição a chama pelo nome. Sem nome gravado, "a
 * assistente".
 */
export function textosDoEnsaio(nomeGravado: string | null) {
  const a = nomeOuAssistente(nomeGravado)
  return {
  titulo: 'Ensaio',
  apoio:
    `Converse com a ${a} sem telefone, contra o agente que está publicado. A conversa vira uma chamada de ensaio e pode ser revisada como qualquer outra.`,

  // O preparo ------------------------------------------------------------------
  preparo: {
    titulo: `Com quem a ${a} vai conversar`,
    apoio:
      `Você faz o papel do lead. A ${a} recebe os dados do lead de ensaio pelo mesmo caminho de uma ligação de verdade.`,
    proposito: 'Propósito',
    modo: 'Como conversar',
    perfil: 'Perfil do lead',
    comecar: 'Começar o ensaio',
    abrindo: `Abrindo a conversa com a ${a}.`,
  },

  // A sessão é do provedor de verdade, e ele cobra por ela.
  credito: {
    voice: 'A sessão por voz consome crédito de voz e do modelo no provedor, como uma ligação.',
    text: 'A sessão por texto consome crédito do modelo no provedor, como uma ligação.',
  } as Readonly<Record<ModoDoEnsaio, string>>,

  // As ferramentas chamadas -----------------------------------------------------
  // Os nomes vêm de `copy/ferramentas.ts`, a mesma tabela da ficha.
  ferramentas: {
    titulo: 'Ferramentas chamadas',
    apoio: `Na ordem em que a ${a} as acionou, pelo registro do servidor.`,
    nenhuma: 'Nenhuma ferramenta chamada até agora.',
    nenhumaNoFim: `A ${a} não chamou nenhuma ferramenta neste ensaio.`,
    falhou: 'Falhou',
    semLeitura: 'Não foi possível ler as ferramentas agora. A lista é lida de novo na próxima fala.',
  },

  modos: {
    voice: 'Por voz',
    text: 'Por texto',
  } as Readonly<Record<ModoDoEnsaio, string>>,

  explicacaoDoModo: {
    voice: 'Usa o microfone do navegador. É o mais próximo de uma ligação.',
    text: `Você digita e a ${a} responde escrito. Não pede microfone.`,
  } as Readonly<Record<ModoDoEnsaio, string>>,

  // Um por perfil do catálogo (`_shared/ensaio/perfis-de-lead.ts`). O
  // `satisfies` faz perfil novo sem rótulo reprovar no typecheck. `papel` é o
  // que quem ensaia faz na conversa.
  perfis: {
    interessado: {
      rotulo: 'Lead interessado',
      papel: 'Responda com calma, pergunte sobre a oferta e aceite seguir a conversa.',
    },
    apressado: {
      rotulo: 'Lead apressado',
      papel: `Responda curto e diga que tem pouco tempo. Veja se a ${a} vai direto ao ponto.`,
    },
    pede_pessoa: {
      rotulo: 'Pede para falar com uma pessoa',
      papel: 'Ouça a apresentação e peça para falar com alguém da equipe.',
    },
    pede_bloqueio: {
      rotulo: 'Pede para não ser chamado',
      papel: 'Diga que não quer receber ligações e peça para sair da lista.',
    },
    pessoa_errada: {
      rotulo: 'Pessoa errada',
      papel: 'Diga que não é a pessoa procurada e que o número é seu.',
    },
  } satisfies Readonly<Record<IdDoPerfil, { rotulo: string; papel: string }>>,

  // A conversa -----------------------------------------------------------------
  conversa: {
    titulo: 'Conversa',
    estados: {
      parada: 'Conversa parada',
      conectando: 'Conectando',
      ouvindo: `A ${a} está ouvindo`,
      falando: `A ${a} está falando`,
      encerrando: 'Encerrando',
    } as Readonly<Record<EstadoDaConversa, string>>,
    quem: {
      agent: nomeOuAssistenteNoInicio(nomeGravado),
      lead: 'Você',
    } as Readonly<Record<TurnoAoVivo['quem'], string>>,
    aindaSemFala: `A conversa começou. Fale, ou espere a ${a} abrir.`,
    aindaSemFalaTexto: `A conversa começou. Escreva a primeira mensagem, ou espere a ${a} abrir.`,
    campo: 'O que você diz',
    enviar: 'Enviar',
    encerrar: 'Encerrar o ensaio',
    encerrando: 'Encerrando e guardando a conversa.',
    // Cair não é encerrar: o ensaio é fechado assim mesmo, senão a linha fica
    // aberta para sempre no banco.
    naoAbriu: 'Não foi possível abrir a conversa com o provedor. O ensaio foi encerrado.',
    caiu: (motivo: string) => `A conversa caiu: ${motivo}. O ensaio foi encerrado com o que houve até aqui.`,
  },

  // O modo voz (US-115) ----------------------------------------------------------
  voz: {
    pedindo: 'Pedindo o microfone ao navegador.',
    estados: {
      pedindo_permissao: 'Pedindo o microfone',
      sem_permissao: 'Microfone bloqueado',
      sem_microfone: 'Sem microfone',
      conectando: 'Conectando',
      ouvindo: `Microfone aberto. A ${a} está ouvindo`,
      falando: `A ${a} está falando`,
      encerrado: 'Microfone fechado',
    } as Readonly<Record<EstadoDaVoz, string>>,
    transcricao: 'Transcrição',
    semPermissao: {
      titulo: 'O navegador bloqueou o microfone',
      explicacao:
        'O ensaio por voz precisa do microfone. Nenhuma chamada de ensaio foi aberta.',
      caminho:
        'Clique no cadeado ao lado do endereço do site, permita o microfone e tente de novo.',
    },
    semMicrofone: {
      titulo: 'Nenhum microfone encontrado',
      explicacao:
        'O navegador não encontrou microfone neste computador. Nenhuma chamada de ensaio foi aberta.',
      caminho: 'Conecte um microfone e tente de novo, ou ensaie por texto.',
    },
    tentarDeNovo: 'Tentar de novo',
    porTexto: 'Ensaiar por texto',
  },

  // O fim ----------------------------------------------------------------------
  fim: {
    titulo: 'Ensaio encerrado',
    comTurnos: (turnos: number) =>
      turnos === 1
        ? 'A conversa foi guardada com 1 fala.'
        : `A conversa foi guardada com ${turnos} falas.`,
    semTurnos:
      'O provedor não devolveu a conversa. O ensaio foi encerrado assim mesmo, e a ficha vai dizer que não houve conversa.',
    comFerramentas: (quantas: number) =>
      quantas === 1 ? `A ${a} chamou 1 ferramenta.` : `A ${a} chamou ${quantas} ferramentas.`,
    abrirFicha: 'Abrir a ficha e revisar',
    outro: 'Ensaiar de novo',
  },

  falhaGenerica: 'Não foi possível continuar o ensaio agora. Tente de novo em alguns minutos.',
  /** O botão que a recusa com caminho oferece. */
  resolver: 'Resolver agora',
  } as const
}

/** O texto do ensaio sem o nome, para quem não o cita. */
export const ensaio = textosDoEnsaio(null)

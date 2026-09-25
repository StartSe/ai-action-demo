import type { CampoDoLimiar } from '@/conta/limiares'
import type { MotivoDeFalhaDosLimiares } from '@/conta/tipos'
import type { MotivoDeFalhaDoWhatsapp } from '@/whatsapp/tipos'

/**
 * /config/conta: os limiares da fila de exceções (RF-915). A zona de perigo
 * continua em `copy/conta.ts`.
 *
 * Cada limiar tem rótulo, o que ele dispara (uma frase) e a recusa de valor
 * fora do domínio. O valor padrão e o atual são números, formatados pela tela
 * e escritos pelas funções `padrao` e `atual`, para a frase não ser montada
 * no JSX.
 */
export const configConta = {
  limiares: {
    rotulo: 'Limiares da fila',
    sobretitulo: 'Fila de exceções',
    titulo: 'Limiares da fila',
    apoio: 'Quando uma chamada ou um aviso vira item da fila de exceções.',
    vigencia:
      'A mudança vale para as chamadas seguintes. Os itens que já estão na fila continuam como estão.',
    carregando: 'Carregando os limiares.',
    vazio: {
      titulo: 'A conta ainda não tem configuração',
      explicacao:
        'A configuração nasce com a conta. Recarregue a tela em alguns segundos; se continuar assim, fale com o suporte.',
    },
    falhas: {
      'sem-permissao': 'Sua sessão não tem acesso aos limiares desta conta.',
      'sem-conta': 'Sua sessão não está ligada a nenhuma conta.',
      'falha-de-comunicacao': 'Não foi possível falar com o servidor. Tente de novo em alguns minutos.',
      'fora-do-dominio': 'O servidor recusou um dos valores. Confira os campos e salve de novo.',
    } satisfies Record<MotivoDeFalhaDosLimiares, string>,
    falhasAoSalvar: {
      'sem-permissao': 'O servidor recusou a gravação: só administradores ajustam os limiares.',
      'sem-conta': 'Sua sessão não está ligada a nenhuma conta.',
      'falha-de-comunicacao': 'Não foi possível salvar. Tente de novo em alguns minutos.',
      'fora-do-dominio': 'O servidor recusou um dos valores. Confira os campos e salve de novo.',
    } satisfies Record<MotivoDeFalhaDosLimiares, string>,
    campos: {
      pisoDeSentimento: {
        rotulo: 'Piso de sentimento',
        dispara:
          'Chamada com sentimento igual ou abaixo deste valor entra na fila como sentimento negativo.',
        foraDoDominio: 'Use um número de -1 a 1, com até duas casas depois da vírgula.',
      },
      tetoDeFalhas: {
        rotulo: 'Tentativas seguidas sem sucesso',
        dispara:
          'Ao chegar neste número de tentativas sem falar com ninguém, o lead entra na fila como falha repetida.',
        foraDoDominio: 'Use um número inteiro a partir de 1.',
      },
      tetoDeCriterios: {
        rotulo: 'Critérios reprovados por chamada',
        dispara:
          'Chamada com este número de critérios de avaliação reprovados, ou mais, entra na fila para revisão.',
        foraDoDominio: 'Use um número inteiro a partir de 1 para os critérios.',
      },
      avisoDeCreditoCentavos: {
        rotulo: 'Aviso de crédito, em reais',
        dispara: 'Saldo no provedor abaixo deste valor põe um aviso de crédito baixo na fila.',
        foraDoDominio: 'Use um valor em reais maior que zero, como 50 ou 12,50.',
      },
    } satisfies Record<CampoDoLimiar, { rotulo: string; dispara: string; foraDoDominio: string }>,
    creditoEmBranco: 'Em branco, a conta fica sem aviso de crédito.',
    semAviso: 'sem aviso de crédito',
    padrao: (valor: string) => `Padrão: ${valor}`,
    atual: (valor: string) => `Em uso: ${valor}`,
    salvar: 'Salvar limiares',
    salvando: 'Salvando…',
    salvo: 'Limiares salvos. As próximas chamadas já usam os valores novos.',
    corrigirAntes: 'Corrija os campos marcados para poder salvar.',
    semMudanca: 'Nenhum limiar mudou.',
    negativa:
      'Os limiares mudam o que a fila mostra para a conta inteira, e por isso só administradores os ajustam. Você vê os valores em uso.',
  },

  whatsapp: {
    rotulo: 'Canal de WhatsApp',
    sobretitulo: 'WhatsApp',
    titulo: 'Canal de WhatsApp',
    apoio: 'Liga o atendimento por WhatsApp e o aviso antes de uma ligação de voz.',
    carregando: 'Carregando o canal.',
    vazio: {
      titulo: 'A conta ainda não tem configuração',
      explicacao:
        'A configuração nasce com a conta. Recarregue a tela em alguns segundos; se continuar assim, fale com o suporte.',
    },
    falhas: {
      'sem-permissao': 'Sua sessão não tem acesso ao canal desta conta.',
      'sem-conta': 'Sua sessão não está ligada a nenhuma conta.',
      'falha-de-comunicacao': 'Não foi possível falar com o servidor. Tente de novo em alguns minutos.',
    } satisfies Record<MotivoDeFalhaDoWhatsapp, string>,
    falhasAoSalvar: {
      'sem-permissao': 'O servidor recusou a gravação: só administradores ajustam o canal.',
      'sem-conta': 'Sua sessão não está ligada a nenhuma conta.',
      'falha-de-comunicacao': 'Não foi possível salvar. Tente de novo em alguns minutos.',
    } satisfies Record<MotivoDeFalhaDoWhatsapp, string>,
    campos: {
      habilitado: {
        rotulo: 'Canal ligado',
        dispara: 'Com o canal desligado, a ficha do lead não oferece conversar pelo WhatsApp.',
      },
      preContato: {
        rotulo: 'Avisar antes de ligar',
        dispara: 'Manda uma mensagem pelo WhatsApp pouco antes da ligação de voz, para o lead saber quem está chamando.',
      },
    },
    modo: {
      rotulo: 'Quem a assistente atende',
      opcoes: {
        teste: {
          rotulo: 'Só os números de teste (recomendado para começar)',
          dispara:
            'Ela responde apenas aos números de teste da conta. Mensagem de outro número é ignorada: não vira lead nem conversa, e o celular segue normal para as outras conversas.',
        },
        todos: {
          rotulo: 'Todos que mandarem mensagem',
          dispara: 'Ela responde a qualquer pessoa que escrever para o número conectado, e cada contato novo vira lead.',
        },
      },
      emLeitura: {
        teste: 'Só os números de teste',
        todos: 'Todos que mandarem mensagem',
      },
      ondeCadastrar: 'Os números de teste são os mesmos da ligação de teste e estão logo abaixo.',
      confirmacao: {
        titulo: 'Atender todos que mandarem mensagem?',
        explicacao:
          'A assistente vai responder qualquer pessoa que escrever para o número conectado ao WhatsApp, inclusive contatos pessoais e clientes que já conversam por ali. Vale a partir de quando o canal for salvo.',
        confirmar: 'Atender todos',
        cancelar: 'Manter só os números de teste',
      },
    },
    textoDoPreContato: {
      rotulo: 'Texto do aviso',
      exemplo: 'Em branco, usa o texto padrão do servidor',
      apoio: 'Aparece pouco antes da ligação, só quando o aviso está ligado.',
    },
    salvar: 'Salvar canal',
    salvando: 'Salvando…',
    salvo: 'Canal salvo.',
    semMudanca: 'Nada mudou.',
    negativa:
      'O canal muda o que a conta inteira oferece ao lead, e por isso só administradores o ajustam. Você vê o que está ligado.',
    naoConfigurado: 'A tela de integrações ainda não tem a chave do WhatsApp cadastrada.',
  },
} as const

// Os literais da ficha do lead (`/leads/$id`, US-147, RF-113, RF-116).
//
// **Por que a linha do tempo é uma lista só.** O operador abre a ficha para
// decidir o próximo passo, e a pergunta que ele faz é "o que aconteceu com este
// lead, em que ordem?". Ligações numa coluna e mudanças de etapa noutra
// obrigariam a juntar as duas de cabeça: a ligação de terça que levou o lead a
// "Qualificado" apareceria longe da mudança que ela causou, e a nota de quem
// bloqueou ficaria a uma rolagem do bloqueio. Por isso ligação, mudança de
// etapa (com autor), bloqueio e nota vêm de `lead_events`, numa lista única em
// ordem decrescente, ordenada por uma comparação só (`app/src/leads/linha-do-tempo.ts`).
// A ligação entra pelo evento `call` que aponta a chamada, gravado por
// gatilho em `calls` quando ela termina.
//
// **Reuniões ainda não aparecem, e a lista já as aceita.** `meetings` existe
// no banco desde a migração da agenda, mas quem a enche é o agendamento da F5
// (a Sarah marcando na conversa). A `LinhaDoTempo` já tem o tipo `reuniao` e o
// desenha na mesma ordem; o serviço passa a lê-las quando a F5 ligar o
// agendamento. Até lá não há cabeçalho de reuniões nem item vazio na tela.
//
// **A etapa da história é a de então.** A mudança de etapa diz o rótulo
// gravado no evento: renomear a etapa não reescreve o que aconteceu.
//
// O registro é o direto e declarativo da seção 4 de docs/padrao-de-interface.md.

import type { AcaoDaAutomacao, AcaoDoWhatsapp } from '@/leads/linha-do-tempo'
import type { MotivoDaFichaDoLead, MotivoDaMudancaDeEtapa, MotivoDaNota, MotivoDeFalhaDosLeads } from '@/leads/tipos'

export const lead = {
  titulo: 'Lead',
  apoio: 'Quem é, onde está no funil e tudo o que aconteceu com ele.',
  carregando: 'Carregando a ficha do lead.',
  voltar: 'Voltar para os leads',
  semNome: 'Lead sem nome',

  naoEncontrado: {
    titulo: 'Lead não encontrado',
    explicacao:
      'Este lead não existe nesta conta. Ele pode ter sido excluído ou mesclado com outro.',
    acao: 'Ver a lista de leads',
  },

  falhas: {
    'nao-encontrado': 'Lead não encontrado nesta conta.',
    'sem-permissao': 'Sua sessão não tem acesso a este lead. Entre de novo.',
    'sem-conta': 'Você ainda não participa de nenhuma conta.',
    'filtro-invalido': 'O endereço desta ficha está incompleto.',
    'falha-de-comunicacao': 'O servidor não respondeu. Recarregue a página para tentar de novo.',
  } satisfies Record<MotivoDaFichaDoLead, string>,

  identidade: {
    titulo: 'Identidade',
    nome: 'Nome',
    telefone: 'Telefone',
    empresa: 'Empresa',
    cidade: 'Cidade',
    estado: 'Estado',
    fuso: 'Fuso',
    naoInformado: 'Não informado',
  },

  situacao: {
    titulo: 'Situação',
    etapa: 'Etapa',
    semEtapa: 'Fora do funil',
    temperatura: 'Temperatura',
    semTemperatura: 'Ainda sem temperatura',
    pontuacao: 'Pontuação',
    semPontuacao: 'Ainda sem pontuação',
    bloqueio: 'Bloqueio',
    livre: 'Pode receber ligação',
    bloqueadoEm: (data: string) => `Bloqueado em ${data}`,
    semMotivo: 'Sem motivo registrado.',
  },

  resumo: {
    titulo: 'Resumo',
    apoio: 'O que as ligações confirmaram sobre este lead.',
    dor: 'Dor',
    fit: 'Fit',
    objecoes: 'Objeções',
    proximaAcao: 'Próxima ação',
    naoConfirmado: 'Ainda não confirmado.',
    vazio: 'Nenhuma ligação qualificou este lead ainda. O resumo se preenche na primeira conversa.',
  },

  acoes: {
    titulo: 'Ações',
    etapa: 'Mudar de etapa',
    mover: 'Mover',
    movendo: 'Movendo',
    movido: (etapa: string) => `Lead movido para ${etapa}.`,
    mesmaEtapa: 'O lead já estava nesta etapa.',
    falhasDaMudanca: {
      'sem-permissao': 'Seu papel não permite mudar a etapa deste lead.',
      'lead-inexistente': 'Este lead não existe mais nesta conta.',
      'etapa-inexistente': 'Esta etapa não existe mais no funil. Recarregue a página.',
      'falha-de-comunicacao': 'O servidor não respondeu. Tente mover de novo.',
    } satisfies Record<MotivoDaMudancaDeEtapa, string>,
    motivoDoBloqueio: 'Motivo do bloqueio',
    exemploDoMotivo: 'Pediu para não receber ligação',
    bloquear: 'Bloquear lead',
    desbloquear: 'Desbloquear lead',
    bloqueado: 'Lead bloqueado. A assistente não liga para ele.',
    desbloqueado: 'Lead desbloqueado.',
    falhasDoBloqueio: {
      'sem-permissao': 'Seu papel não permite bloquear ou desbloquear este lead.',
      'sem-conta': 'Você ainda não participa de nenhuma conta.',
      'filtro-invalido': 'O pedido saiu incompleto. Recarregue a página.',
      'falha-de-comunicacao': 'O servidor não respondeu. Tente de novo.',
    } satisfies Record<MotivoDeFalhaDosLeads, string>,
    soLeitura:
      'Seu papel é de leitura. Mover, bloquear e anotar são de quem opera a conta.',
  },

  nota: {
    titulo: 'Nota',
    rotulo: 'Nova nota',
    exemplo: 'Pediu retorno depois do dia 10',
    apoio: 'A nota entra na linha do tempo com o seu nome.',
    registrar: 'Registrar nota',
    registrando: 'Registrando',
    registrada: 'Nota registrada.',
    falhas: {
      'sem-permissao': 'Seu papel não permite registrar nota neste lead.',
      'lead-inexistente': 'Este lead não existe mais nesta conta.',
      'falha-de-comunicacao': 'O servidor não respondeu. A nota não foi registrada.',
    } satisfies Record<MotivoDaNota, string>,
  },

  linhaDoTempo: {
    titulo: 'Linha do tempo',
    apoio: 'Ligações, mudanças de etapa, bloqueios e notas, da mais recente para a mais antiga.',
    lista: 'Linha do tempo do lead',
    vazia: {
      titulo: 'Nada aconteceu ainda',
      explicacao:
        'A linha do tempo começa na primeira ligação. Mudanças de etapa, bloqueios e notas entram aqui também.',
    },
    truncada: 'Os eventos mais antigos ficaram de fora. A ficha mostra os 200 mais recentes.',
    ligacao: 'Ligação',
    duracao: (duracao: string) => `Duração ${duracao}`,
    semDuracao: 'Sem duração registrada',
    abrirChamada: 'Abrir a ficha da chamada',
    gravacaoExpurgada: 'Gravação expurgada pelo prazo de retenção da conta.',
    semGravacao: 'Sem gravação.',
    etapa: 'Mudança de etapa',
    deParaAntes: 'De ',
    deParaMeio: ' para ',
    entrouEm: 'Entrou em ',
    bloqueio: 'Bloqueio',
    desbloqueio: 'Desbloqueio',
    desbloqueado: 'O lead voltou a poder receber ligação.',
    nota: 'Nota',
    cadastro: 'Cadastro',
    cadastrado: 'O lead foi cadastrado.',
    importacao: 'Importação',
    importado: 'O lead entrou por importação de planilha.',
    reuniao: 'Reunião',
    reuniaoEm: (quando: string) => `Reunião marcada para ${quando}.`,
    whatsapp: 'WhatsApp',
    /** Uma frase por ação conhecida; a que a tela não reconhece cai no genérico. */
    acaoDoWhatsapp: {
      iniciada: 'Conversa por WhatsApp iniciada.',
      assumida: 'Conversa assumida por um atendente.',
      devolvida: 'Conversa devolvida para a assistente.',
      encerrada: 'Conversa por WhatsApp encerrada.',
      pre_contato: 'Aviso de pré-contato enviado antes da ligação.',
      pedido_humano: 'O lead pediu para falar com alguém do time.',
    } satisfies Record<AcaoDoWhatsapp, string>,
    acaoDoWhatsappGenerica: 'Atividade na conversa por WhatsApp.',
    /**
     * O motivo que acompanha algumas ações (`pedido_humano`, `pre_contato`).
     * Valor que a tela não reconhece aparece como a borda escreveu, e não
     * some — é o mesmo "trata desconhecido sem quebrar" da ação.
     */
    motivoDoWhatsapp: (motivo: string): string =>
      ({
        descadastro: 'pediu para não receber mais mensagens',
        pessoa_errada: 'disse que é a pessoa errada',
        pedido_do_lead: 'a pedido do lead',
        modelo_nao_conectado: 'o modelo de IA não estava conectado',
        falha_da_assistente: 'a assistente falhou ao responder',
        assistente_nao_publicada: 'a assistente ainda não foi publicada; publique a assistente para ela responder',
      })[motivo] ?? motivo,
    abrirConversa: 'Abrir a conversa',
    automacao: 'Automação',
    /** Uma frase por ação conhecida da automação (F6); a desconhecida cai no genérico. */
    acaoDaAutomacao: {
      retentativas_esgotadas: 'As tentativas de ligação se esgotaram sem conversa.',
      resgates_esgotados: 'As ligações de resgate se esgotaram, e o lead foi para Perdido.',
      reuniao_confirmada: 'O lead confirmou presença na reunião.',
      reuniao_remarcada: 'A reunião foi remarcada na ligação.',
      reuniao_cancelada: 'A reunião foi cancelada na ligação.',
    } satisfies Record<AcaoDaAutomacao, string>,
    acaoDaAutomacaoGenerica: 'Atividade da automação.',
    tentativas: (n: number) => (n === 1 ? '1 tentativa' : `${n} tentativas`),
    autor: {
      user: (nome: string | null) => (nome ? `por ${nome}` : 'por alguém que saiu da conta'),
      agent: 'pela assistente',
      system: 'pelo sistema',
    },
  },

  whatsapp: {
    conversar: 'Conversar pelo WhatsApp',
    iniciando: 'Iniciando…',
    verConversa: 'Ver conversa no WhatsApp',
    falhaAoIniciar: 'Não foi possível iniciar a conversa. Tente de novo.',
  },
}

// Os literais das telas de lead: a lista (`/leads`) e o cadastro manual
// (`/leads/novo`).
//
// Duas telas no mesmo arquivo porque elas dividem a frase que mais importa: a
// recusa do telefone (`RECUSA_DO_TELEFONE`) é a mesma que a lista, o cadastro e
// a importação exibem, e uma frase que aparece em três telas não pode ter três
// versões. O que é só de uma delas fica dentro do próprio objeto.
//
// **O que esta tela não oferece, e por quê.** RF-111 lista seis filtros, e dois
// deles não estão aqui: campanha e "com reunião". `campaigns` e `meetings` são
// tabelas da F5 e da F3 — não existem neste banco —, e um seletor que nunca
// tem opção, ou uma caixa que filtra por nada, ensina o operador a desconfiar
// da tela inteira. Os dois entram junto com as tabelas que os sustentam, e até
// lá não há controle morto aqui.
//
// A mesma ausência vale para as **ações em lote**. RF-112 lista sete, e duas
// não estão aqui: colocar em cadência e adicionar a campanha. `cadences` e
// `campaigns` são da F5, e um botão que abre um seletor sem opção — ou que
// grava numa tabela que não existe — é pior do que a falta dele: ensina o
// operador a clicar em coisa que não faz nada. As cinco que restam (bloquear,
// desbloquear, exportar, excluir e mesclar) são as que o banco desta fatia
// sustenta, e a lista delas está em `app/src/leads/acoes.ts`.
//
// **Frase com número é função.** O resto deste arquivo é literal, mas
// "18 de 20 bloqueados" não dá para montar por concatenação no componente sem
// espalhar concordância pelo JSX — que é justamente o que este arquivo existe
// para evitar. A função continua sendo literal de interface: ela não decide
// nada, só escreve.
//
// O registro é o direto e declarativo da seção 4 de docs/padrao-de-interface.md:
// a interface afirma o que é, sem travessão e sem fecho de efeito. Fala da
// Sarah é outra coisa e mora em `supabase/functions/_shared/speech/`.

import type { MotivoDeRecusa } from '@compartilhado/telefone.ts'

import type { AcaoEmLote } from '@/leads/acoes'
import type {
  PeriodoDeAtividade,
  RecorteDeBloqueio,
} from '@/leads/consulta'
import type {
  MotivoDaExportacao,
  MotivoDaMesclagem,
  MotivoDeFalhaDosLeads,
  MotivoDoCadastro,
  Origem,
  Temperatura,
} from '@/leads/tipos'
import type { Ordenacao } from '@compartilhado/recorte-de-leads.ts'

/** A temperatura como a tela a diz. */
export const TEMPERATURA_EM_PORTUGUES: Record<Temperatura, string> = {
  quente: 'Quente',
  morno: 'Morno',
  frio: 'Frio',
}

/** Por onde o lead entrou, na coluna `source`. */
export const ORIGEM_EM_PORTUGUES: Record<Origem, string> = {
  import: 'Planilha',
  intake: 'Formulário do site',
  manual: 'Cadastro manual',
  whatsapp: 'WhatsApp',
}

export const ORDENACAO_EM_PORTUGUES: Record<Ordenacao, string> = {
  atividade: 'Última atividade',
  nome: 'Nome',
  criacao: 'Data de cadastro',
}

export const leads = {
  titulo: 'Leads',
  explicacao:
    'Quem a assistente tem para ligar, com o estado de cada um no funil.',

  carregando: 'Carregando os leads.',
  falhas: {
    'sem-permissao': 'Você não tem permissão para ver os leads desta conta.',
    'sem-conta': 'Seu acesso ainda não está ligado a nenhuma conta.',
    'filtro-invalido':
      'O endereço traz um filtro que esta tela não reconhece. Limpe os filtros para ver a lista.',
    'falha-de-comunicacao':
      'Não foi possível falar com o servidor. Tente de novo em alguns minutos.',
  } satisfies Record<MotivoDeFalhaDosLeads, string>,

  filtros: {
    titulo: 'Busca e filtros',
    termo: 'Buscar',
    termoExplicacao: 'Nome, telefone ou e-mail.',
    etapa: 'Etapa',
    todasAsEtapas: 'Qualquer etapa',
    temperatura: 'Temperatura',
    todasAsTemperaturas: 'Qualquer temperatura',
    origem: 'Origem',
    todasAsOrigens: 'Qualquer origem',
    atividade: 'Última atividade',
    bloqueio: 'Bloqueio',
    ordenacao: 'Ordenar por',
    limpar: 'Limpar filtros',
  },

  atividades: {
    tudo: 'Qualquer data',
    '24h': 'Nas últimas 24 horas',
    '7d': 'Nos últimos 7 dias',
    '30d': 'Nos últimos 30 dias',
  } satisfies Record<PeriodoDeAtividade, string>,

  bloqueios: {
    todos: 'Bloqueados e liberados',
    bloqueados: 'Só os bloqueados',
    liberados: 'Só os liberados',
  } satisfies Record<RecorteDeBloqueio, string>,

  tabela: {
    rotulo: 'Leads da conta',
    colunas: {
      nome: 'Nome',
      telefone: 'Telefone',
      empresa: 'Empresa',
      lugar: 'Cidade',
      etapa: 'Etapa',
      temperatura: 'Temperatura',
      atividade: 'Última atividade',
    },
    semNome: 'Sem nome',
    semEtapa: '—',
    semTemperatura: '—',
    semAtividade: 'Ainda sem contato',
    bloqueado: 'Bloqueado',
  },

  truncada:
    'Mostrando os leads mais recentes desta ordenação. Estreite a busca ou os filtros para ver o resto.',

  vazio: {
    titulo: 'Nenhum lead nesta conta',
    explicacao:
      'A assistente liga para quem está nesta lista. Importe uma planilha para começar, ou cadastre um lead à mão.',
    acao: 'Importar planilha',
  },
  vazioComFiltro: {
    titulo: 'Nenhum lead com esses filtros',
    explicacao:
      'Nenhum lead casa com a busca e os filtros escolhidos. Amplie os filtros para ver mais.',
  },

  lote: {
    rotulo: 'Ações em lote',
    /** A contagem fica visível mesmo em zero: é ela que explica o desabilitado. */
    selecionados: (quantidade: number) =>
      quantidade === 0
        ? 'Nenhum lead selecionado'
        : quantidade === 1
          ? '1 lead selecionado'
          : `${quantidade} leads selecionados`,
    selecionarTudo: 'Selecionar todos os leads da lista',
    selecionarLead: (lead: string) => `Selecionar ${lead}`,
    /**
     * Exportar diz o que exporta. Ela é a única que age sobre o recorte à
     * vista, e não sobre o que está marcado — é o recorte que `lead-export`
     * recebe —, e o rótulo precisa dizer isso antes do clique.
     */
    acoes: {
      bloquear: 'Bloquear',
      desbloquear: 'Desbloquear',
      exportar: 'Exportar o recorte',
      excluir: 'Excluir',
      mesclar: 'Mesclar os dois',
    } satisfies Record<AcaoEmLote, string>,
    emCurso: 'Aplicando…',
    negativa: {
      aviso:
        'Seu acesso a esta conta é de leitura. Bloquear, excluir e mesclar leads é de quem opera o funil; a lista e a exportação continuam à sua disposição.',
      pedirAcesso: 'Peça acesso a quem administra a conta:',
      semAdministrador:
        'Esta conta não tem administrador registrado. Fale com o suporte.',
    },
  },

  bloqueio: {
    titulo: 'Bloquear os leads selecionados',
    explicacao:
      'A assistente não liga para lead bloqueado. O motivo fica na ficha de cada um e na linha do tempo.',
    motivo: 'Motivo do bloqueio',
    motivoExemplo: 'Pediu para não receber mais ligações.',
    motivoObrigatorio: 'Escreva o motivo. Ele fica registrado em cada lead.',
    confirmar: 'Bloquear',
  },

  exclusao: {
    titulo: 'Excluir os leads selecionados',
    aviso: (quantidade: number) =>
      quantidade === 1
        ? 'Isto apaga 1 lead desta conta, com a linha do tempo dele. A ação é irreversível.'
        : `Isto apaga ${quantidade} leads desta conta, com a linha do tempo de cada um. A ação é irreversível.`,
    confirmar: 'Excluir',
  },

  mesclagem: {
    titulo: 'Mesclar os dois leads selecionados',
    explicacao:
      'O lead que permanece fica com a linha do tempo dos dois e com os campos que estavam vazios nele. O outro sai da lista e devolve o telefone ao acervo.',
    escolha: 'Qual lead permanece',
    confirmar: 'Mesclar',
  },

  /** Comum aos três diálogos. */
  cancelar: 'Cancelar',

  resultados: {
    bloquear: (feitos: number, total: number) =>
      feitos === total
        ? feitos === 1
          ? '1 lead bloqueado.'
          : `${feitos} leads bloqueados.`
        : `${feitos} de ${total} bloqueados.`,
    desbloquear: (feitos: number, total: number) =>
      feitos === total
        ? feitos === 1
          ? '1 lead desbloqueado.'
          : `${feitos} leads desbloqueados.`
        : `${feitos} de ${total} desbloqueados.`,
    excluir: (feitos: number, total: number) =>
      feitos === total
        ? feitos === 1
          ? '1 lead excluído.'
          : `${feitos} leads excluídos.`
        : `${feitos} de ${total} excluídos.`,
    /**
     * O que a política recusou vem nomeado. "Dois leads não puderam ser
     * alterados" manda procurar quais entre vinte.
     */
    recusados: 'A permissão recusou estes leads:',
    mesclado: 'Leads mesclados. O que permaneceu ficou com o histórico dos dois.',
  },

  exportacao: {
    pronta: (linhas: number) =>
      linhas === 1
        ? 'Exportação concluída: 1 lead no arquivo.'
        : `Exportação concluída: ${linhas} leads no arquivo.`,
    fora: (quantidade: number) =>
      `${quantidade} leads do recorte não couberam no arquivo. Estreite o recorte por etapa ou por período de atividade e exporte o restante.`,
    /**
     * jsdom não baixa arquivo, e o navegador baixa sem avisar a tela. A frase
     * existe para o caso de o ambiente não saber criar o arquivo: dizer
     * "concluída" sem nada ter sido salvo é pior do que dizer o que houve.
     */
    semDownload:
      'O arquivo foi gerado, mas este navegador não conseguiu salvá-lo. Tente de novo por outro navegador.',
  },

  /**
   * As frases da **escrita**. São outras que as da leitura de propósito: quem
   * não pode alterar ainda vê a lista, e mandá-lo pedir acesso para "ver os
   * leads" descreveria a tela errada.
   */
  falhasDaEscrita: {
    'sem-permissao':
      'Seu papel não permite alterar estes leads. Peça acesso a quem administra a conta.',
    'sem-conta': 'Seu acesso ainda não está ligado a nenhuma conta.',
    'filtro-invalido':
      'O endereço traz um filtro que esta tela não reconhece. Limpe os filtros e tente de novo.',
    'falha-de-comunicacao':
      'Não foi possível falar com o servidor. Nada foi alterado. Tente de novo em alguns minutos.',
  } satisfies Record<MotivoDeFalhaDosLeads, string>,

  falhasDaMesclagem: {
    'sem-permissao':
      'Seu papel não permite mesclar leads. Peça acesso a quem administra a conta.',
    'mesmo-lead': 'Os dois leads escolhidos são o mesmo. Escolha outro par.',
    'lead-inexistente':
      'Um dos leads não existe mais. Atualize a lista e tente de novo.',
    'lead-de-outra-conta':
      'Os dois leads precisam ser da mesma conta. Atualize a lista e tente de novo.',
    'ja-mesclado':
      'Um dos leads já foi mesclado em outro. Atualize a lista para ver quem responde por ele.',
    'falha-de-comunicacao':
      'Não foi possível falar com o servidor. Nada foi mesclado. Tente de novo em alguns minutos.',
  } satisfies Record<MotivoDaMesclagem, string>,

  falhasDaExportacao: {
    'sem-permissao':
      'Seu acesso não alcança os leads desta conta. Peça acesso a quem administra a conta.',
    'recorte-vazio':
      'Nenhum lead atende a este recorte. Ajuste os filtros e exporte de novo.',
    'filtro-invalido':
      'Um dos filtros do recorte não pôde ser aplicado. Refaça a busca e exporte de novo.',
    'falha-de-comunicacao':
      'Não foi possível exportar agora. Tente de novo em alguns minutos.',
  } satisfies Record<MotivoDaExportacao, string>,
} as const

/**
 * A recusa do telefone em português, um por código de
 * `@compartilhado/telefone.ts`.
 *
 * O mapa é exaustivo de propósito: motivo novo no normalizador não compila até
 * ganhar frase aqui, que é o que impede a tela de mostrar código de erro. Cada
 * frase diz o que corrigir — "telefone inválido" manda olhar o campo de novo
 * sem dizer para quê.
 */
export const RECUSA_DO_TELEFONE: Record<MotivoDeRecusa, string> = {
  vazio: 'Escreva o telefone. Só espaços não formam um número.',
  sem_digitos: 'O telefone precisa de dígitos. Escreva o DDD e o número.',
  comprimento_invalido:
    'Um número brasileiro tem DDD e mais 8 ou 9 dígitos. Confira o que está escrito.',
  ddd_invalido: 'Este DDD não existe no Brasil. Confira os dois primeiros dígitos.',
  celular_sem_nono_digito:
    'Celular tem nove dígitos e começa em 9. Confira se o número perdeu o nono dígito.',
  pais_nao_suportado: 'Por enquanto a assistente só disca para números do Brasil.',
}

/**
 * Os literais do cadastro manual (`/leads/novo`).
 *
 * Ficam neste arquivo, e não em um `leads-novo.ts` ao lado, porque a recusa do
 * telefone é a mesma que a lista e a importação exibem — e uma frase que
 * aparece em três telas não pode ter três versões. O que é só desta tela vem
 * dentro de `cadastroDeLead`.
 *
 * **O que esta tela não oferece, e por quê.** Temperatura e pontuação não estão
 * entre os campos: as duas saem da conversa com a Sarah (`last_sentiment` e
 * `score` são escritos pelo servidor depois da ligação), e pedir a quem
 * cadastra que adivinhe o interesse de quem ainda não foi chamado é convidar a
 * inventar dado que o funil vai tratar como medido.
 */
export const cadastroDeLead = {
  titulo: 'Novo lead',
  explicacao:
    'Cadastre quem chegou por fora da planilha e do formulário do site. O telefone é o que a assistente precisa para ligar; o resto ajuda a conversa.',

  /** Os três cartões do formulário, na ordem em que se preenche. */
  secoes: {
    telefone: 'O número que a assistente vai discar',
    localidade: 'Onde este número parece ficar',
    identificacao: 'Quem é o lead',
  },

  campos: {
    telefone: 'Telefone',
    telefoneExemplo: '(48) 99999-8888',
    telefoneExplicacao:
      'Aceita com ou sem DDI, parênteses e traço. O número gravado aparece ao lado.',
    /** O rótulo do E.164 resolvido, que a tela escreve na classe `.val`. */
    numeroGravado: 'Número que será gravado',
    nome: 'Nome',
    email: 'E-mail',
    empresa: 'Empresa',
    origem: 'De onde veio',
    origemExemplo: 'Indicação da Marina',
    etapa: 'Etapa do funil',
    semEtapa: 'Sem etapa',
  },

  localidade: {
    /** O aviso de que os três campos vieram do DDD, e não de alguém. */
    doDdd: (ddd: string) =>
      `Cidade, estado e fuso foram resolvidos pelo DDD ${ddd}. A cidade é a sede da região, não o endereço do lead: corrija se souber.`,
    cidade: 'Cidade',
    estado: 'Estado',
    fuso: 'Fuso horário',
    fusoExplicacao: 'A assistente liga no horário do lead, e é este fuso que ela usa.',
  },

  duplicado: {
    titulo: 'Este telefone já está na conta',
    explicacao:
      'Um lead com este número já existe aqui, e um telefone responde por um lead só. Abra o que já está cadastrado em vez de criar outro.',
    abrir: 'Abrir o lead existente',
    semNome: 'Lead sem nome',
  },

  /**
   * Papel que não deu para conferir trava a gravação do mesmo jeito que papel
   * de leitura, mas por outra razão, e as duas frases são outras: uma manda
   * pedir acesso, a outra manda tentar de novo.
   */
  equipeIndisponivel:
    'Não foi possível conferir seu papel nesta conta, e cadastrar lead depende dele. Recarregue a tela em alguns minutos.',

  gravar: 'Cadastrar lead',
  gravando: 'Cadastrando…',
  voltar: 'Voltar para a lista',

  /** Quem não pode cadastrar ainda abre a tela, e lê por que não pode gravar. */
  leitura: {
    aviso:
      'Seu acesso a esta conta é de leitura. Cadastrar lead é de quem opera o funil.',
    pedirAcesso: 'Peça acesso a uma destas pessoas:',
    semAdministrador:
      'Esta conta não tem administrador registrado. Fale com o suporte.',
  },

  falhas: {
    'sem-permissao':
      'Seu papel não permite cadastrar leads nesta conta. Peça acesso a quem administra a conta.',
    'sem-conta': 'Seu acesso ainda não está ligado a nenhuma conta.',
    'telefone-invalido':
      'O servidor recusou este telefone. Confira o número e tente de novo.',
    'etapa-invalida':
      'A etapa escolhida não está mais no funil desta conta. Recarregue a tela e escolha outra.',
    duplicado:
      'Alguém cadastrou este telefone enquanto você preenchia. O lead que existe está logo abaixo.',
    'falha-de-comunicacao':
      'Não foi possível falar com o servidor. Nada foi cadastrado. Tente de novo em alguns minutos.',
  } satisfies Record<MotivoDoCadastro, string>,
} as const

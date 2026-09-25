// Os literais da base de conhecimento (US-085, RF-310).
//
// Registro de interface: direto e declarativo, sem travessão e sem fecho de
// efeito (docs/padrao-de-interface.md seção 4). O que a Sarah responde ao lead
// não está aqui — é o que a conta escreve nesta tela.
//
// As frases de falha de cada entrada chegam prontas de
// `knowledge-sync/respostas.ts`, em `MENSAGENS_DA_ENTRADA`.

import { nomeOuAssistente } from '@/copy/assistente'
import type { EstadoDaEntrada } from '@/sarah/conhecimento'

export const conhecimento = {
  titulo: 'Base de conhecimento',
  apoio: (nome: string | null) =>
    `O que a ${nomeOuAssistente(nome)} sabe responder sobre o negócio. Cada pergunta vira um documento no provedor de voz, anexado aos quatro roteiros.`,

  carregando: 'Carregando a base de conhecimento.',
  falha:
    'Não foi possível ler a base de conhecimento desta conta. As ligações não são afetadas; o que a assistente já sabe continua no ar.',

  vazia: {
    titulo: 'A assistente ainda não sabe nada do seu negócio',
    explicacao:
      'Escreva as perguntas que os leads fazem e o que a assistente deve responder. Sem isso ela encaminha tudo para o especialista.',
  },

  // A lista ----------------------------------------------------------------------
  lista: {
    titulo: 'Perguntas e respostas',
    buscar: 'Buscar na pergunta e na resposta',
    exemploDaBusca: 'preço da manutenção',
    etiqueta: 'Etiqueta',
    todasAsEtiquetas: 'Todas',
    semResultado: 'Nenhuma entrada corresponde ao que você procurou.',
    truncada: (teto: number) =>
      `Mostrando as ${teto} mais recentes. Use a busca para achar o que procura.`,
    total: (quantas: number) =>
      quantas === 1 ? '1 entrada na base' : `${quantas} entradas na base`,
    editar: 'Editar',
    remover: 'Remover',
  },

  /** O estado de cada entrada, em uma palavra. */
  estados: {
    pendente: 'Ainda não enviada',
    indexada: 'No ar',
    alterada: 'Alterada depois de enviada',
    removendo: 'Saindo da base',
    erro: 'Falhou ao enviar',
  } as Readonly<Record<EstadoDaEntrada, string>>,

  /** O que cada estado quer dizer para quem administra. */
  explicacaoDoEstado: {
    pendente: 'A assistente ainda não sabe disto. Sincronize para enviar.',
    indexada: 'A assistente já responde isto nas ligações.',
    // O ponto que confunde: está no ar, mas com o texto velho.
    alterada: 'A assistente ainda responde o texto anterior. Sincronize para atualizar.',
    removendo: 'Esperando o provedor confirmar a remoção. Sincronize para concluir.',
    erro: 'A última tentativa de enviar falhou. Sincronize para tentar de novo.',
  } as Readonly<Record<EstadoDaEntrada, string>>,

  // O formulário -----------------------------------------------------------------
  entrada: {
    nova: 'Escrever uma pergunta',
    tituloNova: 'Nova pergunta',
    tituloEdicao: 'Editar pergunta',
    pergunta: 'O que o lead pergunta',
    exemploDaPergunta: 'Quanto custa a manutenção?',
    apoioDaPergunta: 'Escreva como o lead falaria, e não como um título.',
    resposta: 'O que a assistente responde',
    exemploDaResposta: 'A manutenção fica entre R$ 800 e R$ 2.000 por mês, conforme o tamanho da frota.',
    apoioDaResposta: 'Só o que a assistente pode afirmar. O que depender de negociação, encaminhe ao especialista.',
    etiquetas: 'Etiquetas',
    exemploDasEtiquetas: 'preço, manutenção',
    apoioDasEtiquetas: 'Separadas por vírgula. Servem para achar depois, e não vão para a assistente.',
    salvar: 'Salvar',
    salvando: 'Salvando.',
    cancelar: 'Cancelar',
    // A gravação não envia: quem envia é a sincronização, e dizer isso aqui
    // evita a pessoa achar que a Sarah já aprendeu.
    salva: 'Entrada salva. Sincronize para a assistente passar a responder.',
    incompleta: 'Escreva a pergunta e a resposta antes de salvar.',
  },

  // A remoção --------------------------------------------------------------------
  remocao: {
    apagada: 'Entrada apagada. Ela nunca chegou ao provedor.',
    marcada: 'Entrada marcada para sair. Sincronize para o provedor esquecê-la.',
  },

  // A sincronização --------------------------------------------------------------
  sincronizacao: {
    botao: 'Sincronizar com a assistente',
    comPendentes: (quantas: number) =>
      quantas === 1
        ? 'Sincronizar com a assistente (1 pendente)'
        : `Sincronizar com a assistente (${quantas} pendentes)`,
    emCurso: 'Enviando ao provedor de voz.',
    semPendencia: 'Tudo o que a assistente sabe está em dia.',
    concluida: (quantas: number) =>
      quantas === 1 ? '1 entrada sincronizada.' : `${quantas} entradas sincronizadas.`,
    comFalhas: (quantas: number) =>
      quantas === 1
        ? '1 entrada não foi enviada. Veja o motivo na lista.'
        : `${quantas} entradas não foram enviadas. Veja o motivo na lista.`,
    publicacoes: 'Roteiros atualizados com a base nova',
  },

  falhaGenerica: 'Não foi possível concluir agora. Tente de novo em alguns minutos.',
} as const

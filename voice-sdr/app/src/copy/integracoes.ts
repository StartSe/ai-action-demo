import type { EstadoDoCartao } from '@/integracoes/cartao'
import type { MotivoDeFalhaDasIntegracoes } from '@/integracoes/tipos'

/**
 * O selo de cada cartão. `indisponivel` é frase de paciência, não de ação:
 * quem administra a conta não tem o que fazer quando o provedor está fora do
 * ar, e mandá-lo conferir a chave seria trabalho inútil.
 */
export const ESTADO_EM_PORTUGUES: Record<EstadoDoCartao, string> = {
  nao_configurado: 'Não configurado',
  testando: 'Testando',
  conectado: 'Conectado',
  erro: 'Com erro',
  indisponivel: 'Sem resposta',
}

export const integracoes = {
  titulo: 'Integrações',
  explicacao:
    'Um cartão por provedor, com o estado de agora. Salve a chave e teste a conexão sem sair desta tela.',

  carregando: 'Consultando o estado dos provedores.',
  falhas: {
    'sem-permissao': 'Só o dono da conta cadastra e troca as chaves dos provedores.',
    'sem-conta': 'Seu acesso ainda não está ligado a nenhuma conta.',
    'falha-de-comunicacao':
      'Não foi possível falar com o servidor. Tente de novo em alguns minutos.',
  } satisfies Record<MotivoDeFalhaDasIntegracoes, string>,

  cartao: {
    /** Aparece no lugar do valor, que nunca volta do servidor. */
    chaveCadastrada: 'Chave cadastrada. Digite outra para substituir.',
    chaveAusente: 'Nenhuma chave cadastrada.',
    marcador: '••••••••',
    bloqueia: 'Enquanto estiver desligado:',
    credito: 'Saldo',
    creditoBaixo: 'Saldo baixo.',
    cotaEsgotada: 'Capacidade no limite.',
    de: 'de',
    salvar: 'Salvar chave',
    salvando: 'Salvando…',
    testar: 'Testar conexão',
    testando: 'Testando…',
    salva: 'Chave salva. O provedor foi consultado com ela.',
  },

  formularioDoSite: {
    rotulo: 'Formulário do site',
    titulo: 'Formulário do site',
    apoio: 'Entrada de leads',
    explicacao:
      'O lead que preenche o formulário do site, ou que chega pelo Zapier, pelo Make ou pelo seu CRM, entra direto na conta, com cidade, estado e fuso pelo DDD. O mesmo telefone enviado de novo não vira segundo lead.',
    endereco: 'Endereço de entrada',
    semEndereco:
      'Esta cópia não sabe o endereço do projeto. Troque de projeto e conecte de novo para ver o endereço.',
    cabecalho: 'Cabeçalho da chave',
    valorDoCabecalho: 'x-intake-key: sua chave',
    copiar: 'Copiar',
    copiado: 'Copiado.',
    semCopia: 'Este navegador não deixou copiar. Selecione o texto e copie à mão.',
    chave: {
      titulo: 'Chave do formulário',
      seloComChave: 'Com chave',
      seloSemChave: 'Sem chave',
      nenhuma: 'Nenhuma chave gerada ainda. Sem ela, o endereço recusa todo envio.',
      gerada: (quando: string) =>
        `Chave gerada em ${quando}. Ela não aparece de novo: se perder, gere outra.`,
      gerar: 'Gerar chave',
      gerarOutra: 'Gerar chave nova',
      gerando: 'Gerando…',
      nova: 'Sua chave nova',
      umaVez:
        'Copie agora e guarde onde a integração vai usá-la. Esta chave aparece só esta vez; a conta guarda apenas uma impressão dela, que não serve para recuperá-la.',
      confirmar: {
        titulo: 'Gerar uma chave nova?',
        explicacao:
          'A chave atual para de funcionar na hora. Todo formulário e toda integração que a usam passam a ser recusados até receberem a nova.',
        acao: 'Trocar a chave',
        cancelar: 'Manter a atual',
      },
    },
    falhas: {
      'sem-permissao': 'Só quem administra a conta gera a chave do formulário.',
      'sem-conta': 'Seu acesso ainda não está ligado a nenhuma conta.',
      'falha-de-comunicacao':
        'A chave não foi gerada. Tente de novo em alguns minutos; a anterior continua valendo.',
    } satisfies Record<MotivoDeFalhaDasIntegracoes, string>,
    campos: {
      titulo: 'Campos aceitos',
      apoio:
        'Envie um JSON por POST. Só o telefone é obrigatório. Os nomes em inglês também valem, e campo que a conta não conhece é ignorado.',
      lista: [
        { campo: 'telefone', outros: 'phone, celular, whatsapp', descricao: 'Obrigatório. Com DDD, em qualquer formato.' },
        { campo: 'nome', outros: 'name, full_name', descricao: 'Nome do lead.' },
        { campo: 'email', outros: 'e-mail, mail', descricao: 'E-mail do lead.' },
        { campo: 'empresa', outros: 'company', descricao: 'Empresa do lead.' },
        { campo: 'cidade', outros: 'city', descricao: 'Sem ela, vale a cidade do DDD.' },
        { campo: 'estado', outros: 'state, uf', descricao: 'Sem ele, vale o estado do DDD.' },
        { campo: 'referencia', outros: 'ref, form_id', descricao: 'Qual formulário ou campanha mandou.' },
      ],
    },
    exemplo: {
      titulo: 'Exemplo de envio',
      codigo: (endereco: string) =>
        [
          `fetch('${endereco}', {`,
          `  method: 'POST',`,
          `  headers: {`,
          `    'Content-Type': 'application/json',`,
          `    'x-intake-key': 'sua chave',`,
          `  },`,
          `  body: JSON.stringify({`,
          `    nome: 'Joana Prado',`,
          `    telefone: '(48) 99912-3456',`,
          `    email: 'joana@exemplo.com.br',`,
          `  }),`,
          `})`,
        ].join('\n'),
      resposta:
        'Lead aceito responde 201. Chave errada responde 401, e envio demais no mesmo minuto responde 429 com o tempo de espera.',
    },
    ondeColar: {
      titulo: 'Onde usar',
      itens: [
        {
          nome: 'Formulário do site',
          como: 'Quem cuida do site envia os campos pelo script do exemplo, no envio do formulário. A chave vai no cabeçalho, nunca no endereço.',
        },
        {
          nome: 'Zapier ou Make',
          como: 'Use a ação de webhook (POST, corpo em JSON) com o endereço acima, o cabeçalho x-intake-key e os campos do lead.',
        },
        {
          nome: 'RD Station ou HubSpot',
          como: 'Ligue o gatilho de lead novo ao Zapier ou ao Make. No HubSpot, o webhook do fluxo também serve quando ele deixa incluir o cabeçalho.',
        },
      ],
      depois:
        'Para a assistente ligar em minutos para quem chega por aqui, ligue a ligação para o lead novo em Discagem.',
    },
  },

  vazio: {
    titulo: 'Nenhum provedor no catálogo',
    explicacao:
      'O servidor não devolveu provedor nenhum. Recarregue a tela; se continuar assim, é falha da configuração do ambiente.',
  },
} as const

// Os provedores que a conta precisa ligar, e o que cada um exige.
//
// O catálogo é dado, não código: a tela de integrações desenha um cartão por
// entrada daqui, na ordem daqui, e a função de borda sonda um por um. Provedor
// novo entra nesta lista e nasce com cartão, com estado e com teste — nada de
// `switch` espalhado por arquivo.
//
// Escolhas de pilha em docs/PRD-implementacao.md seção 1; o papel de cada um
// em docs/especificacao-funcional.md seção 8.

/** Identificador estável do provedor. É o que a tela e a auditoria usam. */
export type ProvedorId = 'voz' | 'telefonia' | 'calendario' | 'email' | 'whatsapp'

export interface Provedor {
  readonly id: ProvedorId
  /** Nome da função no produto, em português. Nunca o nome comercial sozinho. */
  readonly rotulo: string
  /** Quem entrega o serviço hoje. A tela mostra junto do rótulo. */
  readonly fornecedor: string
  /** Chaves que precisam existir no cofre para o provedor contar como configurado. */
  readonly chaves: readonly string[]
  /**
   * Como cada chave se chama em português na tela. O nome técnico é o do
   * cofre; a frase que diz o que falta usa este.
   */
  readonly rotulosDeChave: Readonly<Record<string, string>>
  /** Onde o operador vai cadastrar a chave. Viaja na resposta do estado não configurado. */
  readonly caminhoDeConfiguracao: string
  /** O que deixa de funcionar enquanto este provedor estiver desligado. */
  readonly bloqueia: string
}

export const PROVEDORES: readonly Provedor[] = [
  {
    id: 'voz',
    rotulo: 'Voz conversacional',
    fornecedor: 'ElevenLabs',
    chaves: ['api_key'],
    rotulosDeChave: { api_key: 'chave da API' },
    caminhoDeConfiguracao: '/config/integracoes#voz',
    bloqueia: 'A assistente não fala: sem este provedor não há agente publicado nem ligação.',
  },
  {
    id: 'telefonia',
    rotulo: 'Telefonia',
    fornecedor: 'Twilio',
    // Duas chaves, e as duas são obrigatórias: o SID identifica a conta e o
    // token autentica. Uma sem a outra não disca.
    chaves: ['account_sid', 'auth_token'],
    rotulosDeChave: { account_sid: 'identificador da conta', auth_token: 'token de autenticação' },
    caminhoDeConfiguracao: '/config/integracoes#telefonia',
    bloqueia: 'Não há número nem linha: nenhuma chamada sai e nenhuma entra.',
  },
  {
    id: 'calendario',
    rotulo: 'Calendário',
    fornecedor: 'Google Calendar, acesso avançado',
    // O caminho avançado do calendário, pelo OAuth do Google. O padrão é o
    // endereço iCal na ficha de cada especialista, que não passa por aqui; a
    // tela só mostra este cartão quando a conta já cadastrou alguma chave.
    // As três precisam existir: sem o token de atualização não há como ler a
    // agenda de ninguém, por mais válido que o aplicativo seja.
    chaves: ['client_id', 'client_secret', 'refresh_token'],
    rotulosDeChave: {
      client_id: 'identificador do aplicativo',
      client_secret: 'segredo do aplicativo',
      refresh_token: 'autorização do calendário',
    },
    caminhoDeConfiguracao: '/config/integracoes#calendario',
    bloqueia:
      'Só o acesso avançado pelo Google. A agenda de cada especialista se lê pelo endereço iCal colado na ficha dele, sem estas chaves.',
  },
  {
    id: 'email',
    rotulo: 'E-mail transacional',
    fornecedor: 'Resend',
    // A chave e o remetente são da conta: o convite sai do domínio que a
    // própria conta verificou no Resend, nunca de um domínio da instalação.
    chaves: ['api_key', 'remetente'],
    rotulosDeChave: { api_key: 'chave da API', remetente: 'remetente (nome e e-mail)' },
    caminhoDeConfiguracao: '/config/integracoes#email',
    bloqueia:
      'O convite da reunião não sai: a reunião fica marcada, com o convite não enviado até o e-mail ser configurado.',
  },
  {
    id: 'whatsapp',
    rotulo: 'WhatsApp (Z-API)',
    fornecedor: 'Z-API',
    // A instância e o token dela vão no caminho de toda chamada; o token de
    // segurança vai no cabeçalho Client-Token. As três são da conta.
    chaves: ['instance_id', 'token', 'client_token'],
    rotulosDeChave: {
      instance_id: 'ID da instância',
      token: 'Token da instância',
      client_token: 'Token de segurança da conta',
    },
    caminhoDeConfiguracao: '/config/integracoes#whatsapp',
    bloqueia: 'A assistente não conversa pelo WhatsApp: nenhuma mensagem é respondida nem enviada.',
  },
]

const POR_ID = new Map<string, Provedor>(PROVEDORES.map((provedor) => [provedor.id, provedor]))

/** O provedor deste id, ou null. Id vindo da barra de endereço passa por aqui. */
export function provedorPorId(id: string): Provedor | null {
  return POR_ID.get(id.trim().toLowerCase()) ?? null
}

/** O nome em português de uma chave do provedor. Sem rótulo, o nome técnico. */
export function rotuloDaChave(provedor: Provedor, chave: string): string {
  return provedor.rotulosDeChave[chave] ?? chave
}

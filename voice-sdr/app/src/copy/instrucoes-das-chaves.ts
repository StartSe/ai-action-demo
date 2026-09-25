// Onde achar cada chave de provedor e em que formato ela chega.
//
// Toda credencial de terceiro é da conta: quem administra a digita na
// configuração inicial e em /config/integracoes. Estas instruções aparecem
// abaixo de cada campo, e a lista de campos vem do servidor
// (`integrations-status/provedores.ts`, pelo `integracao.chaves` da resposta).
// Por isso o mapa é por provedor e por nome de chave, os mesmos do cofre, e
// `testes/estatica/instrucoes-das-chaves.test.ts` reprova se o catálogo ganhar
// uma chave sem instrução aqui.
//
// Módulo sem import de propósito: o teste de Node o lê ao lado do catálogo da
// borda.
//
// Registro de interface: direto e declarativo, sem travessão e sem fecho de
// efeito (docs/padrao-de-interface.md seção 4).

export interface InstrucaoDaChave {
  /** Onde o valor está no painel do provedor. */
  readonly onde: string
  /** Como o valor se parece, para quem confere antes de colar. */
  readonly formato: string
}

/**
 * As permissões que a chave da ElevenLabs precisa ter quando é criada com
 * acesso restrito. Cada linha diz o que a Sarah faz com ela, conferido nos
 * endereços que as funções chamam: `convai/*` (agentes, conversas, base de
 * conhecimento, números e ligação), `voices` e `voices/add` (lista e adição de
 * voz da biblioteca), `text-to-speech` (amostra de voz), `user/subscription`
 * (teste de conexão e crédito) e os webhooks do workspace.
 */
export const PERMISSOES_DA_ELEVENLABS: readonly string[] = [
  'ElevenLabs Agents (Conversational AI): escrita. Cria e publica a assistente, abre conversas e liga.',
  'Voices: escrita. Lista as vozes e adiciona à conta a voz escolhida na biblioteca.',
  'Text to Speech: acesso. Toca a amostra da voz.',
  'User: leitura. Testa a chave e lê o crédito restante.',
  'Workspace, webhooks: escrita. Cadastra os avisos de início e fim de ligação.',
]

export const instrucoesDasChaves: Readonly<
  Record<string, Readonly<Record<string, InstrucaoDaChave>>>
> = {
  voz: {
    api_key: {
      onde: 'Na ElevenLabs, em Settings > API Keys. Crie uma chave nova para a assistente e copie na hora: ela aparece uma vez só.',
      formato: 'Começa com sk_. Com acesso restrito, marque as permissões da lista abaixo.',
    },
  },
  telefonia: {
    account_sid: {
      onde: 'No Console da Twilio, no quadro Account Info da página inicial.',
      formato: 'Começa com AC e tem 34 caracteres. Use o da conta principal, e não o de uma API key (SK...).',
    },
    auth_token: {
      onde: 'No mesmo quadro Account Info, abaixo do Account SID. Clique em Show para ver o valor.',
      formato: 'Tem 32 caracteres, letras e números. Trocar o token na Twilio exige salvar o novo aqui.',
    },
  },
  calendario: {
    client_id: {
      onde: 'No Google Cloud Console, em APIs e serviços > Credenciais, no ID do cliente OAuth do tipo aplicativo da Web.',
      formato: 'Termina com .apps.googleusercontent.com.',
    },
    client_secret: {
      onde: 'No mesmo ID do cliente OAuth, em Chaves secretas do cliente.',
      formato: 'Começa com GOCSPX-.',
    },
    refresh_token: {
      onde: 'Gerado ao autorizar o aplicativo com a conta Google do especialista, com o escopo do Google Calendar.',
      formato: 'Começa com 1// e é longo. O token de acesso, que começa com ya29., expira em uma hora e não serve aqui.',
    },
  },
  email: {
    api_key: {
      onde: 'Na Resend, em API Keys. Crie a chave com permissão Sending access.',
      formato: 'Começa com re_. Ela aparece uma vez só.',
    },
    remetente: {
      onde:
        'Na Resend, em Domains, cadastre o domínio da empresa e crie no DNS dele os registros que ela mostrar. Quando o domínio aparecer como verificado, use um endereço dele aqui.',
      formato:
        'Nome e e-mail, como Agenda Aurora <agenda@aurora.com.br>. O domínio do e-mail precisa estar verificado na Resend, senão o convite é recusado.',
    },
  },
  whatsapp: {
    instance_id: {
      onde: 'No painel da Z-API, em Instâncias. Abra a instância conectada ao número da empresa e copie o ID da instância.',
      formato: 'Sequência de 32 letras maiúsculas e números, sem espaço.',
    },
    token: {
      onde: 'No painel da Z-API, em Instâncias, na mesma instância, no campo Token da instância.',
      formato: 'Sequência longa de letras maiúsculas e números. Ele muda quando a instância é recriada.',
    },
    client_token: {
      onde: 'No painel da Z-API, em Segurança, no Token de segurança da conta. Ative o token antes de copiar.',
      formato: 'Sequência de letras e números. Vale para todas as instâncias da conta na Z-API.',
    },
  },
}

/** A instrução desta chave, ou null quando o catálogo trouxe uma que ainda não tem. */
export function instrucaoDaChave(provedor: string, chave: string): InstrucaoDaChave | null {
  return instrucoesDasChaves[provedor]?.[chave] ?? null
}

/** Onde achar e formato, na linha que vai abaixo do campo. */
export function textoDaInstrucao(provedor: string, chave: string): string | undefined {
  const instrucao = instrucaoDaChave(provedor, chave)
  return instrucao ? `${instrucao.onde} ${instrucao.formato}` : undefined
}

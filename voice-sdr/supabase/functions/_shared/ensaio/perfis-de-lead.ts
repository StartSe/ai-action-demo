// Os perfis de lead simulados do ensaio (US-112, T-16, RF-312).
//
// **O ENSAIO PRECISA DO INTERLOCUTOR DIFÍCIL.** Um roteiro que só foi ensaiado
// contra quem quer comprar aprova o que a ligação vai errar. Três dos cinco
// perfis existem porque são critérios de aceite da F3: pedir uma pessoa
// (tool-transfer), pedir para não ser chamado (tool-dnc) e atender quem não é
// o lead (encerramento de pessoa errada). Sem eles o ensaio não exercita o que
// a fatia entrega.
//
// **CATÁLOGO É DADO, NÃO `switch`**, como o de provedores em
// `integrations-status`. Perfil novo é uma entrada a mais neste array: a tela
// o oferece, `call-init` o entrega e o teste o confere, sem código novo. O que
// o tipo cobra é o rótulo da tela, em `app/src/copy/ensaio.ts`, por
// `satisfies Record<IdDoPerfil, ...>`.
//
// **O CONTEXTO VIAJA PELO CAMINHO DA LIGAÇÃO REAL.** A sessão do ensaio leva só
// `call_id` como variável dinâmica, e é `call-init` quem acha o perfil pela
// chamada e devolve o contexto (T-25, RF-408). Mandar o contexto do navegador
// seria um segundo caminho de contexto, e o ensaio voltaria a testar outra
// coisa que não a ligação.
//
// Módulo portável: sem Deno, sem rede, sem banco.

export interface PerfilDeLead {
  /** O que `rehearsals.persona_profile.perfil` guarda. Nunca muda depois de publicado. */
  readonly id: string
  /** O nome do perfil em português, como ele aparece no registro do ensaio. */
  readonly rotulo: string
  /** Como a pessoa se comporta, para quem faz o papel do lead no ensaio. */
  readonly descricao: string
  /**
   * O que a Sarah sabe desse lead antes de a conversa começar. É o valor de
   * `contexto_do_lead` que `call-init` devolve. Não denuncia o comportamento:
   * numa ligação de verdade ninguém avisa que o lead está com pressa.
   */
  readonly contexto: string
}

export const PERFIS_DE_LEAD = [
  {
    id: 'interessado',
    rotulo: 'Lead interessado',
    descricao: 'Responde com calma, faz perguntas sobre a oferta e aceita seguir a conversa.',
    contexto: 'Preencheu o formulário do site pedindo mais informações sobre a oferta.',
  },
  {
    id: 'apressado',
    rotulo: 'Lead apressado',
    descricao: 'Atende entre dois compromissos, responde curto e quer saber logo do que se trata.',
    contexto: 'Baixou um material da empresa na semana passada e não respondeu o e-mail.',
  },
  {
    id: 'pede_pessoa',
    rotulo: 'Lead que pede para falar com uma pessoa',
    descricao: 'Ouve a apresentação e pede para ser atendido por alguém da equipe.',
    contexto: 'Pediu um orçamento pelo site e deixou o telefone para contato.',
  },
  {
    id: 'pede_bloqueio',
    rotulo: 'Lead que pede para não ser chamado',
    descricao: 'Diz que não quer receber ligações e pede para ser tirado da lista.',
    contexto: 'Está na base de contatos de um evento da empresa.',
  },
  {
    id: 'pessoa_errada',
    rotulo: 'Pessoa errada',
    descricao: 'Atende e diz que não é a pessoa procurada: o número é de outra pessoa.',
    contexto: 'Preencheu o formulário do site pedindo mais informações sobre a oferta.',
  },
] as const satisfies readonly PerfilDeLead[]

export type IdDoPerfil = (typeof PERFIS_DE_LEAD)[number]['id']

/** O perfil com que a tela abre. */
export const PERFIL_PADRAO: IdDoPerfil = 'interessado'

/** O perfil daquele id, ou nulo quando o id não está no catálogo. */
export function perfilPeloId(id: unknown): PerfilDeLead | null {
  if (typeof id !== 'string') return null
  return PERFIS_DE_LEAD.find((perfil) => perfil.id === id) ?? null
}

/** Estreita um valor qualquer para um id do catálogo. */
export function lerIdDoPerfil(valor: unknown): IdDoPerfil | null {
  return (perfilPeloId(valor)?.id as IdDoPerfil | undefined) ?? null
}

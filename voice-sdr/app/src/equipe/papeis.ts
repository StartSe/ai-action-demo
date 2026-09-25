import type { Membro, Papel } from '@/equipe/tipos'

/** Do mais alto para o mais baixo. A ordem é a da hierarquia de `has_role`. */
export const PAPEIS: readonly Papel[] = ['owner', 'admin', 'operator', 'viewer']

/** Quem administra a equipe: convida, troca papel e remove. */
export function podeAdministrarEquipe(papel: Papel): boolean {
  return papel === 'owner' || papel === 'admin'
}

/**
 * Convidar para `owner` é privilégio de `owner`. É a mesma trava da política
 * `invitations_insercao_admin`; aqui ela só evita oferecer o que a RLS nega.
 */
export function podeAtribuir(papelDeQuemAge: Papel, papelAlvo: Papel): boolean {
  if (!podeAdministrarEquipe(papelDeQuemAge)) return false
  return papelAlvo !== 'owner' || papelDeQuemAge === 'owner'
}

/** A quem pedir acesso quando a tela está em leitura. */
export function quemConcedeAcesso(membros: readonly Membro[]): Membro[] {
  return membros.filter((membro) => podeAdministrarEquipe(membro.papel))
}

/**
 * Quem define a política de discagem: janela por dia, intervalo mínimo entre
 * tentativas e teto diário. É a classe Administrador do PRD — quem configura e
 * ajusta a máquina. O Operador trabalha o funil dentro da política e não a
 * altera, e por isso recebe negativa explícita ao abrir a tela.
 */
export function podeDefinirPoliticaDeDiscagem(papel: Papel): boolean {
  return papel === 'owner' || papel === 'admin'
}

/**
 * Quem define a identidade da Sarah: nome, empresa, oferta, o que ela nunca
 * afirma e a primeira fala. É a mesma hierarquia das políticas
 * `agents_insercao_de_admin` e `agents_alteracao_de_admin` — o que está aqui
 * sai na boca dela em toda ligação, e o Operador trabalha o funil com a Sarah
 * que a conta configurou. Esta função só evita oferecer o que a RLS nega.
 */
export function podeDefinirIdentidadeDaSarah(papel: Papel): boolean {
  return papel === 'owner' || papel === 'admin'
}

/**
 * Quem age sobre leads: cadastra, importa, bloqueia, mescla e exclui. É a
 * classe Operação da seção 3.9, e a mesma hierarquia das políticas
 * `leads_insercao_de_operador`, `leads_alteracao_de_operador` e
 * `leads_exclusao_de_operador` — o `has_role(account_id, 'operator')` delas
 * alcança operator, admin e owner.
 *
 * Exportar fica de fora de propósito: `registrar_exportacao_de_leads` só cobra
 * `is_member`, e quem acompanha a lista pode levá-la para uma planilha. Quem
 * decide é a política, e esta função só evita oferecer o que ela nega.
 */
export function podeOperarLeads(papel: Papel): boolean {
  return papel !== 'viewer'
}

/**
 * Quem inclui, importa e remove números da lista de bloqueio. É a classe
 * Operação da seção 3.9, e a hierarquia das políticas
 * `dnc_entries_insercao_de_operador` e `dnc_entries_alteracao_de_operador`. O
 * Observador lê a lista, porque é ela que explica a recusa da guarda.
 */
export function podeOperarBloqueios(papel: Papel): boolean {
  return papel !== 'viewer'
}

/**
 * Quem edita e publica os roteiros. É a hierarquia das políticas
 * `playbook_versions_insercao_de_admin` e `playbook_versions_alteracao_de_admin`,
 * e a mesma de `PAPEIS_QUE_PUBLICAM` em `agent-publish`: o roteiro é o que a
 * Sarah diz com todo lead. O Operador lê, inclusive o histórico, porque é o
 * histórico que explica o que ela disse numa ligação.
 */
export function podeEditarPlaybooks(papel: Papel): boolean {
  return papel === 'owner' || papel === 'admin'
}

/**
 * Quem cadastra e altera as linhas telefônicas. É a hierarquia das políticas
 * `phone_lines_insercao_de_admin` e `phone_lines_alteracao_de_admin`: uma
 * linha nova é um número com custo no provedor e um destino de ligação
 * recebida. O Operador vê as linhas, porque é o discador manual que mostra a
 * origem da ligação, e não as muda.
 */
export function podeAdministrarNumeros(papel: Papel): boolean {
  return papel === 'owner' || papel === 'admin'
}

/**
 * Quem disca pelo discador manual. É `PAPEIS_QUE_DISCAM` de `call-place`: o
 * Observador vê o funil e acompanha as chamadas, mas fazer a conta gastar uma
 * ligação é outra coisa.
 */
export function podeDiscar(papel: Papel): boolean {
  return papel !== 'viewer'
}

/**
 * Quem puxa e solta o freio de emergência (RF-011). É a hierarquia de
 * `emergency-stop`: parar a operação inteira não é ação de quem só opera. O
 * freio encerra a ligação de todo mundo da conta, e a decisão de interromper a
 * máquina é de quem responde por ela. Soltar pede o mesmo papel, porque soltar
 * por engano é discar para quem motivou a parada.
 */
export function podeAcionarFreio(papel: Papel): boolean {
  return papel === 'owner' || papel === 'admin'
}

/**
 * Quem altera a privacidade da conta: gravação, aviso e retenção. É a classe
 * Dono da matriz 3.9, e a mesma barreira de `definir_privacidade` e do gatilho
 * `guardar_privacidade_do_dono`: desligar a gravação ou encurtar a retenção
 * muda o que a conta guarda sobre cada lead, e o expurgo não se desfaz. Admin
 * configura o resto da máquina e aqui lê.
 */
export function podeAlterarPrivacidade(papel: Papel): boolean {
  return papel === 'owner'
}

/** A quem pedir quando a privacidade está em leitura: só quem é dono. */
export function quemAlteraPrivacidade(membros: readonly Membro[]): Membro[] {
  return membros.filter((membro) => podeAlterarPrivacidade(membro.papel))
}

/**
 * Quem resolve item da fila de exceções. É a classe Operação da seção 3.9 e a
 * mesma régua de `resolver_excecao`, que devolve `sem_permissao` abaixo de
 * `operator`. O Observador lê a fila, porque é ela que diz o que ficou para
 * gente resolver.
 */
export function podeResolverExcecoes(papel: Papel): boolean {
  return papel !== 'viewer'
}

/**
 * Quem move lead entre as colunas do funil (RF-202). É a régua de
 * `mover_lead_de_etapa`, que devolve `sem_permissao` abaixo de `operator`. O
 * Observador vê o quadro em leitura, porque é ele que responde "onde está cada
 * lead"; decidir a etapa é trabalho de quem opera.
 */
export function podeMoverNoFunil(papel: Papel): boolean {
  return papel !== 'viewer'
}

/**
 * Quem cria, renomeia, reordena, colore e apaga etapas do funil (RF-207). É a
 * régua de `configurar_etapas`, que devolve `sem_permissao` abaixo de `admin`,
 * e das políticas de escrita de `pipeline_stages`. O Operador move leads entre
 * as etapas e as vê com a chave, mas mudar o funil é mudar o de todo mundo.
 */
export function podeConfigurarEtapas(papel: Papel): boolean {
  return papel === 'owner' || papel === 'admin'
}

/**
 * Quem cadastra e edita especialistas. É a hierarquia das políticas
 * `specialists_insercao_de_admin` e `specialists_alteracao_de_admin`: quem
 * recebe a reunião é configuração da conta. O Operador lê a tela inteira,
 * porque é ela que explica para quem a assistente encaminha.
 */
export function podeCadastrarEspecialistas(papel: Papel): boolean {
  return papel === 'owner' || papel === 'admin'
}

/**
 * Quem corrige a classificação de uma chamada (RF-415). É a régua de
 * `corrigir_classificacao`, que devolve `sem_permissao` abaixo de `operator`.
 * O Observador vê a classificação e de onde ela veio; corrigir move o lead e
 * trava a classificação contra a retaguarda, e isso é trabalho de quem opera.
 */
export function podeCorrigirClassificacao(papel: Papel): boolean {
  return papel !== 'viewer'
}

/**
 * Quem ajusta os limiares da fila de exceções (RF-915). É a política
 * `account_settings_alteracao_de_admin`: o limiar muda o que a fila mostra
 * para a conta inteira. O Operador trabalha a fila e vê os valores que a
 * formaram, sem os campos.
 */
export function podeAjustarLimiaresDaFila(papel: Papel): boolean {
  return papel === 'owner' || papel === 'admin'
}

/**
 * Quem troca o modo de roteamento do especialista. É a política
 * `account_settings_alteracao_de_admin`: o modo decide para quem vão as
 * reuniões da conta inteira. O Operador vê o modo em uso, porque é ele que
 * explica por que a reunião caiu naquele especialista.
 */
export function podeDefinirRoteamento(papel: Papel): boolean {
  return papel === 'owner' || papel === 'admin'
}

/**
 * Quem marca o desfecho da reunião (realizada, falta, cancelada). É a classe
 * Operação, e a mesma conferência de `marcar_desfecho_da_reuniao`
 * (`has_role(account_id, 'operator')`). O Observador vê o desfecho e o
 * histórico das marcações, em leitura. Quem recusa de verdade é o RPC.
 */
export function podeMarcarDesfecho(papel: Papel): boolean {
  return papel !== 'viewer'
}

/**
 * Quem liga o canal de WhatsApp, o pré-contato e o texto dele. É a política
 * `account_settings_alteracao_de_admin`, a mesma dos limiares da fila e do
 * roteamento: o canal muda o que a conta inteira oferece ao lead. O Operador
 * vê o que está ligado, sem os campos.
 */
export function podeAjustarCanalDoWhatsapp(papel: Papel): boolean {
  return papel === 'owner' || papel === 'admin'
}

/**
 * Quem assume, devolve e encerra uma conversa de WhatsApp, e escreve nela
 * como humano. É a classe Operação, a mesma hierarquia de
 * `podeResolverExcecoes`: a conversa é fila de trabalho como a de exceções, e
 * o Observador a lê para saber o que está sendo dito ao lead.
 */
export function podeOperarConversas(papel: Papel): boolean {
  return papel !== 'viewer'
}

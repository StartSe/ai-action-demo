import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router'

import type { ServicoDeAutenticacao } from '@/autenticacao/tipos'
import { Casca } from '@/componentes/casca'
import { Raiz } from '@/componentes/raiz'
import { TelaDaChamada } from '@/rotas/chamada'
import { TelaDeChamadas } from '@/rotas/chamadas'
import { TelaDaConversa } from '@/rotas/conversa'
import { TelaDeConversas } from '@/rotas/conversas'
import { TelaDaConta } from '@/rotas/config-conta'
import { TelaDeConfiguracaoInicial } from '@/rotas/configuracao-inicial'
import { TelaDeAuditoria } from '@/rotas/config-auditoria'
import { TelaDeBloqueios } from '@/rotas/config-bloqueios'
import { TelaDePoliticaDeDiscagem } from '@/rotas/config-discagem'
import { TelaDePrivacidade } from '@/rotas/config-privacidade'
import { TelaDeEquipe } from '@/rotas/config-equipe'
import { TelaDeIntegracoes } from '@/rotas/config-integracoes'
import { TelaDeConvite } from '@/rotas/convite'
import { TelaDeEntrada } from '@/rotas/entrar'
import { TelaDaFila } from '@/rotas/fila'
import { TelaDeLeads } from '@/rotas/leads'
import { TelaDoLead } from '@/rotas/lead'
import { TelaDeImportacaoDeLeads } from '@/rotas/leads-importar'
import { TelaDeCadastroDeLead } from '@/rotas/leads-novo'
import { TelaDeNumeros } from '@/rotas/numeros'
import { TelaDoPainel } from '@/rotas/painel'
import { TelaDeRecuperacaoDeSenha } from '@/rotas/recuperar-senha'
import { TelaDaReuniao } from '@/rotas/reuniao'
import { TelaDeReunioes } from '@/rotas/reunioes'
import { TelaDeEspecialistas } from '@/rotas/especialistas'
import { TelaDoFunil } from '@/rotas/funil'
import { TelaDeConhecimento } from '@/rotas/sarah-conhecimento'
import { TelaDeEnsaio } from '@/rotas/sarah-ensaio'
import { TelaDeIdentidadeDaSarah } from '@/rotas/sarah-identidade'
import { TelaDePlaybooksDaSarah } from '@/rotas/sarah-playbooks'
import { TelaDeVozDaSarah } from '@/rotas/sarah-voz'
import type { BuscaDeChamadas } from '@/chamadas/consulta'
import { criarMicrofoneDoNavegador } from '@/ensaio/voz'
import { textoDaBusca, type BuscaDeLeads } from '@/leads/consulta'
import type { BuscaDeReunioes } from '@/reunioes/consulta'
import { criarCondutorDaElevenLabs } from '@/sarah/condutor-elevenlabs'
import { destinoSeguro } from '@/utilidades/destino'

export interface ContextoDoRoteador {
  /** A guarda só precisa saber se há sessão, e precisa saber sem esperar. */
  autenticacao: Pick<ServicoDeAutenticacao, 'temSessao'>
}

export interface BuscaDeEntrada {
  destino?: string
}

/** O que a volta do OAuth do provedor de modelo traz (US-246). */
export interface BuscaDeIntegracoes {
  code?: string
  state?: string
}

const rotaRaiz = createRootRouteWithContext<ContextoDoRoteador>()({
  component: Raiz,
})

const rotaEntrar = createRoute({
  getParentRoute: () => rotaRaiz,
  path: '/entrar',
  component: TelaDeEntrada,
  // O destino vem da barra de endereço, então passa pelo filtro antes de
  // virar navegação: `destinoSeguro` barra endereço externo e laço. A chave
  // sai sempre, ainda que indefinida: a busca do match herda a da raiz, e é
  // esta atribuição que apaga lá o que o filtro recusou aqui.
  validateSearch: (busca: Record<string, unknown>): BuscaDeEntrada => ({
    destino: destinoSeguro(busca.destino),
  }),
})

/**
 * Pública de propósito: quem clica no link do convite pode não ter sessão
 * ainda, e precisa ver de quem é o convite antes de decidir entrar.
 */
const rotaConvite = createRoute({
  getParentRoute: () => rotaRaiz,
  path: '/convite/$token',
  component: TelaDeConvite,
})

const rotaRecuperarSenha = createRoute({
  getParentRoute: () => rotaRaiz,
  path: '/recuperar-senha',
  component: TelaDeRecuperacaoDeSenha,
})

/**
 * Rota-camada sem caminho próprio: tudo que pende dela exige sessão e ganha a
 * casca com a barra lateral. Sessão expirada vira desvio para `/entrar`
 * carregando o endereço que a pessoa tentou abrir.
 */
const rotaAplicacao = createRoute({
  getParentRoute: () => rotaRaiz,
  id: 'aplicacao',
  component: Casca,
  beforeLoad: ({ context, location }) => {
    if (context.autenticacao.temSessao()) return

    throw redirect({ to: '/entrar', search: { destino: location.href } })
  },
})

const rotaPainel = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/',
  component: TelaDoPainel,
})

/**
 * O assistente exige sessão como qualquer tela de produto, e por isso pende
 * de `aplicacao`: quem o abre já tem conta, e a casca traz o checklist junto.
 */
const rotaConfiguracaoInicial = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/configuracao-inicial',
  // O condutor da entrevista por voz entra por aqui, como o do ensaio: o teste
  // monta a tela com um dublê.
  component: () => <TelaDeConfiguracaoInicial condutor={criarCondutorDaElevenLabs()} />,
})

const rotaConta = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/config/conta',
  component: TelaDaConta,
})

const rotaEquipe = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/config/equipe',
  component: TelaDeEquipe,
})

const rotaIntegracoes = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/config/integracoes',
  component: TelaDeIntegracoes,
  /**
   * O que o OAuth do provedor de modelo devolve (US-246). Vem da barra de
   * endereço, então cada chave sai sempre — é a atribuição que apaga o que
   * veio escrito à mão, a mesma regra das outras buscas deste roteador.
   *
   * O `state` chega de dois jeitos porque o provedor documenta um e anuncia o
   * outro; a borda aceita os dois e a tela não precisa saber qual foi.
   */
  validateSearch: (busca: Record<string, unknown>): BuscaDeIntegracoes => ({
    code: textoDaBusca(busca.code),
    state: textoDaBusca(busca.state),
  }),
})

/**
 * A política de discagem só é aberta por quem administra a conta, mas a rota
 * existe para todo mundo: a negativa é da tela, com o motivo e a quem pedir.
 * Desviar em silêncio deixaria o Operador sem saber por que o item da barra
 * lateral não leva a lugar nenhum.
 */
const rotaDiscagem = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/config/discagem',
  component: TelaDePoliticaDeDiscagem,
})

/**
 * A lista de bloqueio é da classe Operação: todo membro a lê, e o viewer vê a
 * negativa de escrita na própria tela, ao lado da lista que explica a recusa da
 * guarda.
 */
const rotaBloqueios = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/config/bloqueios',
  component: TelaDeBloqueios,
})

/**
 * A privacidade é da classe Dono: todo membro a lê, porque é ela que explica
 * por que uma chamada não tem gravação, e só o dono a altera. Quem não é dono
 * vê a tela em leitura com a negativa, na própria tela.
 */
const rotaPrivacidade = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/config/privacidade',
  component: TelaDePrivacidade,
})

/**
 * O recorte da lista viaja na barra de endereço, para o link colado no chat da
 * equipe abrir a mesma lista. Toda chave sai daqui, ainda que indefinida: a
 * busca do match herda a da raiz, e devolver só as preenchidas deixaria passar
 * o que veio escrito à mão. Quem decide se o valor é aceitável é
 * `recorteDaBusca`, na tela, com o mesmo módulo que a exportação usa.
 */
const rotaLeads = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/leads',
  component: TelaDeLeads,
  validateSearch: (busca: Record<string, unknown>): BuscaDeLeads => ({
    termo: textoDaBusca(busca.termo),
    etapa: textoDaBusca(busca.etapa),
    temperatura: textoDaBusca(busca.temperatura),
    origem: textoDaBusca(busca.origem),
    atividade: textoDaBusca(busca.atividade),
    bloqueado: textoDaBusca(busca.bloqueado),
    ordenacao: textoDaBusca(busca.ordenacao),
  }),
})

/**
 * O cadastro manual (RF-106). Fica sob `/leads` no endereço, mas é rota irmã e
 * não filha da lista: as duas telas não dividem carga nem casca, e aninhar
 * faria a lista montar por baixo do formulário a cada abertura.
 *
 * Sem `validateSearch`: a tela não lê nada da barra de endereço, e declarar
 * chaves aqui só apagaria a bagagem de link que a raiz deixa passar.
 */
const rotaCadastroDeLead = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/leads/novo',
  component: TelaDeCadastroDeLead,
})

/**
 * A importação de planilha (RF-101). Irmã da lista pelo mesmo motivo do
 * cadastro: o endereço fica sob `/leads`, mas as duas telas não dividem carga
 * nem casca, e aninhar faria a lista montar por baixo do assistente a cada
 * abertura.
 *
 * Sem `validateSearch`: os três passos vivem no estado da tela, e não na barra
 * de endereço — a planilha está na memória do navegador, e um link para o passo
 * 3 abriria uma prévia sem arquivo nenhum.
 */
const rotaImportacaoDeLeads = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/leads/importar',
  component: TelaDeImportacaoDeLeads,
})

/**
 * A ficha do lead (RF-113, US-147). Irmã da lista, como o cadastro e a
 * importação: `/leads/novo` e `/leads/importar` são caminhos fixos e vencem o
 * parâmetro na resolução do roteador, então `novo` nunca chega aqui como id.
 * Aberta a todo membro, inclusive o viewer, que lê a ficha sem as ações.
 */
const rotaLead = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/leads/$id',
  component: TelaDoLead,
})

/**
 * A identidade da Sarah (RF-301). Pende de `aplicacao` como toda tela de
 * produto: fora da rota-camada ela nasceria pública, e quem a abrisse sem
 * sessão veria o nome e a oferta da conta.
 *
 * Quem não administra a conta abre a tela em leitura, com os campos
 * desabilitados e a negativa dizendo a quem pedir: aqui há o que ler, ao
 * contrário de `/config/discagem`, e esconder a identidade de quem opera o
 * funil tiraria dele a resposta para "o que a Sarah anda dizendo?".
 */
const rotaIdentidadeDaSarah = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/sarah/identidade',
  component: TelaDeIdentidadeDaSarah,
})

/**
 * A voz da Sarah (RF-302, RF-303). Em leitura para quem não administra a
 * conta, pela mesma razão da identidade: ouvir a voz que o lead ouve é
 * resposta para quem opera o funil, e escolher é de quem administra.
 */
const rotaVozDaSarah = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/sarah/voz',
  component: TelaDeVozDaSarah,
})

/**
 * Os playbooks da Sarah (RF-306, RF-307, RF-311). Em leitura para quem não
 * administra a conta, inclusive o histórico: é ele que explica o que a Sarah
 * disse numa ligação, e quem opera o funil precisa dessa resposta.
 */
const rotaPlaybooksDaSarah = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/sarah/playbooks',
  component: TelaDePlaybooksDaSarah,
})

/**
 * As linhas telefônicas (RF-409, RF-709). Em leitura para quem não administra
 * a conta: é o discador manual que mostra a origem da ligação, e quem opera o
 * funil precisa saber por qual número a Sarah liga.
 */
const rotaEspecialistas = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/especialistas',
  component: TelaDeEspecialistas,
})

const rotaFunil = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/funil',
  component: TelaDoFunil,
})

const rotaConhecimento = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/sarah/conhecimento',
  component: TelaDeConhecimento,
})

/**
 * O ensaio (US-247). O condutor da conversa entra por aqui e não de dentro da
 * tela: ele só roda no navegador — pede microfone e abre WebSocket —, e é o
 * que o teste troca por um dublê para provar os estados sem navegador nenhum.
 * O microfone entra do mesmo jeito (US-115, `ensaio/voz.ts`).
 */
const rotaEnsaio = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/sarah/ensaio',
  component: () => (
    <TelaDeEnsaio condutor={criarCondutorDaElevenLabs()} microfone={criarMicrofoneDoNavegador()} />
  ),
})

const rotaNumeros = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/numeros',
  component: TelaDeNumeros,
})

/**
 * A lista de chamadas (RF-413). Aberta a todo membro, como a ficha. O recorte
 * viaja na barra de endereço, e toda chave sai daqui, ainda que indefinida: a
 * busca do match herda a da raiz, e devolver só as preenchidas deixaria passar
 * o que veio escrito à mão. Quem decide se o valor é aceitável é
 * `recorteDaBusca`, na tela.
 */
/** Precisam de você: a fila de exceções (RF-909, RF-910). */
const rotaFila = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/fila',
  component: TelaDaFila,
})

const rotaChamadas = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/chamadas',
  component: TelaDeChamadas,
  validateSearch: (busca: Record<string, unknown>): BuscaDeChamadas => ({
    periodo: textoDaBusca(busca.periodo),
    proposito: textoDaBusca(busca.proposito),
    resultado: textoDaBusca(busca.resultado),
    numero: textoDaBusca(busca.numero),
    ordenacao: textoDaBusca(busca.ordenacao),
  }),
})

/**
 * A ficha da chamada (RF-414). Aberta a todo membro, inclusive o viewer: a
 * RLS de `calls` já é de leitura para qualquer papel, e a ficha é a prova de
 * que a ligação aconteceu como devia.
 */
const rotaChamada = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/chamadas/$id',
  component: TelaDaChamada,
})

/**
 * A agenda e a lista de reuniões (RF-510). Aberta a todo membro: `meetings` é
 * classe Operação e todo membro lê a agenda. O recorte viaja na barra de
 * endereço, e toda chave sai daqui, ainda que indefinida: a busca do match
 * herda a da raiz, e devolver só as preenchidas deixaria o filtro sem efeito.
 * Quem decide se o valor é aceitável é `recorteDaBusca`, na tela.
 */
const rotaReunioes = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/reunioes',
  component: TelaDeReunioes,
  validateSearch: (busca: Record<string, unknown>): BuscaDeReunioes => ({
    vista: textoDaBusca(busca.vista),
    periodo: textoDaBusca(busca.periodo),
    // `?semana=3` escrito à mão chega número: o roteador lê a busca como JSON.
    semana: typeof busca.semana === 'number' ? String(busca.semana) : textoDaBusca(busca.semana),
    especialista: textoDaBusca(busca.especialista),
    estado: textoDaBusca(busca.estado),
    modalidade: textoDaBusca(busca.modalidade),
  }),
})

/**
 * A ficha da reunião (RF-511). Aberta a todo membro, como a lista. Reunião
 * inexistente, de outra conta e de ensaio dão o mesmo "não encontrada".
 */
const rotaReuniao = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/reunioes/$id',
  component: TelaDaReuniao,
})

const rotaAuditoria = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/config/auditoria',
  component: TelaDeAuditoria,
})

/**
 * As conversas de WhatsApp. Aberta a todo membro, como a fila: o Observador lê
 * quem está atendendo cada uma, e assumir, devolver e encerrar são de quem
 * opera (`podeOperarConversas`).
 */
const rotaConversas = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/conversas',
  component: TelaDeConversas,
})

/**
 * A conversa aberta, irmã da lista como a ficha da chamada é irmã da lista de
 * chamadas: `/conversas/$id` não divide casca com `/conversas`.
 */
const rotaConversa = createRoute({
  getParentRoute: () => rotaAplicacao,
  path: '/conversas/$id',
  component: TelaDaConversa,
})

const arvoreDeRotas = rotaRaiz.addChildren([
  rotaEntrar,
  rotaConvite,
  rotaRecuperarSenha,
  rotaAplicacao.addChildren([
    rotaConta,
    rotaPainel,
    rotaFila,
    rotaConfiguracaoInicial,
    rotaFunil,
    rotaLeads,
    rotaCadastroDeLead,
    rotaImportacaoDeLeads,
    rotaLead,
    rotaEquipe,
    rotaIntegracoes,
    rotaDiscagem,
    rotaBloqueios,
    rotaPrivacidade,
    rotaIdentidadeDaSarah,
    rotaVozDaSarah,
    rotaPlaybooksDaSarah,
    rotaConhecimento,
    rotaEnsaio,
    rotaNumeros,
    rotaEspecialistas,
    rotaChamadas,
    rotaChamada,
    rotaReunioes,
    rotaReuniao,
    rotaAuditoria,
    rotaConversas,
    rotaConversa,
  ]),
])

export function criarRoteador(
  contexto: ContextoDoRoteador,
  historico?: RouterHistory,
) {
  return createRouter({
    routeTree: arvoreDeRotas,
    context: contexto,
    ...(historico ? { history: historico } : {}),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof criarRoteador>
  }
}

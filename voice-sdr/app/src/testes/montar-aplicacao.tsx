import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { esquecerTutorialVisto } from '@/configuracao-inicial/visita'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render } from '@testing-library/react'

import { ProvedorDeAuditoria } from '@/auditoria/provedor'
import type { ServicoDeAuditoria } from '@/auditoria/tipos'
import { ProvedorDeAutenticacao } from '@/autenticacao/provedor'
import { ProvedorDeBloqueios } from '@/bloqueios/provedor'
import type { ServicoDeBloqueios } from '@/bloqueios/tipos'
import { ProvedorDeChamadas } from '@/chamadas/provedor'
import type { ServicoDeChamadas } from '@/chamadas/tipos'
import type { ServicoDeAutenticacao } from '@/autenticacao/tipos'
import { ProvedorDeConfiguracaoInicial } from '@/configuracao-inicial/provedor'
import { ProvedorDeDiscagem } from '@/discagem/provedor'
import type { ServicoDeDiscagem } from '@/discagem/tipos'
import { ProvedorDeDiagnostico } from '@/diagnostico/provedor'
import type { ServicoDeDiagnostico } from '@/diagnostico/tipos'
import type { ServicoDeConfiguracaoInicial } from '@/configuracao-inicial/tipos'
import { ProvedorDoEnsaio } from '@/ensaio/provedor'
import type { ServicoDoEnsaio } from '@/ensaio/tipos'
import { ProvedorDeEquipe } from '@/equipe/provedor'
import { ProvedorDaConta } from '@/conta/provedor'
import type { ServicoDaConta } from '@/conta/tipos'
import { ProvedorDeEspecialistas } from '@/especialistas/provedor'
import { ProvedorDaFila } from '@/fila/provedor'
import type { ServicoDaFila } from '@/fila/tipos'
import type { ServicoDeEspecialistas } from '@/especialistas/tipos'
import type { ServicoDeEquipe } from '@/equipe/tipos'
import { ProvedorDeIntegracoes } from '@/integracoes/provedor'
import type { ServicoDeIntegracoes } from '@/integracoes/tipos'
import { ProvedorDeLeads } from '@/leads/provedor'
import type { ServicoDeLeads } from '@/leads/tipos'
import { ProvedorDeNumeros } from '@/numeros/provedor'
import { ProvedorDoPainel } from '@/painel/provedor'
import type { ServicoDoPainel } from '@/painel/tipos'
import { ProvedorDePrivacidade } from '@/privacidade/provedor'
import type { ServicoDePrivacidade } from '@/privacidade/tipos'
import type { ServicoDeNumeros } from '@/numeros/tipos'
import { ProvedorDeReunioes } from '@/reunioes/provedor'
import type { ServicoDeReunioes } from '@/reunioes/tipos'
import { criarRoteador } from '@/roteador'
import { ProvedorDaSarah } from '@/sarah/provedor'
import type { ServicoDaSarah } from '@/sarah/tipos'
import { ProvedorDeWhatsapp } from '@/whatsapp/provedor'
import type { ServicoDeWhatsapp } from '@/whatsapp/tipos'
import { criarServicoDeAuditoriaDublado } from '@/testes/servico-de-auditoria-dublado'
import { criarServicoDeBloqueiosDublado } from '@/testes/servico-de-bloqueios-dublado'
import { criarServicoDeChamadasDublado } from '@/testes/servico-de-chamadas-dublado'
import { criarServicoDeConfiguracaoDublado } from '@/testes/servico-de-configuracao-dublado'
import { criarServicoDeDiscagemDublado } from '@/testes/servico-de-discagem-dublado'
import { criarServicoDeEquipeDublado } from '@/testes/servico-de-equipe-dublado'
import { criarServicoDaContaDublado } from '@/testes/servico-da-conta-dublado'
import { criarServicoDeEspecialistasDublado } from '@/testes/servico-de-especialistas-dublado'
import { criarServicoDeIntegracoesDublado } from '@/testes/servico-de-integracoes-dublado'
import { criarServicoDeLeadsDublado } from '@/testes/servico-de-leads-dublado'
import { criarServicoDeNumerosDublado } from '@/testes/servico-de-numeros-dublado'
import { criarServicoDePrivacidadeDublado } from '@/testes/servico-de-privacidade-dublado'
import { criarServicoDaSarahDublado } from '@/testes/servico-da-sarah-dublado'
import { criarServicoDoEnsaioDublado } from '@/testes/servico-do-ensaio-dublado'
import { criarServicoDaFilaDublado } from '@/testes/servico-da-fila-dublado'
import { criarServicoDeDiagnosticoDublado } from '@/testes/servico-de-diagnostico-dublado'
import { criarServicoDoPainelDublado } from '@/testes/servico-do-painel-dublado'
import { criarServicoDeReunioesDublado } from '@/testes/servico-de-reunioes-dublado'
import { criarServicoDeWhatsappDublado } from '@/testes/servico-de-whatsapp-dublado'

/**
 * Monta a aplicação inteira em jsdom, com o roteador de verdade sobre
 * histórico em memória e os serviços dublados. É o que permite exercitar
 * guarda de rota e navegação sem navegador.
 */
export async function montarAplicacao(
  servico: ServicoDeAutenticacao,
  caminhoInicial = '/',
  equipe: ServicoDeEquipe = criarServicoDeEquipeDublado(),
  auditoria: ServicoDeAuditoria = criarServicoDeAuditoriaDublado(),
  integracoes: ServicoDeIntegracoes = criarServicoDeIntegracoesDublado(),
  // O padrão é uma conta já configurada: assim o checklist da barra lateral
  // não aparece em teste que não é sobre ele.
  configuracao: ServicoDeConfiguracaoInicial = criarServicoDeConfiguracaoDublado(),
  leads: ServicoDeLeads = criarServicoDeLeadsDublado(),
  sarah: ServicoDaSarah = criarServicoDaSarahDublado(),
  numeros: ServicoDeNumeros = criarServicoDeNumerosDublado(),
  // O padrão é o freio solto e nenhuma chamada em curso: o aviso de discagem
  // pausada não aparece em teste que não é sobre ele.
  chamadas: ServicoDeChamadas = criarServicoDeChamadasDublado(),
  discagem: ServicoDeDiscagem = criarServicoDeDiscagemDublado(),
  bloqueios: ServicoDeBloqueios = criarServicoDeBloqueiosDublado(),
  privacidade: ServicoDePrivacidade = criarServicoDePrivacidadeDublado(),
  especialistas: ServicoDeEspecialistas = criarServicoDeEspecialistasDublado(),
  ensaio: ServicoDoEnsaio = criarServicoDoEnsaioDublado(),
  // O padrão é a fila limpa: nenhum item aparece em teste que não é sobre ela.
  fila: ServicoDaFila = criarServicoDaFilaDublado(),
  conta: ServicoDaConta = criarServicoDaContaDublado(),
  // O padrão é nenhuma análise gravada: o cartão da ficha mostra só o botão.
  diagnostico: ServicoDeDiagnostico = criarServicoDeDiagnosticoDublado(),
  // O padrão é o período vazio: abaixo do discador, só o estado vazio.
  painel: ServicoDoPainel = criarServicoDoPainelDublado(),
  // O padrão é a conta sem reunião nenhuma.
  reunioes: ServicoDeReunioes = criarServicoDeReunioesDublado(),
  // O padrão é nenhuma conversa de WhatsApp gravada.
  whatsapp: ServicoDeWhatsapp = criarServicoDeWhatsappDublado(),
) {
  // Cada montagem é uma carga nova da aplicação.
  esquecerTutorialVisto()
  const roteador = criarRoteador(
    { autenticacao: servico },
    createMemoryHistory({ initialEntries: [caminhoInicial] }),
  )

  // jsdom não implementa scrollTo, e a restauração de rolagem do roteador o
  // chama a cada navegação. Sem o coto, cada teste imprime o aviso.
  window.scrollTo = () => {}

  // Cliente novo a cada montagem: cache compartilhado entre testes faria um
  // deles ler a resposta que o anterior guardou. Sem repetição, para a falha
  // aparecer no primeiro retorno em vez de depois de três tentativas.
  const clienteDeConsulta = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  await roteador.load()

  const resultado = render(
    <ProvedorDeAutenticacao servico={servico}>
      <ProvedorDeEquipe servico={equipe}>
        <ProvedorDeAuditoria servico={auditoria}>
          <ProvedorDeIntegracoes servico={integracoes}>
            <ProvedorDeConfiguracaoInicial servico={configuracao}>
              <ProvedorDeLeads servico={leads}>
                <ProvedorDaSarah servico={sarah}>
                  <ProvedorDeNumeros servico={numeros}>
                    <ProvedorDeChamadas servico={chamadas}>
                      <ProvedorDeDiscagem servico={discagem}>
                        <ProvedorDeBloqueios servico={bloqueios}>
                          <ProvedorDePrivacidade servico={privacidade}>
                            <ProvedorDeEspecialistas servico={especialistas}>
                              <ProvedorDoEnsaio servico={ensaio}>
                                <ProvedorDaFila servico={fila}>
                                  <ProvedorDaConta servico={conta}>
                                    <ProvedorDeDiagnostico servico={diagnostico}>
                                    <ProvedorDoPainel servico={painel}>
                                    <ProvedorDeReunioes servico={reunioes}>
                                    <ProvedorDeWhatsapp servico={whatsapp}>
                                      <QueryClientProvider client={clienteDeConsulta}>
                                        <RouterProvider router={roteador} />
                                      </QueryClientProvider>
                                    </ProvedorDeWhatsapp>
                                    </ProvedorDeReunioes>
                                    </ProvedorDoPainel>
                                    </ProvedorDeDiagnostico>
                                  </ProvedorDaConta>
                                </ProvedorDaFila>
                              </ProvedorDoEnsaio>
                            </ProvedorDeEspecialistas>
                          </ProvedorDePrivacidade>
                        </ProvedorDeBloqueios>
                      </ProvedorDeDiscagem>
                    </ProvedorDeChamadas>
                  </ProvedorDeNumeros>
                </ProvedorDaSarah>
              </ProvedorDeLeads>
            </ProvedorDeConfiguracaoInicial>
          </ProvedorDeIntegracoes>
        </ProvedorDeAuditoria>
      </ProvedorDeEquipe>
    </ProvedorDeAutenticacao>,
  )

  return { roteador, ...resultado }
}

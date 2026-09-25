import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { Aplicacao } from '@/aplicacao'
import { ProvedorDeAuditoria } from '@/auditoria/provedor'
import { ProvedorDeChamadas } from '@/chamadas/provedor'
import { criarServicoDeChamadas } from '@/chamadas/servico-supabase'
import { criarServicoDeAuditoria } from '@/auditoria/servico-supabase'
import { ProvedorDeAutenticacao } from '@/autenticacao/provedor'
import { ProvedorDeBloqueios } from '@/bloqueios/provedor'
import { criarServicoDeBloqueios } from '@/bloqueios/servico-supabase'
import {
  criarClienteSupabase,
  criarServicoDeAutenticacao,
} from '@/autenticacao/servico-supabase'
import { AvisoDeVersao } from '@/conexao/aviso-de-versao'
import {
  daConfiguracaoDoBuild,
  esquecer,
  guardar,
  lerDoFragmento,
  lerGuardada,
  limparFragmento,
  resolverConfiguracao,
} from '@/conexao/configuracao-do-projeto'
import type { ProjetoConectado } from '@/conexao/contexto'
import { ProvedorDoProjeto } from '@/conexao/provedor'
import { ConfirmacaoDeProjeto, TelaDeConexao } from '@/conexao/tela-de-conexao'
import { ProvedorDeConfiguracaoInicial } from '@/configuracao-inicial/provedor'
import { criarServicoDeConfiguracaoInicial } from '@/configuracao-inicial/servico-supabase'
import { ProvedorDeDiscagem } from '@/discagem/provedor'
import { criarServicoDeDiscagem } from '@/discagem/servico-supabase'
import { ProvedorDeDiagnostico } from '@/diagnostico/provedor'
import { criarServicoDeDiagnostico } from '@/diagnostico/servico-supabase'
import { ProvedorDoEnsaio } from '@/ensaio/provedor'
import { criarServicoDoEnsaio } from '@/ensaio/servico-supabase'
import { ProvedorDeEquipe } from '@/equipe/provedor'
import { ProvedorDaFila } from '@/fila/provedor'
import { criarServicoDaFila } from '@/fila/servico-supabase'
import { ProvedorDaConta } from '@/conta/provedor'
import { criarServicoDaConta } from '@/conta/servico-supabase'
import { ProvedorDeEspecialistas } from '@/especialistas/provedor'
import { criarServicoDeEspecialistas } from '@/especialistas/servico-supabase'
import { criarServicoDeEquipe } from '@/equipe/servico-supabase'
import { ProvedorDeIntegracoes } from '@/integracoes/provedor'
import { criarServicoDeIntegracoes } from '@/integracoes/servico-supabase'
import { ProvedorDeLeads } from '@/leads/provedor'
import { criarServicoDeLeads } from '@/leads/servico-supabase'
import { ProvedorDeNumeros } from '@/numeros/provedor'
import { criarServicoDeNumeros } from '@/numeros/servico-supabase'
import { ProvedorDoPainel } from '@/painel/provedor'
import { criarServicoDoPainel } from '@/painel/servico-supabase'
import { ProvedorDePrivacidade } from '@/privacidade/provedor'
import { criarServicoDePrivacidade } from '@/privacidade/servico-supabase'
import { ProvedorDeReunioes } from '@/reunioes/provedor'
import { criarServicoDeReunioes } from '@/reunioes/servico-supabase'
import { criarRoteador } from '@/roteador'
import { ProvedorDaSarah } from '@/sarah/provedor'
import { criarServicoDaSarah } from '@/sarah/servico-supabase'
import { ProvedorDeWhatsapp } from '@/whatsapp/provedor'
import { criarServicoDeWhatsapp } from '@/whatsapp/servico-supabase'
import { esquecerDadosDoNavegador } from '@/utilidades/dados-do-navegador'

import './estilos.css'

const clienteDeConsulta = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

const raiz = document.getElementById('root')
if (!raiz) {
  throw new Error('Elemento #root não encontrado no documento.')
}

// Qual projeto Supabase esta cópia usa: o link do instalador, o que foi
// gravado neste navegador ou as variáveis do build, nessa ordem
// (`conexao/configuracao-do-projeto.ts`). O fragmento sai da barra de endereço
// logo depois de lido, para não ficar no histórico nem ser copiado adiante.
const doFragmento = lerDoFragmento(window.location.hash)
const { ativa, pendente } = resolverConfiguracao({
  doFragmento,
  guardada: lerGuardada(),
  doBuild: daConfiguracaoDoBuild(import.meta.env),
})
if (doFragmento) {
  limparFragmento()
  if (ativa === doFragmento) guardar(ativa)
}

/** Recomeça a carga: projeto novo é cliente, sessão e cache novos. */
function recomecar() {
  window.location.replace('/')
}

if (!ativa) {
  // Sem projeto não há Auth a quem pedir sessão: a conexão vem antes da entrada.
  createRoot(raiz).render(
    <StrictMode>
      <TelaDeConexao aoConectar={recomecar} />
    </StrictMode>,
  )
} else if (pendente) {
  createRoot(raiz).render(
    <StrictMode>
      <ConfirmacaoDeProjeto
        atual={ativa}
        novo={pendente}
        aoConfirmar={() => {
          guardar(pendente)
          recomecar()
        }}
        aoManter={recomecar}
      />
    </StrictMode>,
  )
} else {
  const cliente = criarClienteSupabase(ativa)
  const servicoDeAutenticacao = criarServicoDeAutenticacao(cliente)

  // A sessão guardada é lida antes do primeiro desenho. Sem isso a guarda de
  // rota rodaria com `temSessao()` falso e mandaria para /entrar quem já entrou.
  await servicoDeAutenticacao.iniciar()

  const roteador = criarRoteador({ autenticacao: servicoDeAutenticacao })

  // Trocar de projeto é recomeçar: a sessão deste projeto sai do navegador, o
  // cache de consultas e o que a sessão deixou vão embora, e a carga seguinte
  // abre na tela de conexão.
  const projeto: ProjetoConectado = {
    configuracao: ativa,
    async trocarDeProjeto() {
      await cliente.auth.signOut({ scope: 'local' }).catch(() => undefined)
      clienteDeConsulta.clear()
      esquecerDadosDoNavegador()
      esquecer()
      recomecar()
    },
  }

  createRoot(raiz).render(
    <StrictMode>
      <ProvedorDoProjeto valor={projeto}>
      <ProvedorDeAutenticacao servico={servicoDeAutenticacao}>
        <ProvedorDeEquipe servico={criarServicoDeEquipe(cliente)}>
          <ProvedorDeAuditoria servico={criarServicoDeAuditoria(cliente)}>
            <ProvedorDeIntegracoes servico={criarServicoDeIntegracoes(cliente, ativa.url)}>
              <ProvedorDeConfiguracaoInicial
                servico={criarServicoDeConfiguracaoInicial(cliente)}
              >
                <ProvedorDeLeads servico={criarServicoDeLeads(cliente)}>
                  <ProvedorDaSarah servico={criarServicoDaSarah(cliente)}>
                    <ProvedorDeNumeros servico={criarServicoDeNumeros(cliente)}>
                      <ProvedorDeChamadas servico={criarServicoDeChamadas(cliente)}>
                        <ProvedorDeDiscagem servico={criarServicoDeDiscagem(cliente)}>
                          <ProvedorDeBloqueios servico={criarServicoDeBloqueios(cliente)}>
                            <ProvedorDePrivacidade servico={criarServicoDePrivacidade(cliente)}>
                              <ProvedorDeEspecialistas
                                servico={criarServicoDeEspecialistas(cliente)}
                              >
                                <ProvedorDoEnsaio servico={criarServicoDoEnsaio(cliente)}>
                                  <ProvedorDaFila servico={criarServicoDaFila(cliente)}>
                                    <ProvedorDaConta servico={criarServicoDaConta(cliente)}>
                                      <ProvedorDeDiagnostico servico={criarServicoDeDiagnostico(cliente)}>
                                      <ProvedorDoPainel servico={criarServicoDoPainel(cliente)}>
                                      <ProvedorDeReunioes servico={criarServicoDeReunioes(cliente)}>
                                      <ProvedorDeWhatsapp servico={criarServicoDeWhatsapp(cliente)}>
                                        <QueryClientProvider client={clienteDeConsulta}>
                                          <AvisoDeVersao url={ativa.url} />
                                          <Aplicacao roteador={roteador} />
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
      </ProvedorDeAutenticacao>
      </ProvedorDoProjeto>
    </StrictMode>,
  )
}

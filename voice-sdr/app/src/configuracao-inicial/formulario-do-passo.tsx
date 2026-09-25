import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, type ComponentType } from 'react'

import type { PropsDeTelaEmbutivel } from '@/componentes/area-de-trabalho'
import {
  CAMINHO_DA_TELA,
  LEITURAS,
  remedirDepoisDeGravar,
  telasDoPasso,
  type TelaEmbutida,
} from '@/configuracao-inicial/telas-do-passo'
import type { PassoId } from '@/configuracao-inicial/tipos'
import {
  TELAS_EMBUTIDAS_EM_PORTUGUES,
  configuracaoInicial as copy,
} from '@/copy/configuracao-inicial'
import { ProvedorDeDiscagem } from '@/discagem/provedor'
import { useServicoDeDiscagem } from '@/discagem/contexto'
import { ProvedorDeEquipe } from '@/equipe/provedor'
import { useServicoDeEquipe } from '@/equipe/contexto'
import { ProvedorDeEspecialistas } from '@/especialistas/provedor'
import { useServicoDeEspecialistas } from '@/especialistas/contexto'
import { ProvedorDeIntegracoes } from '@/integracoes/provedor'
import { useServicoDeIntegracoes } from '@/integracoes/contexto'
import { ProvedorDeLeads } from '@/leads/provedor'
import { useServicoDeLeads } from '@/leads/contexto'
import { ProvedorDeNumeros } from '@/numeros/provedor'
import { useServicoDeNumeros } from '@/numeros/contexto'
import { ProvedorDePrivacidade } from '@/privacidade/provedor'
import { useServicoDePrivacidade } from '@/privacidade/contexto'
import { TelaDePoliticaDeDiscagem } from '@/rotas/config-discagem'
import { TelaDeIntegracoes } from '@/rotas/config-integracoes'
import { TelaDePrivacidade } from '@/rotas/config-privacidade'
import { TelaDeEquipe } from '@/rotas/config-equipe'
import { TelaDeEspecialistas } from '@/rotas/especialistas'
import { TelaDeImportacaoDeLeads } from '@/rotas/leads-importar'
import { TelaDeNumeros } from '@/rotas/numeros'
import { TelaDeIdentidadeDaSarah } from '@/rotas/sarah-identidade'
import { TelaDePlaybooksDaSarah } from '@/rotas/sarah-playbooks'
import { TelaDeVozDaSarah } from '@/rotas/sarah-voz'
import { ProvedorDaSarah } from '@/sarah/provedor'
import { useServicoDaSarah } from '@/sarah/contexto'

const COMPONENTE_DA_TELA: Record<
  TelaEmbutida,
  ComponentType<PropsDeTelaEmbutivel>
> = {
  integracoes: TelaDeIntegracoes,
  identidade: TelaDeIdentidadeDaSarah,
  voz: TelaDeVozDaSarah,
  playbooks: TelaDePlaybooksDaSarah,
  numeros: TelaDeNumeros,
  especialistas: TelaDeEspecialistas,
  importacao: TelaDeImportacaoDeLeads,
  equipe: TelaDeEquipe,
  discagem: TelaDePoliticaDeDiscagem,
  privacidade: TelaDePrivacidade,
}

/**
 * O formulário do passo: as telas que resolvem o passo, montadas com
 * `dentroDoAssistente`. Os serviços são os que os provedores da aplicação já
 * entregam, lidos daqui e devolvidos à árvore embrulhados: toda escrita pede
 * ao assistente a medição de novo, e o passo resolvido aparece concluído sem
 * recarregar.
 */
type FormularioDoPassoProps = {
  passo: PassoId
  /** Algum campo das telas mudou. É o que torna a saída do passo uma pergunta. */
  aoAlterar?: () => void
  /** Uma tela gravou e o serviço aceitou: a alteração deixou de estar pendente. */
  aoGravar?: () => void
}

export function FormularioDoPasso({
  passo,
  aoAlterar,
  aoGravar,
}: FormularioDoPassoProps) {
  const telas = telasDoPasso(passo)

  const cliente = useQueryClient()
  const remedir = useCallback(
    (aceita: boolean) => {
      void cliente.invalidateQueries({ queryKey: ['configuracao-inicial'] })
      if (aceita) aoGravar?.()
    },
    [cliente, aoGravar],
  )

  const integracoes = useServicoDeIntegracoes()
  const sarah = useServicoDaSarah()
  const numeros = useServicoDeNumeros()
  const especialistas = useServicoDeEspecialistas()
  const leads = useServicoDeLeads()
  const equipe = useServicoDeEquipe()
  const discagem = useServicoDeDiscagem()
  const privacidade = useServicoDePrivacidade()

  const servicos = useMemo(
    () => ({
      integracoes: remedirDepoisDeGravar(integracoes, LEITURAS.integracoes, remedir),
      sarah: remedirDepoisDeGravar(sarah, LEITURAS.sarah, remedir),
      numeros: remedirDepoisDeGravar(numeros, LEITURAS.numeros, remedir),
      especialistas: remedirDepoisDeGravar(
        especialistas,
        LEITURAS.especialistas,
        remedir,
      ),
      leads: remedirDepoisDeGravar(leads, LEITURAS.leads, remedir),
      equipe: remedirDepoisDeGravar(equipe, LEITURAS.equipe, remedir),
      discagem: remedirDepoisDeGravar(discagem, LEITURAS.discagem, remedir),
      privacidade: remedirDepoisDeGravar(
        privacidade,
        LEITURAS.privacidade,
        remedir,
      ),
    }),
    [
      integracoes,
      sarah,
      numeros,
      especialistas,
      leads,
      equipe,
      discagem,
      privacidade,
      remedir,
    ],
  )

  if (telas.length === 0) return null

  const secoes = telas.map((tela) => {
    const Tela = COMPONENTE_DA_TELA[tela]
    const titulo = TELAS_EMBUTIDAS_EM_PORTUGUES[tela]

    return (
      <section key={`${passo}-${tela}`} aria-label={titulo} className="border-t border-borda-suave pt-5">
        <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="titulo-de-secao m-0">{titulo}</h2>
          {/* `<a href>` e não `<Link>`: sair para a tela cheia troca a
              página inteira, como a barra lateral. */}
          <a href={CAMINHO_DA_TELA[tela]} className="botao-link">
            {copy.passo.telaCheia}
          </a>
        </div>
        <Tela dentroDoAssistente />
      </section>
    )
  })

  return (
    <ProvedorDeIntegracoes servico={servicos.integracoes}>
      <ProvedorDaSarah servico={servicos.sarah}>
        <ProvedorDeNumeros servico={servicos.numeros}>
          <ProvedorDeEspecialistas servico={servicos.especialistas}>
            <ProvedorDeLeads servico={servicos.leads}>
              <ProvedorDeEquipe servico={servicos.equipe}>
                <ProvedorDeDiscagem servico={servicos.discagem}>
                  <ProvedorDePrivacidade servico={servicos.privacidade}>
                    {/* Nenhuma tela sabe que está dentro do assistente, então
                        a alteração se lê pelo evento que sobe do campo, e não
                        por estado de cada formulário. */}
                    <div onChange={aoAlterar} className="flex flex-col gap-5">
                      {secoes}
                    </div>
                  </ProvedorDePrivacidade>
                </ProvedorDeDiscagem>
              </ProvedorDeEquipe>
            </ProvedorDeLeads>
          </ProvedorDeEspecialistas>
        </ProvedorDeNumeros>
      </ProvedorDaSarah>
    </ProvedorDeIntegracoes>
  )
}

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { NegativaPorPapel } from '@/componentes/negativa-por-papel'
import { Painel } from '@/componentes/painel'
import { useServicoDaConta } from '@/conta/contexto'
import {
  CAMPOS_DOS_LIMIARES,
  LIMIARES_PADRAO,
  limiaresMudaram,
  rascunhoDe,
  validarLimiares,
  valorLegivel,
  type CampoDoLimiar,
  type LimiaresDaFila,
  type RascunhoDosLimiares,
} from '@/conta/limiares'
import type { CargaDosLimiares, MotivoDeFalhaDosLimiares } from '@/conta/tipos'
import { configConta } from '@/copy/config-conta'
import type { Membro } from '@/equipe/tipos'

const copy = configConta.limiares
const CHAVE_DOS_LIMIARES = ['limiares-da-fila'] as const

function legivel(campo: CampoDoLimiar, limiares: LimiaresDaFila): string {
  return valorLegivel(campo, limiares) ?? copy.semAviso
}

/**
 * Os quatro limiares da fila (RF-915) em /config/conta. A tela grava
 * configuração e não decide nada sobre a fila: quem compara é
 * `_shared/fila/gatilhos.ts`, na finalização de cada chamada seguinte.
 *
 * Os quatro estados: carregando, falha, conta sem linha de configuração e os
 * limiares. Quem não administra vê os valores e a negativa, sem campo.
 */
export function LimiaresDaFilaNaConta({
  podeAjustar,
  administradores,
}: {
  podeAjustar: boolean
  administradores: readonly Membro[]
}) {
  const servico = useServicoDaConta()
  const consulta = useQuery({
    queryKey: CHAVE_DOS_LIMIARES,
    queryFn: () => servico.carregarLimiares(),
  })

  let conteudo
  if (consulta.isPending) {
    conteudo = <Carregando texto={copy.carregando} />
  } else if (!consulta.data?.ok) {
    conteudo = <CaixaDeErro>{copy.falhas[consulta.data?.motivo ?? 'falha-de-comunicacao']}</CaixaDeErro>
  } else if (!consulta.data.limiares) {
    conteudo = <EstadoVazio titulo={copy.vazio.titulo} explicacao={copy.vazio.explicacao} />
  } else if (!podeAjustar) {
    conteudo = <EmLeitura limiares={consulta.data.limiares} administradores={administradores} />
  } else {
    conteudo = <Formulario gravados={consulta.data.limiares} />
  }

  return (
    <Painel rotulo={copy.rotulo} sobretitulo={copy.sobretitulo} titulo={copy.titulo} apoio={copy.apoio}>
      <div className="flex flex-col gap-4">
        <p className="m-0 text-[13px] text-texto-secundario">{copy.vigencia}</p>
        {conteudo}
      </div>
    </Painel>
  )
}

/** O que o limiar dispara, o padrão e o valor em uso: o mesmo nos dois modos. */
function Explicacao({ campo, gravados }: { campo: CampoDoLimiar; gravados: LimiaresDaFila }) {
  return (
    <>
      <p className="m-0 text-[12.5px] text-texto-apoio">{copy.campos[campo].dispara}</p>
      {campo === 'avisoDeCreditoCentavos' ? (
        <p className="m-0 text-[12.5px] text-texto-apoio">{copy.creditoEmBranco}</p>
      ) : null}
      <p className="val m-0 text-[12px] text-texto-secundario">
        {copy.atual(legivel(campo, gravados))}
      </p>
    </>
  )
}

function EmLeitura({
  limiares,
  administradores,
}: {
  limiares: LimiaresDaFila
  administradores: readonly Membro[]
}) {
  return (
    <>
      <NegativaPorPapel aviso={copy.negativa} administradores={administradores} />
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        {CAMPOS_DOS_LIMIARES.map((campo) => (
          <div
            key={campo}
            role="group"
            aria-label={copy.campos[campo].rotulo}
            className="flex flex-col gap-1.5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="m-0 text-[13px] font-semibold">{copy.campos[campo].rotulo}</p>
              <span className="val text-[11.5px] text-texto-desativado">
                {copy.padrao(legivel(campo, LIMIARES_PADRAO))}
              </span>
            </div>
            <Explicacao campo={campo} gravados={limiares} />
          </div>
        ))}
      </div>
    </>
  )
}

type Aviso = { tom: 'sucesso'; texto: string } | { tom: 'falha'; motivo: MotivoDeFalhaDosLimiares }

function Formulario({ gravados }: { gravados: LimiaresDaFila }) {
  const servico = useServicoDaConta()
  const cliente = useQueryClient()
  const [rascunho, definirRascunho] = useState<RascunhoDosLimiares>(() => rascunhoDe(gravados))
  const [salvando, definirSalvando] = useState(false)
  const [aviso, definirAviso] = useState<Aviso | null>(null)

  const validacao = validarLimiares(rascunho)
  const mudou = validacao.ok && limiaresMudaram(gravados, validacao.limiares)

  function mudar(campo: CampoDoLimiar, valor: string) {
    definirRascunho((atual) => ({ ...atual, [campo]: valor }))
    definirAviso(null)
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    if (!validacao.ok || !mudou) return
    definirSalvando(true)
    const resultado = await servico.definirLimiares(validacao.limiares)
    definirSalvando(false)
    if (!resultado.ok) {
      definirAviso({ tom: 'falha', motivo: resultado.motivo })
      return
    }
    // A resposta do servidor é o que fica à vista, não o que foi pedido.
    const relida: CargaDosLimiares = { ok: true, limiares: resultado.limiares }
    cliente.setQueryData(CHAVE_DOS_LIMIARES, relida)
    definirRascunho(rascunhoDe(resultado.limiares))
    definirAviso({ tom: 'sucesso', texto: copy.salvo })
  }

  return (
    <form noValidate onSubmit={(evento) => void salvar(evento)} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        {CAMPOS_DOS_LIMIARES.map((campo) => (
          <div
            key={campo}
            role="group"
            aria-label={copy.campos[campo].rotulo}
            className="flex flex-col gap-1.5"
          >
            <CampoDeTexto
              rotulo={copy.campos[campo].rotulo}
              exemplo={copy.padrao(legivel(campo, LIMIARES_PADRAO))}
              inputMode={campo === 'pisoDeSentimento' ? 'text' : 'decimal'}
              autoComplete="off"
              value={rascunho[campo]}
              erro={
                !validacao.ok && validacao.erros[campo] ? copy.campos[campo].foraDoDominio : undefined
              }
              onChange={(evento) => mudar(campo, evento.target.value)}
            />
            <Explicacao campo={campo} gravados={gravados} />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="botao-primario" disabled={!validacao.ok || !mudou || salvando}>
          {salvando ? copy.salvando : copy.salvar}
        </button>
        {!validacao.ok ? (
          <p className="m-0 text-[12.5px] text-texto-apoio">{copy.corrigirAntes}</p>
        ) : !mudou && !aviso ? (
          <p className="m-0 text-[12.5px] text-texto-apoio">{copy.semMudanca}</p>
        ) : null}
      </div>

      {aviso?.tom === 'falha' ? <CaixaDeErro>{copy.falhasAoSalvar[aviso.motivo]}</CaixaDeErro> : null}
      {aviso?.tom === 'sucesso' ? (
        <p role="status" className="m-0 text-[13px] text-positivo">
          {aviso.texto}
        </p>
      ) : null}
    </form>
  )
}

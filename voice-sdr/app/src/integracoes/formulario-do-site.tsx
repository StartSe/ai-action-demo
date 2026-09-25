import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { Carregando } from '@/componentes/carregando'
import { Dialogo } from '@/componentes/dialogo'
import { Painel } from '@/componentes/painel'
import { Selo } from '@/componentes/selo'
import { integracoes } from '@/copy/integracoes'
import { useServicoDeIntegracoes } from '@/integracoes/contexto'
import type { MotivoDeFalhaDasIntegracoes } from '@/integracoes/tipos'
import { copiarTexto } from '@/utilidades/area-de-transferencia'
import { formatarInstante } from '@/utilidades/datas'

const copy = integracoes.formularioDoSite

/** A chave da consulta: o cartão relê depois de girar, e nada mais a usa. */
const CHAVE_DA_ENTRADA = ['integracoes', 'entrada-de-leads'] as const

/**
 * O endereço público de entrada de leads (`lead-intake`) e a chave que o
 * autentica (D-02 de docs/validacao-por-persona.md).
 *
 * Mora em Integrações porque é aqui que a conta liga o produto a outro
 * sistema; /config/webhooks é dos avisos que saem da conta, e /leads é a
 * lista do que já entrou. A chave nasce no navegador, só o hash vai ao banco
 * (`girar_chave_de_entrada`), e a chave em claro fica neste componente até
 * ele sair da tela: recarregar a some, de propósito.
 */
export function FormularioDoSite() {
  const servico = useServicoDeIntegracoes()
  const carga = useQuery({
    queryKey: CHAVE_DA_ENTRADA,
    queryFn: () => servico.carregarEntradaDeLeads(),
  })

  const [chaveNova, definirChaveNova] = useState<string | null>(null)
  const [confirmando, definirConfirmando] = useState(false)
  const [gerando, definirGerando] = useState(false)
  const [falha, definirFalha] = useState<MotivoDeFalhaDasIntegracoes | null>(null)

  async function gerar() {
    definirGerando(true)
    definirFalha(null)
    const giro = await servico.girarChaveDeEntrada()
    definirGerando(false)
    definirConfirmando(false)
    if (!giro.ok) {
      definirFalha(giro.motivo)
      return
    }
    definirChaveNova(giro.chave)
    await carga.refetch()
  }

  function pedirGeracao() {
    // Girar derruba a chave em uso: só pede confirmação quando já há uma.
    if (carga.data?.ok && carga.data.entrada.geradaEm) definirConfirmando(true)
    else void gerar()
  }

  const entrada = carga.data?.ok ? carga.data.entrada : null

  return (
    <Painel
      id="formulario-do-site"
      rotulo={copy.rotulo}
      titulo={copy.titulo}
      apoio={copy.apoio}
      estado={
        entrada ? (
          <Selo tom={entrada.geradaEm ? 'positivo' : 'neutro'}>
            {entrada.geradaEm ? copy.chave.seloComChave : copy.chave.seloSemChave}
          </Selo>
        ) : null
      }
    >
      <p className="mt-0 mb-0 text-[13.5px] text-texto-apoio">{copy.explicacao}</p>

      {carga.isPending ? (
        <Carregando texto={integracoes.carregando} />
      ) : !carga.data?.ok ? (
        <CaixaDeErro>{copy.falhas[carga.data?.motivo ?? 'falha-de-comunicacao']}</CaixaDeErro>
      ) : (
        <div className="mt-4 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="rotulo-de-indicador">{copy.endereco}</span>
            {entrada?.endereco ? (
              <TextoCopiavel rotulo={copy.endereco} texto={entrada.endereco} />
            ) : (
              <p className="m-0 text-[13px] text-texto-apoio">{copy.semEndereco}</p>
            )}
            <span className="rotulo-de-indicador mt-2">{copy.cabecalho}</span>
            <code className="val text-[13px] text-texto-principal">{copy.valorDoCabecalho}</code>
          </div>

          <div className="flex flex-col gap-2">
            <span className="rotulo-de-indicador">{copy.chave.titulo}</span>
            <p className="m-0 text-[13px] text-texto-apoio">
              {entrada?.geradaEm
                ? copy.chave.gerada(formatarInstante(entrada.geradaEm))
                : copy.chave.nenhuma}
            </p>

            {chaveNova ? (
              <div role="status" className="bloco-secundario flex flex-col gap-2 px-4 py-3.5">
                <span className="rotulo-de-indicador">{copy.chave.nova}</span>
                <TextoCopiavel rotulo={copy.chave.nova} texto={chaveNova} />
                <p className="m-0 text-[12.5px] font-semibold text-atencao">{copy.chave.umaVez}</p>
              </div>
            ) : null}

            {falha ? (
              <p role="alert" className="m-0 text-[13px] text-perigo">
                {copy.falhas[falha]}
              </p>
            ) : null}

            <div>
              <button
                type="button"
                className={entrada?.geradaEm ? 'botao-secundario' : 'botao-primario'}
                disabled={gerando}
                onClick={pedirGeracao}
              >
                {gerando
                  ? copy.chave.gerando
                  : entrada?.geradaEm
                    ? copy.chave.gerarOutra
                    : copy.chave.gerar}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="rotulo-de-indicador">{copy.campos.titulo}</span>
            <p className="m-0 text-[13px] text-texto-apoio">{copy.campos.apoio}</p>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              {copy.campos.lista.map((item) => (
                <div key={item.campo} className="contents">
                  <dt className="val text-texto-principal">{item.campo}</dt>
                  <dd className="m-0 text-texto-apoio">
                    {item.descricao} <span className="val">({item.outros})</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {entrada?.endereco ? (
            <div className="flex flex-col gap-2">
              <span className="rotulo-de-indicador">{copy.exemplo.titulo}</span>
              <pre
                aria-label={copy.exemplo.titulo}
                className="val m-0 overflow-x-auto rounded-controle border border-borda-suave bg-superficie-funda px-3.5 py-3 text-[12.5px] text-texto-principal"
              >
                {copy.exemplo.codigo(entrada.endereco)}
              </pre>
              <p className="m-0 text-[12.5px] text-texto-apoio">{copy.exemplo.resposta}</p>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <span className="rotulo-de-indicador">{copy.ondeColar.titulo}</span>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
              {copy.ondeColar.itens.map((item) => (
                <li key={item.nome}>
                  <strong className="text-texto-principal">{item.nome}.</strong>{' '}
                  <span className="text-texto-apoio">{item.como}</span>
                </li>
              ))}
            </ul>
            <p className="m-0 text-[12.5px] text-texto-apoio">{copy.ondeColar.depois}</p>
          </div>
        </div>
      )}

      {confirmando ? (
        <Dialogo
          titulo={copy.chave.confirmar.titulo}
          explicacao={copy.chave.confirmar.explicacao}
          confirmar={copy.chave.confirmar.acao}
          cancelar={copy.chave.confirmar.cancelar}
          tom="perigo"
          ocupado={gerando}
          aoConfirmar={() => void gerar()}
          aoCancelar={() => definirConfirmando(false)}
        />
      ) : null}
    </Painel>
  )
}

/** Um valor em `.val` com o botão de copiar ao lado, e a resposta da cópia. */
function TextoCopiavel({ rotulo, texto }: { rotulo: string; texto: string }) {
  const [copiou, definirCopiou] = useState<boolean | null>(null)
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <code aria-label={rotulo} className="val break-all text-[13px] text-texto-principal">
        {texto}
      </code>
      <button
        type="button"
        className="botao-fantasma"
        onClick={() => void copiarTexto(texto).then(definirCopiou)}
      >
        {copy.copiar}
      </button>
      {copiou === null ? null : (
        <span role="status" className="text-[12.5px] text-texto-apoio">
          {copiou ? copy.copiado : copy.semCopia}
        </span>
      )}
    </div>
  )
}

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTextoLongo } from '@/componentes/campo-de-texto-longo'
import { Carregando } from '@/componentes/carregando'
import { Dialogo } from '@/componentes/dialogo'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { NegativaPorPapel } from '@/componentes/negativa-por-papel'
import { NumerosDeTeste } from '@/componentes/numeros-de-teste'
import { Painel } from '@/componentes/painel'
import { configConta } from '@/copy/config-conta'
import type { Membro } from '@/equipe/tipos'
import { useServicoDeWhatsapp } from '@/whatsapp/contexto'
import type { CanalDoWhatsapp, CargaDoCanal, ModoDoWhatsapp, MotivoDeFalhaDoWhatsapp } from '@/whatsapp/tipos'

const copy = configConta.whatsapp
const CHAVE_DO_CANAL = ['whatsapp-canal'] as const

/**
 * O canal de WhatsApp em /config/conta: ligar/desligar (RF do canal), quem a
 * assistente atende (o modo de teste, `_shared/whatsapp/modo.ts`), o
 * pré-contato antes da ligação de voz e o texto dele.
 *
 * O modo nasce `teste`. Passar para `todos` pede confirmação, porque a
 * instância costuma ser um número em uso e ela passaria a responder qualquer
 * um. No modo de teste a lista de números de teste aparece aqui mesmo, a mesma
 * de /config/discagem (`NumerosDeTeste`), fora do formulário porque tem o
 * próprio.
 *
 * Grava por `update` em `account_settings`, como os limiares da fila e o roteamento do
 * especialista — mesma política (`account_settings_alteracao_de_admin`), sem
 * RPC de motivo porque o servidor não exige um para este campo.
 *
 * Os quatro estados: carregando, falha, conta sem linha de configuração e o
 * formulário. Quem não administra vê os valores e a negativa, sem campo.
 */
export function CanalDoWhatsappNaConta({
  podeAjustar,
  administradores,
}: {
  podeAjustar: boolean
  administradores: readonly Membro[]
}) {
  const servico = useServicoDeWhatsapp()
  const consulta = useQuery({ queryKey: CHAVE_DO_CANAL, queryFn: () => servico.carregarCanal() })

  let conteudo
  if (consulta.isPending) {
    conteudo = <Carregando texto={copy.carregando} />
  } else if (!consulta.data?.ok) {
    conteudo = <CaixaDeErro>{copy.falhas[consulta.data?.motivo ?? 'falha-de-comunicacao']}</CaixaDeErro>
  } else if (!consulta.data.canal) {
    conteudo = <EstadoVazio titulo={copy.vazio.titulo} explicacao={copy.vazio.explicacao} />
  } else if (!podeAjustar) {
    conteudo = <EmLeitura canal={consulta.data.canal} administradores={administradores} />
  } else {
    conteudo = <Formulario gravado={consulta.data.canal} />
  }

  return (
    <Painel rotulo={copy.rotulo} sobretitulo={copy.sobretitulo} titulo={copy.titulo} apoio={copy.apoio}>
      {conteudo}
    </Painel>
  )
}

function EmLeitura({
  canal,
  administradores,
}: {
  canal: CanalDoWhatsapp
  administradores: readonly Membro[]
}) {
  return (
    <div className="flex flex-col gap-3">
      <NegativaPorPapel aviso={copy.negativa} administradores={administradores} />
      <dl className="m-0 grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <div>
          <dt className="rotulo-de-indicador">{copy.campos.habilitado.rotulo}</dt>
          <dd className="m-0 font-semibold text-texto-principal">
            {canal.habilitado ? 'Ligado' : 'Desligado'}
          </dd>
        </div>
        <div>
          <dt className="rotulo-de-indicador">{copy.modo.rotulo}</dt>
          <dd className="m-0 font-semibold text-texto-principal">{copy.modo.emLeitura[canal.modo]}</dd>
        </div>
        <div>
          <dt className="rotulo-de-indicador">{copy.campos.preContato.rotulo}</dt>
          <dd className="m-0 font-semibold text-texto-principal">
            {canal.preContato ? 'Ligado' : 'Desligado'}
          </dd>
        </div>
      </dl>
    </div>
  )
}

type Aviso = { tom: 'sucesso' } | { tom: 'falha'; motivo: MotivoDeFalhaDoWhatsapp }

function canalMudou(gravado: CanalDoWhatsapp, rascunho: CanalDoWhatsapp): boolean {
  return (
    gravado.habilitado !== rascunho.habilitado ||
    gravado.modo !== rascunho.modo ||
    gravado.preContato !== rascunho.preContato ||
    (gravado.textoDoPreContato ?? '') !== (rascunho.textoDoPreContato ?? '')
  )
}

function Formulario({ gravado }: { gravado: CanalDoWhatsapp }) {
  const servico = useServicoDeWhatsapp()
  const cliente = useQueryClient()
  const [rascunho, definirRascunho] = useState<CanalDoWhatsapp>(gravado)
  const [salvando, definirSalvando] = useState(false)
  const [aviso, definirAviso] = useState<Aviso | null>(null)
  const [confirmandoTodos, definirConfirmandoTodos] = useState(false)

  const mudou = canalMudou(gravado, rascunho)

  function mudar(parte: Partial<CanalDoWhatsapp>) {
    definirRascunho((atual) => ({ ...atual, ...parte }))
    definirAviso(null)
  }

  function escolherModo(modo: ModoDoWhatsapp) {
    if (modo === rascunho.modo) return
    // Sair do teste é o passo que pode responder a quem não devia: confirma.
    if (modo === 'todos') definirConfirmandoTodos(true)
    else mudar({ modo })
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    if (!mudou) return
    definirSalvando(true)
    const resultado = await servico.definirCanal({
      ...rascunho,
      textoDoPreContato: rascunho.textoDoPreContato?.trim() || null,
    })
    definirSalvando(false)
    if (!resultado.ok) {
      definirAviso({ tom: 'falha', motivo: resultado.motivo })
      return
    }
    const relida: CargaDoCanal = { ok: true, canal: resultado.canal }
    cliente.setQueryData(CHAVE_DO_CANAL, relida)
    definirRascunho(resultado.canal)
    definirAviso({ tom: 'sucesso' })
  }

  return (
    <div className="flex flex-col gap-5">
      <form noValidate onSubmit={(evento) => void salvar(evento)} className="flex flex-col gap-4">
        <label className="bloco-secundario flex items-start gap-3 py-2.5">
          <input
            type="checkbox"
            className="mt-1"
            checked={rascunho.habilitado}
            onChange={(evento) => mudar({ habilitado: evento.target.checked })}
          />
          <span>
            <span className="block text-[13.5px] font-semibold text-texto-principal">
              {copy.campos.habilitado.rotulo}
            </span>
            <span className="block text-[12.5px] text-texto-apoio">{copy.campos.habilitado.dispara}</span>
          </span>
        </label>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[13.5px] font-semibold text-texto-principal">
            {copy.modo.rotulo}
          </legend>
          {(['teste', 'todos'] as const).map((modo) => (
            <label key={modo} className="bloco-secundario flex items-start gap-3 py-2.5">
              <input
                type="radio"
                name="modoDoWhatsapp"
                className="mt-1"
                checked={rascunho.modo === modo}
                onChange={() => escolherModo(modo)}
              />
              <span>
                <span className="block text-[13.5px] font-semibold text-texto-principal">
                  {copy.modo.opcoes[modo].rotulo}
                </span>
                <span className="block text-[12.5px] text-texto-apoio">{copy.modo.opcoes[modo].dispara}</span>
              </span>
            </label>
          ))}
          {rascunho.modo === 'teste' ? (
            <p className="m-0 text-[12.5px] text-texto-apoio">{copy.modo.ondeCadastrar}</p>
          ) : null}
        </fieldset>

        <label className="bloco-secundario flex items-start gap-3 py-2.5">
          <input
            type="checkbox"
            className="mt-1"
            checked={rascunho.preContato}
            onChange={(evento) => mudar({ preContato: evento.target.checked })}
          />
          <span>
            <span className="block text-[13.5px] font-semibold text-texto-principal">
              {copy.campos.preContato.rotulo}
            </span>
            <span className="block text-[12.5px] text-texto-apoio">{copy.campos.preContato.dispara}</span>
          </span>
        </label>

        {rascunho.preContato ? (
          <CampoDeTextoLongo
            rotulo={copy.textoDoPreContato.rotulo}
            exemplo={copy.textoDoPreContato.exemplo}
            apoio={copy.textoDoPreContato.apoio}
            rows={2}
            value={rascunho.textoDoPreContato ?? ''}
            onChange={(evento) => mudar({ textoDoPreContato: evento.target.value })}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="botao-primario" disabled={!mudou || salvando}>
            {salvando ? copy.salvando : copy.salvar}
          </button>
          {!mudou && !aviso ? <p className="m-0 text-[12.5px] text-texto-apoio">{copy.semMudanca}</p> : null}
        </div>

        {aviso?.tom === 'falha' ? <CaixaDeErro>{copy.falhasAoSalvar[aviso.motivo]}</CaixaDeErro> : null}
        {aviso?.tom === 'sucesso' ? (
          <p role="status" className="m-0 text-[13px] text-positivo">
            {copy.salvo}
          </p>
        ) : null}
      </form>

      {rascunho.modo === 'teste' ? <NumerosDeTeste podeEditar /> : null}

      {confirmandoTodos ? (
        <Dialogo
          titulo={copy.modo.confirmacao.titulo}
          explicacao={copy.modo.confirmacao.explicacao}
          confirmar={copy.modo.confirmacao.confirmar}
          cancelar={copy.modo.confirmacao.cancelar}
          tom="perigo"
          aoConfirmar={() => {
            definirConfirmandoTodos(false)
            mudar({ modo: 'todos' })
          }}
          aoCancelar={() => definirConfirmandoTodos(false)}
        />
      ) : null}
    </div>
  )
}

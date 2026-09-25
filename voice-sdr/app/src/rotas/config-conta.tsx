import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useId, useState } from 'react'

import { PALAVRA_DE_CONFIRMACAO } from '@reset/respostas.ts'

import { useAutenticacao } from '@/autenticacao/contexto'
import { AreaDeTrabalho } from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { Carregando } from '@/componentes/carregando'
import { Dialogo } from '@/componentes/dialogo'
import { Painel } from '@/componentes/painel'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { ProjetoNaConta } from '@/conexao/projeto-na-conta'
import { useServicoDaConta } from '@/conta/contexto'
import { CanalDoWhatsappNaConta } from '@/conta/canal-do-whatsapp'
import { LimiaresDaFilaNaConta } from '@/conta/limiares-da-fila'
import {
  especialistasEscolhiveis,
  MODOS_DE_ROTEAMENTO,
  normalizarRoteamento,
  roteamentoMudou,
  validarRoteamento,
} from '@/conta/roteamento'
import type {
  EspecialistaDoRoteamento,
  MotivoDeFalhaDoRoteamento,
  RoteamentoDaConta,
} from '@/conta/tipos'
import { conta as copy } from '@/copy/conta'
import { useServicoDeEquipe } from '@/equipe/contexto'
import {
  podeAjustarCanalDoWhatsapp,
  podeAjustarLimiaresDaFila,
  podeDefinirRoteamento,
  quemConcedeAcesso,
} from '@/equipe/papeis'
import type { Membro } from '@/equipe/tipos'
import { areasCadastradas } from '@/especialistas/regras'

// O papel vem da mesma carga (e da mesma chave) da tela de equipe.
const CHAVE_DA_EQUIPE = ['equipe'] as const
const CHAVE_DO_ROTEAMENTO = ['roteamento-da-conta'] as const

/**
 * /config/conta: os limiares da fila (US-150), o modo de roteamento do
 * especialista (US-178) e a zona de perigo, zerar o ambiente de teste.
 *
 * No zerar, a tela só evita oferecer o que não vale; quem decide é a borda
 * `environment-reset`: dono, a instalação com o reset ligado e a confirmação
 * escrita. Numa instalação com o reset desligado, a recusa dela aparece aqui.
 */
export function TelaDaConta() {
  const equipe = useServicoDeEquipe()
  const carga = useQuery({ queryKey: CHAVE_DA_EQUIPE, queryFn: () => equipe.carregar() })

  return (
    <AreaDeTrabalho titulo={copy.titulo} lead={copy.explicacao}>
      {carga.isPending ? (
        <Carregando texto={copy.carregando} />
      ) : !carga.data?.ok ? (
        <CaixaDeErro>{copy.falha}</CaixaDeErro>
      ) : (
        <div className="flex flex-col gap-6">
          <LimiaresDaFilaNaConta
            podeAjustar={podeAjustarLimiaresDaFila(carga.data.equipe.papelDoUsuario)}
            administradores={quemConcedeAcesso(carga.data.equipe.membros)}
          />
          <CanalDoWhatsappNaConta
            podeAjustar={podeAjustarCanalDoWhatsapp(carga.data.equipe.papelDoUsuario)}
            administradores={quemConcedeAcesso(carga.data.equipe.membros)}
          />
          <Roteamento
            podeEditar={podeDefinirRoteamento(carga.data.equipe.papelDoUsuario)}
            membros={carga.data.equipe.membros}
          />
          <ProjetoNaConta />
          <ZerarAmbiente dono={carga.data.equipe.papelDoUsuario === 'owner'} />
        </div>
      )}
    </AreaDeTrabalho>
  )
}

/** Os quatro estados: carregando, falha, vazio e o formulário. */
function Roteamento({ podeEditar, membros }: { podeEditar: boolean; membros: readonly Membro[] }) {
  const servico = useServicoDaConta()
  const consulta = useQuery({
    queryKey: CHAVE_DO_ROTEAMENTO,
    queryFn: () => servico.carregarRoteamento(),
  })

  let conteudo
  if (consulta.isPending) {
    conteudo = <Carregando texto={copy.roteamento.carregando} />
  } else if (!consulta.data?.ok) {
    conteudo = (
      <CaixaDeErro>{copy.roteamento.falhas[consulta.data?.motivo ?? 'falha-de-comunicacao']}</CaixaDeErro>
    )
  } else if (!consulta.data.roteamento) {
    conteudo = (
      <EstadoVazio titulo={copy.roteamento.vazio.titulo} explicacao={copy.roteamento.vazio.explicacao} />
    )
  } else {
    conteudo = (
      <FormularioDeRoteamento
        gravado={consulta.data.roteamento}
        especialistas={consulta.data.especialistas}
        podeEditar={podeEditar}
        membros={membros}
        aoGravar={async () => {
          await consulta.refetch()
        }}
      />
    )
  }

  return (
    <Painel
      rotulo={copy.roteamento.rotulo}
      sobretitulo={copy.roteamento.rotulo}
      titulo={copy.roteamento.titulo}
      apoio={copy.roteamento.apoio}
    >
      {conteudo}
    </Painel>
  )
}

function FormularioDeRoteamento({
  gravado,
  especialistas,
  podeEditar,
  membros,
  aoGravar,
}: {
  gravado: RoteamentoDaConta
  especialistas: readonly EspecialistaDoRoteamento[]
  podeEditar: boolean
  membros: readonly Membro[]
  aoGravar: () => Promise<void>
}) {
  const servico = useServicoDaConta()
  const idDoGrupo = useId()
  const [rascunho, definirRascunho] = useState<RoteamentoDaConta>(gravado)
  const [salvando, definirSalvando] = useState(false)
  const [recusa, definirRecusa] = useState<MotivoDeFalhaDoRoteamento | null>(null)
  const [salvo, definirSalvo] = useState(false)

  const escolhiveis = especialistasEscolhiveis(especialistas)
  // O destino gravado continua na lista mesmo inativo: sumir com ele faria o
  // campo mostrar outra pessoa do que o banco guarda.
  const destinoGravado =
    gravado.especialistaFixoId && !escolhiveis.some((item) => item.id === gravado.especialistaFixoId)
      ? especialistas.find((item) => item.id === gravado.especialistaFixoId)
      : undefined
  const mudou = roteamentoMudou(gravado, rascunho)

  function mudar(parte: Partial<RoteamentoDaConta>) {
    definirRascunho((anterior) => ({ ...anterior, ...parte }))
    definirRecusa(null)
    definirSalvo(false)
  }

  async function salvar() {
    const recusaDaTela = validarRoteamento(gravado, rascunho, especialistas)
    if (recusaDaTela) {
      definirRecusa(recusaDaTela)
      return
    }
    definirSalvando(true)
    const resultado = await servico.definirRoteamento(normalizarRoteamento(rascunho))
    definirSalvando(false)
    if (!resultado.ok) {
      definirRecusa(resultado.motivo)
      return
    }
    // O rascunho passa a ser o que o banco devolveu, e o botão volta a
    // desligar quando a recarga trouxer o mesmo valor como gravado.
    definirRascunho(resultado.roteamento)
    definirSalvo(true)
    await aoGravar()
  }

  const administradores = podeEditar ? [] : quemConcedeAcesso(membros)

  return (
    <div className="flex flex-col gap-4">
      {!podeEditar ? (
        <CaixaDeErro tom="atencao">
          <p className="m-0 font-medium">{copy.roteamento.leitura.aviso}</p>
          {administradores.length ? (
            <>
              <p className="mt-3 mb-1.5">{copy.roteamento.leitura.pedirAcesso}</p>
              <ul
                aria-label={copy.roteamento.leitura.pedirAcesso}
                className="m-0 flex list-none flex-col gap-1 p-0"
              >
                {administradores.map((membro) => (
                  <li key={membro.usuarioId}>
                    {membro.nome} <span className="val text-[12.5px]">{membro.email}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-3 mb-0">{copy.roteamento.leitura.semAdministrador}</p>
          )}
        </CaixaDeErro>
      ) : null}

      <fieldset disabled={!podeEditar} className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-[13px] font-semibold">{copy.roteamento.legenda}</legend>
        {MODOS_DE_ROTEAMENTO.map((modo) => {
          const texto = copy.roteamento.modos[modo]
          const id = `${idDoGrupo}-${modo}`
          return (
            <div
              key={modo}
              className="bloco-secundario flex gap-3 py-2.5 transition-colors duration-150 has-checked:border-acento/60 has-checked:bg-acento-repouso"
            >
              <input
                type="radio"
                id={id}
                name={`${idDoGrupo}-modo`}
                value={modo}
                checked={rascunho.modo === modo}
                aria-describedby={`${id}-efeito`}
                onChange={() => mudar({ modo })}
                className="mt-1"
              />
              <div className="min-w-0">
                <label htmlFor={id} className="cursor-pointer text-[13.5px] font-semibold text-texto-principal">
                  {texto.rotulo}
                </label>
                <p id={`${id}-efeito`} className="m-0 text-[12.5px] text-texto-apoio">
                  {texto.efeito}
                </p>
              </div>
            </div>
          )
        })}

        {rascunho.modo === 'area' ? <AreasDoRoteamento areas={areasCadastradas(especialistas)} /> : null}

        {rascunho.modo === 'fixed' ? (
          escolhiveis.length === 0 && !destinoGravado ? (
            <p className="m-0 mt-2 text-[13px] text-texto-apoio">{copy.roteamento.semAtivos}</p>
          ) : (
            <label className="mt-2 flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-texto-secundario">
                {copy.roteamento.especialista}
              </span>
              <select
                value={rascunho.especialistaFixoId ?? ''}
                onChange={(evento) => mudar({ especialistaFixoId: evento.target.value || null })}
                className="campo w-auto self-start py-2 text-[13.5px] disabled:text-texto-apoio"
              >
                <option value="">{copy.roteamento.escolha}</option>
                {destinoGravado ? (
                  <option value={destinoGravado.id}>{copy.roteamento.inativo(destinoGravado.nome)}</option>
                ) : null}
                {escolhiveis.map((especialista) => (
                  <option key={especialista.id} value={especialista.id}>
                    {especialista.area ? `${especialista.nome} · ${especialista.area}` : especialista.nome}
                  </option>
                ))}
              </select>
            </label>
          )
        ) : null}
      </fieldset>

      {podeEditar ? (
        <>
          <p className="m-0 text-[12.5px] text-texto-apoio">{copy.roteamento.alcance}</p>
          {recusa ? <CaixaDeErro>{copy.roteamento.falhas[recusa]}</CaixaDeErro> : null}
          {salvo ? (
            <p role="status" className="m-0 text-[13px] font-semibold text-positivo">
              {copy.roteamento.salvo}
            </p>
          ) : null}
          <div>
            <button
              type="button"
              className="botao-primario"
              disabled={!mudou || salvando}
              onClick={() => void salvar()}
            >
              {salvando ? copy.roteamento.salvando : copy.roteamento.salvar}
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}

/** O que o modo por área consegue casar, dito antes de salvar (D-16). */
function AreasDoRoteamento({ areas }: { areas: readonly string[] }) {
  if (areas.length === 0) {
    return <p className="m-0 mt-2 text-[13px] text-texto-apoio">{copy.roteamento.areas.nenhuma}</p>
  }
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <p className="m-0 text-[13px] font-semibold text-texto-secundario">{copy.roteamento.areas.titulo}</p>
      <ul aria-label={copy.roteamento.areas.titulo} className="m-0 flex list-none flex-wrap gap-2 p-0">
        {areas.map((area) => (
          <li key={area} className="selo selo-neutro">
            {area}
          </li>
        ))}
      </ul>
      <p className="m-0 text-[12.5px] text-texto-apoio">{copy.roteamento.areas.apoio}</p>
    </div>
  )
}

function ZerarAmbiente({ dono }: { dono: boolean }) {
  const servico = useServicoDaConta()
  const { servico: autenticacao } = useAutenticacao()
  const navegar = useNavigate()
  const [confirmacao, definirConfirmacao] = useState('')
  const [perguntando, definirPerguntando] = useState(false)
  const [zerando, definirZerando] = useState(false)
  const [erro, definirErro] = useState<string | null>(null)

  const confirmado = confirmacao === PALAVRA_DE_CONFIRMACAO

  async function zerar() {
    definirZerando(true)
    definirErro(null)
    const resultado = await servico.zerarAmbiente(confirmacao)
    if (!resultado.ok) {
      definirZerando(false)
      definirPerguntando(false)
      definirErro(resultado.mensagem ?? copy.zerar.falhou)
      return
    }
    // O usuário da sessão acabou de ser apagado: sair e ir para a entrada,
    // onde a instalação virgem abre a fundação.
    await autenticacao.sair()
    await navegar({ href: '/entrar' })
  }

  return (
    <Painel rotulo={copy.zerar.rotulo} sobretitulo={copy.zerar.rotulo} titulo={copy.zerar.titulo} apoio={copy.zerar.apoio}>
      {!dono ? (
        <p role="alert" className="m-0 text-[13.5px] text-texto-apoio">
          {copy.zerar.soODono}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            <div className="rounded-controle border border-perigo/40 bg-perigo-fundo px-4 py-3">
              <p className="sobretitulo m-0 mb-1.5">{copy.zerar.apaga}</p>
              <ul className="m-0 flex flex-col gap-1 pl-4 text-[13px] text-texto-secundario">
                {copy.zerar.itensQueSaem.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-controle border border-borda-suave bg-superficie-funda px-4 py-3">
              <p className="sobretitulo m-0 mb-1.5">{copy.zerar.mantem}</p>
              <ul className="m-0 flex flex-col gap-1 pl-4 text-[13px] text-texto-secundario">
                {copy.zerar.itensQueFicam.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <p className="m-0 text-[13px] font-semibold text-perigo">{copy.zerar.semVolta}</p>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <CampoDeTexto
                rotulo={copy.zerar.confirmacao.rotulo}
                placeholder={copy.zerar.confirmacao.exemplo}
                autoComplete="off"
                value={confirmacao}
                onChange={(evento) => definirConfirmacao(evento.target.value)}
              />
            </div>
            <button
              type="button"
              disabled={!confirmado || zerando}
              onClick={() => definirPerguntando(true)}
              className="botao-perigo"
            >
              {zerando ? copy.zerar.acaoEmCurso : copy.zerar.acao}
            </button>
          </div>

          {erro ? <CaixaDeErro>{erro}</CaixaDeErro> : null}
        </div>
      )}

      {perguntando ? (
        <Dialogo
          titulo={copy.zerar.dialogo.titulo}
          explicacao={copy.zerar.dialogo.explicacao}
          cancelar={copy.zerar.dialogo.cancelar}
          confirmar={copy.zerar.dialogo.confirmar}
          tom="perigo"
          ocupado={zerando}
          aoCancelar={() => definirPerguntando(false)}
          aoConfirmar={() => void zerar()}
        />
      ) : null}
    </Painel>
  )
}

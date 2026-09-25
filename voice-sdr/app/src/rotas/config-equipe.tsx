import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'

import { useAutenticacao } from '@/autenticacao/contexto'
import {
  AreaDeTrabalho,
  type PropsDeTelaEmbutivel,
} from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { Painel } from '@/componentes/painel'
import { Secao } from '@/componentes/secao'
import { equipe as copy, PAPEL_EM_PORTUGUES } from '@/copy/equipe'
import { useServicoDeEquipe } from '@/equipe/contexto'
import {
  PAPEIS,
  podeAdministrarEquipe,
  podeAtribuir,
  quemConcedeAcesso,
} from '@/equipe/papeis'
import type {
  AcaoDaEquipe,
  Membro,
  MotivoDeFalhaDaEquipe,
  Papel,
} from '@/equipe/tipos'
import { copiarTexto } from '@/utilidades/area-de-transferencia'
import { formatarData, formatarInstante } from '@/utilidades/datas'

const CHAVE = ['equipe'] as const

export function TelaDeEquipe({
  dentroDoAssistente = false,
}: PropsDeTelaEmbutivel) {
  const servico = useServicoDeEquipe()
  const { sessao } = useAutenticacao()

  const consulta = useQuery({
    queryKey: CHAVE,
    queryFn: () => servico.carregar(),
  })

  const [falha, definirFalha] = useState<MotivoDeFalhaDaEquipe>()
  const [email, definirEmail] = useState('')
  const [papelDoConvite, definirPapelDoConvite] = useState<Papel>('operator')
  const [erroDeEmail, definirErroDeEmail] = useState<string>()
  const [convidando, definirConvidando] = useState(false)
  const [link, definirLink] = useState<string>()
  const [copiado, definirCopiado] = useState(false)

  const carga = consulta.data
  const podeAdministrar = carga?.ok
    ? podeAdministrarEquipe(carga.equipe.papelDoUsuario)
    : false

  /** Toda ação de escrita segue o mesmo rito: guarda a falha ou recarrega. */
  async function aplicar(acao: Promise<AcaoDaEquipe>) {
    const resultado = await acao
    if (!resultado.ok) {
      definirFalha(resultado.motivo)
      return
    }
    definirFalha(undefined)
    await consulta.refetch()
  }

  async function convidar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    const informado = email.trim()
    definirErroDeEmail(informado ? undefined : copy.convite.emailObrigatorio)
    if (!informado) return

    definirConvidando(true)
    definirFalha(undefined)
    definirLink(undefined)
    const resultado = await servico.convidar({
      email: informado,
      papel: papelDoConvite,
    })
    definirConvidando(false)

    if (!resultado.ok) {
      definirFalha(resultado.motivo)
      return
    }

    definirEmail('')
    definirLink(resultado.link)
    definirCopiado(await copiarTexto(resultado.link))
    await consulta.refetch()
  }

  if (consulta.isPending) {
    return (
      <Moldura embutida={dentroDoAssistente}>
        <Carregando texto={copy.carregando} />
      </Moldura>
    )
  }

  if (!carga?.ok) {
    return (
      <Moldura embutida={dentroDoAssistente}>
        <CaixaDeErro>
          {copy.falhas[carga?.motivo ?? 'falha-de-comunicacao']}
        </CaixaDeErro>
      </Moldura>
    )
  }

  const { membros, convites, papelDoUsuario } = carga.equipe
  const administradores = quemConcedeAcesso(membros)

  return (
    <Moldura embutida={dentroDoAssistente}>
      {podeAdministrar ? null : (
        <div className="bloco-secundario mb-6 text-[13.5px]">
          <p className="m-0 font-medium text-texto-secundario">
            {copy.leitura.aviso}
          </p>
          {administradores.length ? (
            <>
              <p className="mt-2.5 mb-1.5 text-texto-apoio">
                {copy.leitura.pedirAcesso}
              </p>
              <ul
                aria-label={copy.leitura.pedirAcesso}
                className="m-0 flex list-none flex-col gap-1 p-0"
              >
                {administradores.map((membro) => (
                  <li key={membro.usuarioId} className="text-texto-secundario">
                    {membro.nome}{' '}
                    <span className="val text-[12.5px] text-texto-apoio">
                      {membro.email}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2.5 mb-0 text-texto-apoio">
              {copy.leitura.semAdministrador}
            </p>
          )}
        </div>
      )}

      <div className="mb-7">
        <Painel titulo={copy.convite.titulo} apoio={copy.convite.explicacao}>
          <form onSubmit={convidar} noValidate className="flex flex-col gap-4">
            <CampoDeTexto
              rotulo={copy.convite.email.rotulo}
              exemplo={copy.convite.email.exemplo}
              type="email"
              name="email"
              autoComplete="off"
              value={email}
              erro={erroDeEmail}
              disabled={!podeAdministrar}
              onChange={(evento) => definirEmail(evento.target.value)}
            />

            <SeletorDePapel
              rotulo={copy.convite.papel}
              valor={papelDoConvite}
              papelDeQuemAge={papelDoUsuario}
              desabilitado={!podeAdministrar}
              aoTrocar={definirPapelDoConvite}
            />

            <button
              type="submit"
              disabled={!podeAdministrar || convidando}
              className="botao-primario mt-1 self-start"
            >
              {convidando ? copy.convite.acaoEmCurso : copy.convite.acao}
            </button>
          </form>

          {link ? (
            <div className="mt-4 rounded-controle border border-positivo-borda bg-positivo-fundo px-3.5 py-3">
              <p
                role="status"
                className={`m-0 text-[13px] font-semibold ${
                  copiado ? 'text-positivo' : 'text-texto-secundario'
                }`}
              >
                {copiado ? copy.convite.linkPronto : copy.convite.linkNaoCopiado}
              </p>
              <p
                aria-label={copy.convite.rotuloDoLink}
                className="val mt-2 mb-0 break-all rounded-pequeno border border-borda-suave bg-superficie-funda px-2.5 py-1.5 text-[12.5px] text-texto-secundario"
              >
                {link}
              </p>
              <button
                type="button"
                onClick={() => {
                  void copiarTexto(link).then(definirCopiado)
                }}
                className="botao-link mt-2"
              >
                {copy.convite.copiar}
              </button>
            </div>
          ) : null}
        </Painel>
      </div>

      {falha ? (
        <div className="mb-6">
          <CaixaDeErro>{copy.falhas[falha]}</CaixaDeErro>
        </div>
      ) : null}

      <Secao titulo={copy.membros.titulo}>
        <table className="tabela">
          <thead>
            <tr>
              <th>{copy.membros.colunas.pessoa}</th>
              <th>{copy.membros.colunas.papel}</th>
              <th>{copy.membros.colunas.ultimoAcesso}</th>
              <th>{copy.membros.colunas.acoes}</th>
            </tr>
          </thead>
          <tbody>
            {membros.map((membro) => (
              <LinhaDeMembro
                key={membro.usuarioId}
                membro={membro}
                ehVoce={membro.usuarioId === sessao?.usuarioId}
                papelDoUsuario={papelDoUsuario}
                podeAdministrar={podeAdministrar}
                aoTrocarPapel={(papel) => {
                  void aplicar(servico.trocarPapel(membro.usuarioId, papel))
                }}
                aoRemover={() => {
                  void aplicar(servico.remover(membro.usuarioId))
                }}
              />
            ))}
          </tbody>
        </table>
      </Secao>

      <Secao titulo={copy.pendentes.titulo}>
        {convites.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {convites.map((pendente) => (
              <li
                key={pendente.id}
                className="cartao flex flex-wrap items-baseline gap-3 px-4 py-3 text-[13.5px]"
              >
                <span className="val">{pendente.email}</span>
                <span className="text-texto-secundario">
                  {PAPEL_EM_PORTUGUES[pendente.papel]}
                </span>
                <span className="text-[12.5px] text-texto-apoio">
                  {copy.pendentes.expiraEm}{' '}
                  <span className="val">{formatarData(pendente.expiraEm)}</span>
                </span>
                <button
                  type="button"
                  disabled={!podeAdministrar}
                  onClick={() => {
                    void aplicar(servico.revogarConvite(pendente.id))
                  }}
                  className="botao-link ml-auto text-perigo"
                >
                  {copy.pendentes.revogar}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EstadoVazio
            titulo={copy.pendentes.vazio.titulo}
            explicacao={copy.pendentes.vazio.explicacao}
          />
        )}
      </Secao>
    </Moldura>
  )
}

function Moldura({
  embutida,
  children,
}: {
  embutida: boolean
  children: ReactNode
}) {
  return (
    <AreaDeTrabalho titulo={copy.titulo} lead={copy.explicacao} embutida={embutida}>
      {children}
    </AreaDeTrabalho>
  )
}

type LinhaDeMembroProps = {
  membro: Membro
  ehVoce: boolean
  papelDoUsuario: Papel
  podeAdministrar: boolean
  aoTrocarPapel: (papel: Papel) => void
  aoRemover: () => void
}

function LinhaDeMembro({
  membro,
  ehVoce,
  papelDoUsuario,
  podeAdministrar,
  aoTrocarPapel,
  aoRemover,
}: LinhaDeMembroProps) {
  // Ninguém muda nem remove a própria linha: rebaixar-se por engano tira o
  // acesso de quem administra, e não há quem desfaça.
  const editavel = podeAdministrar && !ehVoce

  return (
    <tr>
      <td>
        <span className="font-medium text-texto-principal">{membro.nome}</span>
        {ehVoce ? (
          <span className="ml-1.5 text-[11.5px] font-semibold text-menta-2">
            ({copy.membros.voce})
          </span>
        ) : null}
        <br />
        <span className="val text-[12.5px] text-texto-apoio">
          {membro.email}
        </span>
      </td>
      <td>
        <SeletorDePapel
          rotulo={`${copy.membros.colunas.papel}: ${membro.nome}`}
          rotuloOculto
          valor={membro.papel}
          papelDeQuemAge={papelDoUsuario}
          desabilitado={!editavel}
          aoTrocar={aoTrocarPapel}
        />
      </td>
      <td className="val text-[12.5px] text-texto-apoio">
        {membro.ultimoAcesso
          ? formatarInstante(membro.ultimoAcesso)
          : copy.membros.nuncaAcessou}
      </td>
      <td>
        <button
          type="button"
          disabled={!editavel}
          onClick={aoRemover}
          className="botao-link text-perigo"
        >
          {copy.membros.remover}
        </button>
      </td>
    </tr>
  )
}

type SeletorDePapelProps = {
  rotulo: string
  rotuloOculto?: boolean
  valor: Papel
  /** Papel de quem mexe no seletor: é ele que libera a opção de dono. */
  papelDeQuemAge: Papel
  desabilitado: boolean
  aoTrocar: (papel: Papel) => void
}

function SeletorDePapel({
  rotulo,
  rotuloOculto,
  valor,
  papelDeQuemAge,
  desabilitado,
  aoTrocar,
}: SeletorDePapelProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span
        className={
          rotuloOculto ? 'sr-only' : 'text-[13px] font-semibold text-texto-secundario'
        }
      >
        {rotulo}
      </span>
      <select
        value={valor}
        disabled={desabilitado}
        aria-label={rotulo}
        onChange={(evento) => aoTrocar(evento.target.value as Papel)}
        className="campo w-auto self-start py-2 text-[13.5px] disabled:text-texto-apoio"
      >
        {PAPEIS.map((papel) => (
          <option
            key={papel}
            value={papel}
            disabled={papel !== valor && !podeAtribuir(papelDeQuemAge, papel)}
          >
            {PAPEL_EM_PORTUGUES[papel]}
          </option>
        ))}
      </select>
    </label>
  )
}

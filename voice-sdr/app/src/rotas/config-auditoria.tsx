import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { ACOES, PERIODOS, paraAcao, paraPeriodo, temFiltro } from '@/auditoria/consulta'
import { useServicoDeAuditoria } from '@/auditoria/contexto'
import {
  AUTOR_SISTEMA,
  type ConsultaDeAuditoria,
  type OpcaoDeAutor,
  type RegistroDeAuditoria,
} from '@/auditoria/tipos'
import { AreaDeTrabalho } from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { Selo, type TomDoSelo } from '@/componentes/selo'
import { Seletor } from '@/componentes/seletor'
import {
  ACAO_EM_PORTUGUES,
  ALVO_EM_PORTUGUES,
  AUTOR_SEM_PESSOA,
  auditoria as copy,
} from '@/copy/auditoria'
import { formatarInstante } from '@/utilidades/datas'

const SEM_RECORTE: ConsultaDeAuditoria = { periodo: 'tudo' }

/** O tom de cada ação na trilha: criar é positivo, alterar informa, remover é perigo. */
const TOM_DA_ACAO: Record<RegistroDeAuditoria['acao'], TomDoSelo> = {
  insert: 'positivo',
  update: 'informacao',
  delete: 'perigo',
}

/** O filtro faz parte da chave: mudar o recorte é buscar outra coisa. */
function chave(consulta: ConsultaDeAuditoria) {
  return [
    'auditoria',
    consulta.autor ?? '',
    consulta.acao ?? '',
    consulta.periodo ?? 'tudo',
  ] as const
}

export function TelaDeAuditoria() {
  const servico = useServicoDeAuditoria()
  const [consulta, definirConsulta] = useState<ConsultaDeAuditoria>(SEM_RECORTE)

  const busca = useQuery({
    queryKey: chave(consulta),
    queryFn: () => servico.consultar(consulta),
  })

  const carga = busca.data

  return (
    <Moldura>
      <Filtros
        consulta={consulta}
        autores={carga?.ok ? carga.pagina.autores : []}
        aoTrocar={definirConsulta}
      />

      {busca.isPending ? (
        <Carregando texto={copy.carregando} />
      ) : !carga?.ok ? (
        <CaixaDeErro>
          {copy.falhas[carga?.motivo ?? 'falha-de-comunicacao']}
        </CaixaDeErro>
      ) : carga.pagina.registros.length === 0 ? (
        <EstadoVazio
          titulo={
            temFiltro(consulta) ? copy.vazioComFiltro.titulo : copy.vazio.titulo
          }
          explicacao={
            temFiltro(consulta)
              ? copy.vazioComFiltro.explicacao
              : copy.vazio.explicacao
          }
        />
      ) : (
        <>
          <table aria-label={copy.tabela.rotulo} className="tabela">
            <thead>
              <tr>
                <th>{copy.tabela.colunas.quando}</th>
                <th>{copy.tabela.colunas.autor}</th>
                <th>{copy.tabela.colunas.acao}</th>
                <th>{copy.tabela.colunas.alvo}</th>
                <th>{copy.tabela.colunas.detalhe}</th>
              </tr>
            </thead>
            <tbody>
              {carga.pagina.registros.map((registro) => (
                <LinhaDoRegistro key={registro.id} registro={registro} />
              ))}
            </tbody>
          </table>

          {carga.pagina.truncada ? (
            <p role="status" className="mt-3 mb-0 text-[12.5px] text-texto-apoio">
              {copy.truncada}
            </p>
          ) : null}
        </>
      )}
    </Moldura>
  )
}

function Moldura({ children }: { children: ReactNode }) {
  return (
    <AreaDeTrabalho titulo={copy.titulo} lead={copy.explicacao}>
      {children}
    </AreaDeTrabalho>
  )
}

type FiltrosProps = {
  consulta: ConsultaDeAuditoria
  autores: OpcaoDeAutor[]
  aoTrocar: (consulta: ConsultaDeAuditoria) => void
}

function Filtros({ consulta, autores, aoTrocar }: FiltrosProps) {
  return (
    <section
      aria-label={copy.filtros.titulo}
      className="bloco-secundario mb-5 flex flex-wrap items-end gap-4"
    >
      <Seletor
        rotulo={copy.filtros.autor}
        valor={consulta.autor ?? ''}
        aoTrocar={(valor) => aoTrocar({ ...consulta, autor: valor || undefined })}
      >
        <option value="">{copy.filtros.todosOsAutores}</option>
        {autores.map((autor) => (
          <option key={autor.id} value={autor.id}>
            {autor.nome}
          </option>
        ))}
        <option value={AUTOR_SISTEMA}>{AUTOR_SEM_PESSOA.system}</option>
      </Seletor>

      <Seletor
        rotulo={copy.filtros.acao}
        valor={consulta.acao ?? ''}
        aoTrocar={(valor) => aoTrocar({ ...consulta, acao: paraAcao(valor) })}
      >
        <option value="">{copy.filtros.todasAsAcoes}</option>
        {ACOES.map((acao) => (
          <option key={acao} value={acao}>
            {ACAO_EM_PORTUGUES[acao]}
          </option>
        ))}
      </Seletor>

      <Seletor
        rotulo={copy.filtros.periodo}
        valor={consulta.periodo ?? 'tudo'}
        aoTrocar={(valor) =>
          aoTrocar({ ...consulta, periodo: paraPeriodo(valor) })
        }
      >
        {PERIODOS.map((periodo) => (
          <option key={periodo} value={periodo}>
            {copy.periodos[periodo]}
          </option>
        ))}
      </Seletor>

      <button
        type="button"
        onClick={() => aoTrocar(SEM_RECORTE)}
        disabled={!temFiltro(consulta)}
        className="botao-link mb-2.5"
      >
        {copy.filtros.limpar}
      </button>
    </section>
  )
}

/**
 * Nome de quem agiu. A Sarah e as rotinas do servidor não têm perfil, e quem
 * saiu da conta deixou o registro para trás: o `actor_id` continua na linha,
 * sem nome do outro lado.
 */
function nomeDoAutor(registro: RegistroDeAuditoria): string {
  if (registro.autor.tipo !== 'user') return AUTOR_SEM_PESSOA[registro.autor.tipo]
  return registro.autor.nome || copy.tabela.autorDesconhecido
}

function LinhaDoRegistro({ registro }: { registro: RegistroDeAuditoria }) {
  const alvo = ALVO_EM_PORTUGUES[registro.alvoTipo] ?? registro.alvoTipo
  const detalhe =
    registro.motivo ??
    (registro.campos.length
      ? `${copy.tabela.campos} ${registro.campos.join(', ')}`
      : copy.tabela.semDetalhe)

  return (
    <tr>
      <td className="val text-[12.5px] whitespace-nowrap text-texto-apoio">
        {formatarInstante(registro.instante)}
      </td>
      <td className="font-medium text-texto-principal">
        {nomeDoAutor(registro)}
      </td>
      <td>
        <Selo tom={TOM_DA_ACAO[registro.acao]}>{ACAO_EM_PORTUGUES[registro.acao]}</Selo>
      </td>
      <td className="text-texto-secundario">{alvo}</td>
      <td className="text-[12.5px] text-texto-apoio">{detalhe}</td>
    </tr>
  )
}

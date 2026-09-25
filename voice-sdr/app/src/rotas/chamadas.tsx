import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useMemo, useState, useSyncExternalStore, type FormEvent } from 'react'

import { criarRelogio } from '@/chamadas/ao-vivo'
import {
  BUSCA_LIMPA,
  chaveDaBusca,
  estaEmCurso,
  estadoDaLista,
  ORDENACOES,
  PERIODOS,
  recorteDaBusca,
  RESULTADOS,
  type BuscaDeChamadas,
} from '@/chamadas/consulta'
import { useServicoDeChamadas } from '@/chamadas/contexto'
import { segundosDesde } from '@/chamadas/discador'
import { formatarDecimal, formatarSegundos, formatarValor, totalDoCusto } from '@/chamadas/ficha'
import type { CargaDeChamadas, ChamadaDaLista, PaginaDeChamadas } from '@/chamadas/tipos'
import { AreaDeTrabalho } from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { Selo } from '@/componentes/selo'
import { SeloProposito } from '@/componentes/selo-proposito'
import { Seletor } from '@/componentes/seletor'
import { TabelaDensa, type ColunaDensa } from '@/componentes/tabela-densa'
import { aoVivo, lista as copy, MOTIVO_DO_FIM } from '@/copy/chamadas'
import { PROPOSITO_EM_PORTUGUES } from '@/copy/sarah'
import { formatarInstante } from '@/utilidades/datas'
import { PROPOSITOS } from '@compartilhado/playbook/camada-um.ts'

/** Lê um rótulo de uma tabela de copy pela chave do dado, sem a cadeia de protótipos. */
function rotulo(tabela: Readonly<Record<string, string>>, chave: string | null): string | null {
  if (chave === null || !Object.hasOwn(tabela, chave)) return null
  return tabela[chave] ?? null
}

/**
 * `/chamadas`: a lista de ligações da conta (RF-413).
 *
 * O recorte inteiro viaja na barra de endereço, para o link colado no chat da
 * equipe abrir a mesma lista, e o recorte que o serviço recebe se monta dentro
 * do `queryFn` por `recorteDaBusca` — é ele que tira o ensaio da lista (T-16).
 * Campanha e especialista ficam fora dos filtros até as fases que os criam; a
 * razão está no cabeçalho de `copy/chamadas.ts`.
 */
export function TelaDeChamadas() {
  const servico = useServicoDeChamadas()
  const busca = useSearch({ from: '/aplicacao/chamadas' })
  const navegar = useNavigate()

  const consulta = useQuery({
    queryKey: chaveDaBusca(busca),
    queryFn: (): Promise<CargaDeChamadas> => {
      const leitura = recorteDaBusca(busca)
      if (!leitura.ok) return Promise.resolve({ ok: false, motivo: 'filtro-invalido' })
      return servico.listarChamadas(leitura.recorte)
    },
  })

  // A busca nova sai da corrente, e não da que este desenho leu: dois filtros
  // trocados antes de o primeiro chegar à tela apagariam um ao outro.
  function trocar(mudanca: Partial<BuscaDeChamadas>) {
    void navegar({
      to: '/chamadas',
      search: (atual: BuscaDeChamadas) => ({ ...atual, ...mudanca }),
    })
  }

  const carga = consulta.data

  return (
    <AreaDeTrabalho titulo={copy.titulo} lead={copy.apoio}>
      <Filtros
        busca={busca}
        aoTrocar={trocar}
        aoLimpar={() => void navegar({ to: '/chamadas', search: BUSCA_LIMPA })}
      />

      {consulta.isPending ? (
        <Carregando texto={copy.carregando} />
      ) : !carga?.ok ? (
        <CaixaDeErro>{copy.falhas[carga?.motivo ?? 'falha-de-comunicacao']}</CaixaDeErro>
      ) : (
        <Lista pagina={carga.pagina} busca={busca} />
      )}
    </AreaDeTrabalho>
  )
}

function Lista({ pagina, busca }: { pagina: PaginaDeChamadas; busca: BuscaDeChamadas }) {
  const estado = estadoDaLista(pagina.chamadas.length, busca)

  if (estado === 'conta-sem-chamada') {
    return (
      <EstadoVazio
        titulo={copy.vazio.titulo}
        explicacao={copy.vazio.explicacao}
        acao={{ rotulo: copy.vazio.acao, endereco: '/' }}
      />
    )
  }

  if (estado === 'recorte-sem-resultado') {
    return (
      <EstadoVazio
        titulo={copy.vazioComFiltro.titulo}
        explicacao={copy.vazioComFiltro.explicacao}
      />
    )
  }

  return (
    <>
      <TabelaDensa
        rotulo={copy.tabela.rotulo}
        colunas={COLUNAS}
        linhas={pagina.chamadas}
        chaveDaLinha={(chamada) => chamada.id}
      />
      {pagina.truncada ? (
        <p role="status" className="mt-3 mb-0 text-[12.5px] text-texto-apoio">
          {copy.truncada}
        </p>
      ) : null}
    </>
  )
}

/**
 * A duração de uma chamada em curso, correndo a partir do início. Um relógio
 * por linha viva: são poucas por construção, e a linha encerrada não tem
 * relógio nenhum.
 */
function DuracaoCorrendo({ inicio }: { inicio: string }) {
  const relogio = useMemo(() => criarRelogio(), [])
  const agora = useSyncExternalStore(relogio.assinar, relogio.ler)
  return <>{formatarSegundos(segundosDesde(inicio, agora))}</>
}

function Resultado({ chamada }: { chamada: ChamadaDaLista }) {
  if (estaEmCurso(chamada)) {
    return (
      <Selo tom="informacao">
        <span aria-hidden="true" className="ao-vivo" />
        {rotulo(aoVivo.status, chamada.status) ?? chamada.status}
      </Selo>
    )
  }
  return <>{rotulo(MOTIVO_DO_FIM, chamada.motivoDoFim) ?? copy.tabela.semResultado}</>
}

const COLUNAS: readonly ColunaDensa<ChamadaDaLista>[] = [
  {
    titulo: copy.tabela.colunas.lead,
    classe: 'font-medium text-texto-principal',
    conteudo: (chamada) => (
      <span className="flex flex-wrap items-center gap-2">
        <Link
          to="/chamadas/$id"
          params={{ id: chamada.id }}
          className="font-semibold text-texto-principal no-underline hover:text-menta-2 hover:underline"
        >
          {chamada.leadNome ?? copy.tabela.semLead}
        </Link>
        {chamada.direcao === 'inbound' ? <Selo>{copy.tabela.recebida}</Selo> : null}
      </span>
    ),
  },
  {
    titulo: copy.tabela.colunas.numero,
    classe: 'val text-[12.5px] whitespace-nowrap text-texto-secundario',
    conteudo: (chamada) => chamada.numero ?? copy.tabela.semNumero,
  },
  {
    titulo: copy.tabela.colunas.proposito,
    conteudo: (chamada) => <SeloProposito proposito={chamada.proposito} />,
  },
  {
    titulo: copy.tabela.colunas.resultado,
    classe: 'text-texto-secundario',
    conteudo: (chamada) => <Resultado chamada={chamada} />,
  },
  {
    titulo: copy.tabela.colunas.duracao,
    classe: 'val text-[12.5px] whitespace-nowrap text-texto-secundario',
    conteudo: (chamada) =>
      estaEmCurso(chamada) ? (
        <DuracaoCorrendo inicio={chamada.iniciadaEm} />
      ) : chamada.duracaoSeg === null ? (
        copy.tabela.semDuracao
      ) : (
        formatarSegundos(chamada.duracaoSeg)
      ),
  },
  {
    titulo: copy.tabela.colunas.custo,
    classe: 'val text-[12.5px] whitespace-nowrap text-texto-secundario',
    // Total por moeda, como na ficha: voz e modelo chegam em dólar e a
    // telefonia na moeda da conta, e somar os dois inventaria um câmbio.
    conteudo: (chamada) => {
      const total = totalDoCusto(chamada.parcelas)
      return total.length === 0 ? copy.tabela.semCusto : total.map(formatarValor).join(' + ')
    },
  },
  {
    titulo: copy.tabela.colunas.nota,
    classe: 'val text-[12.5px] whitespace-nowrap text-texto-secundario',
    conteudo: (chamada) =>
      chamada.nota === null ? copy.tabela.semNota : formatarDecimal(chamada.nota, 1),
  },
  {
    titulo: copy.tabela.colunas.instante,
    classe: 'val text-[12.5px] whitespace-nowrap text-texto-apoio',
    conteudo: (chamada) => formatarInstante(chamada.iniciadaEm),
  },
]

type FiltrosProps = {
  busca: BuscaDeChamadas
  aoTrocar: (mudanca: Partial<BuscaDeChamadas>) => void
  aoLimpar: () => void
}

function Filtros({ busca, aoTrocar, aoLimpar }: FiltrosProps) {
  return (
    <section
      aria-label={copy.filtros.titulo}
      className="bloco-secundario mb-5 flex flex-wrap items-end gap-4"
    >
      <Seletor
        rotulo={copy.filtros.periodo}
        valor={busca.periodo ?? 'tudo'}
        aoTrocar={(valor) => aoTrocar({ periodo: valor === 'tudo' ? undefined : valor })}
      >
        {PERIODOS.map((periodo) => (
          <option key={periodo} value={periodo}>
            {copy.periodos[periodo]}
          </option>
        ))}
      </Seletor>

      <Seletor
        rotulo={copy.filtros.proposito}
        valor={busca.proposito ?? ''}
        aoTrocar={(valor) => aoTrocar({ proposito: valor || undefined })}
      >
        <option value="">{copy.filtros.todosOsPropositos}</option>
        {PROPOSITOS.map((proposito) => (
          <option key={proposito} value={proposito}>
            {PROPOSITO_EM_PORTUGUES[proposito]}
          </option>
        ))}
      </Seletor>

      <Seletor
        rotulo={copy.filtros.resultado}
        valor={busca.resultado ?? ''}
        aoTrocar={(valor) => aoTrocar({ resultado: valor || undefined })}
      >
        <option value="">{copy.filtros.todosOsResultados}</option>
        {RESULTADOS.map((resultado) => (
          <option key={resultado} value={resultado}>
            {MOTIVO_DO_FIM[resultado]}
          </option>
        ))}
      </Seletor>

      <CampoDeNumero
        // O número da barra de endereço remonta o campo: é o que faz "Limpar
        // filtros" esvaziar o que está escrito sem sincronizar estado por efeito.
        key={busca.numero ?? ''}
        numero={busca.numero ?? ''}
        aoBuscar={(numero) => aoTrocar({ numero: numero || undefined })}
      />

      <Seletor
        rotulo={copy.filtros.ordenacao}
        valor={busca.ordenacao ?? 'instante'}
        aoTrocar={(valor) => aoTrocar({ ordenacao: valor === 'instante' ? undefined : valor })}
      >
        {ORDENACOES.map((ordenacao) => (
          <option key={ordenacao} value={ordenacao}>
            {copy.ordenacoes[ordenacao]}
          </option>
        ))}
      </Seletor>

      <button type="button" onClick={aoLimpar} className="botao-link mb-2.5">
        {copy.filtros.limpar}
      </button>
    </section>
  )
}

/**
 * O número é por envio, e não por tecla: cada dígito seria uma consulta e um
 * endereço novo no histórico do navegador.
 */
function CampoDeNumero({ numero, aoBuscar }: { numero: string; aoBuscar: (numero: string) => void }) {
  const [texto, definirTexto] = useState(numero)

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    aoBuscar(texto.trim())
  }

  return (
    <form onSubmit={enviar} className="flex min-w-[200px] flex-col gap-1.5">
      <label htmlFor="numero-da-chamada" className="text-[13px] font-semibold text-texto-secundario">
        {copy.filtros.numero}
      </label>
      <input
        id="numero-da-chamada"
        type="search"
        value={texto}
        placeholder={copy.filtros.numeroExemplo}
        onChange={(evento) => definirTexto(evento.target.value)}
        className="campo py-2 text-[13.5px]"
      />
    </form>
  )
}

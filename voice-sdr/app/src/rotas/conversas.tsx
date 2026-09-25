import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { AreaDeTrabalho } from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { Selo, type TomDoSelo } from '@/componentes/selo'
import { Seletor } from '@/componentes/seletor'
import { TabelaDensa, type ColunaDensa } from '@/componentes/tabela-densa'
import {
  FILTRO_DE_STATUS_EM_PORTUGUES,
  lista as copy,
  MOTIVO_DE_FALHA_EM_PORTUGUES,
  STATUS_DA_CONVERSA_EM_PORTUGUES,
  TIPO_DE_MIDIA_EM_PORTUGUES,
} from '@/copy/conversas'
import { useServicoDeWhatsapp } from '@/whatsapp/contexto'
import { FILTROS_DE_STATUS } from '@/whatsapp/leitura'
import type { ConversaDaLista, FiltroDeStatus, StatusDaConversa } from '@/whatsapp/tipos'
import { formatarInstante } from '@/utilidades/datas'

const CHAVE = ['whatsapp-conversas'] as const

const TOM_DO_STATUS: Record<StatusDaConversa, TomDoSelo> = {
  assistente: 'acento',
  humano: 'informacao',
  encerrada: 'neutro',
}

/**
 * `/conversas`: as conversas de WhatsApp da conta. Uma linha por conversa, com
 * o lead ou o telefone, a prévia da última mensagem e o status de quem está
 * atendendo — a mesma pergunta que `/fila` responde para exceções, aqui para o
 * canal de WhatsApp.
 */
export function TelaDeConversas() {
  const servico = useServicoDeWhatsapp()
  const [filtro, definirFiltro] = useState<FiltroDeStatus>('todas')

  const consulta = useQuery({
    queryKey: [...CHAVE, filtro],
    queryFn: () => servico.listarConversas(filtro),
  })

  const carga = consulta.data

  return (
    <AreaDeTrabalho titulo={copy.titulo} lead={copy.explicacao}>
      <div className="bloco-secundario mb-5 flex flex-wrap items-end gap-4">
        <Seletor
          rotulo={copy.filtro}
          valor={filtro}
          aoTrocar={(valor) => definirFiltro(valor as FiltroDeStatus)}
        >
          {FILTROS_DE_STATUS.map((item) => (
            <option key={item} value={item}>
              {FILTRO_DE_STATUS_EM_PORTUGUES[item]}
            </option>
          ))}
        </Seletor>
      </div>

      {consulta.isPending ? (
        <Carregando texto={copy.carregando} />
      ) : !carga?.ok ? (
        <CaixaDeErro>{MOTIVO_DE_FALHA_EM_PORTUGUES[carga?.motivo ?? 'falha-de-comunicacao']}</CaixaDeErro>
      ) : carga.conversas.length === 0 ? (
        filtro === 'todas' ? (
          <EstadoVazio titulo={copy.vazio.titulo} explicacao={copy.vazio.explicacao} />
        ) : (
          <EstadoVazio
            titulo={copy.vazioComFiltro.titulo}
            explicacao={copy.vazioComFiltro.explicacao}
            acao={{ rotulo: FILTRO_DE_STATUS_EM_PORTUGUES.todas, aoAcionar: () => definirFiltro('todas') }}
          />
        )
      ) : (
        <TabelaDensa
          rotulo={copy.tabela.rotulo}
          colunas={COLUNAS}
          linhas={carga.conversas}
          chaveDaLinha={(conversa) => conversa.id}
        />
      )}
    </AreaDeTrabalho>
  )
}

function Previa({ conversa }: { conversa: ConversaDaLista }) {
  if (!conversa.ultimaMensagem) return <>{copy.tabela.semMensagem}</>
  if (conversa.ultimaMensagem.midia) {
    return <>{TIPO_DE_MIDIA_EM_PORTUGUES[conversa.ultimaMensagem.midia]}</>
  }
  return <>{conversa.ultimaMensagem.corpo || copy.tabela.semMensagem}</>
}

const COLUNAS: readonly ColunaDensa<ConversaDaLista>[] = [
  {
    titulo: copy.tabela.lead,
    classe: 'font-semibold text-texto-principal',
    conteudo: (conversa) => (
      <Link
        to="/conversas/$id"
        params={{ id: conversa.id }}
        className="font-semibold text-texto-principal no-underline hover:text-menta-2 hover:underline"
      >
        {conversa.leadNome ?? copy.tabela.semLead}
      </Link>
    ),
  },
  {
    titulo: copy.tabela.telefone,
    classe: 'val text-[12.5px] whitespace-nowrap text-texto-secundario',
    conteudo: (conversa) => conversa.telefone,
  },
  {
    titulo: copy.tabela.ultimaMensagem,
    classe: 'max-w-[32ch] truncate text-texto-secundario',
    conteudo: (conversa) => <Previa conversa={conversa} />,
  },
  {
    titulo: copy.tabela.status,
    conteudo: (conversa) => (
      <Selo tom={TOM_DO_STATUS[conversa.status]}>{STATUS_DA_CONVERSA_EM_PORTUGUES[conversa.status]}</Selo>
    ),
  },
  {
    titulo: copy.tabela.quando,
    classe: 'val text-[12.5px] whitespace-nowrap text-texto-apoio',
    conteudo: (conversa) => formatarInstante(conversa.atualizadaEm),
  },
]

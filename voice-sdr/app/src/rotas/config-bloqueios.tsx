import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'

import { useServicoDeBloqueios } from '@/bloqueios/contexto'
import {
  INCLUSAO_EM_BRANCO,
  lerLista,
  linhasLidas,
  motivoValido,
  RECORTE_INICIAL,
  recorteEhInicial,
  TETO_DA_LISTA,
  validarInclusao,
  type CamposDaInclusao,
  type RecusasDaInclusao,
} from '@/bloqueios/lista'
import {
  ESTADOS,
  ORIGENS,
  type Bloqueio,
  type EstadoDoBloqueio,
  type MotivoDeFalhaDosBloqueios,
  type OrigemDoBloqueio,
  type PreviaDaImportacao,
  type RecorteDeBloqueios,
  type ServicoDeBloqueios,
} from '@/bloqueios/tipos'
import { AreaDeTrabalho } from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { CampoDeTextoLongo } from '@/componentes/campo-de-texto-longo'
import { Carregando } from '@/componentes/carregando'
import { Dialogo } from '@/componentes/dialogo'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { LinhaDeCampos } from '@/componentes/linha-de-campos'
import { NegativaPorPapel } from '@/componentes/negativa-por-papel'
import { Painel } from '@/componentes/painel'
import { Seletor } from '@/componentes/seletor'
import { TabelaDensa, type ColunaDensa } from '@/componentes/tabela-densa'
import {
  bloqueios as copy,
  ESTADO_DO_BLOQUEIO,
  ORIGEM_DO_BLOQUEIO,
} from '@/copy/bloqueios'
import { equipe as copyDaEquipe } from '@/copy/equipe'
import { RECUSA_DO_TELEFONE } from '@/copy/leads'
import { EXTENSOES_ACEITAS } from '@/leads/planilha'
import { useServicoDeEquipe } from '@/equipe/contexto'
import { podeOperarBloqueios, quemConcedeAcesso } from '@/equipe/papeis'
import type { Membro } from '@/equipe/tipos'
import { formatarInstante } from '@/utilidades/datas'

/** Prefixo de toda carga da lista: a escrita invalida todos os recortes. */
const CHAVE = ['bloqueios'] as const

/** O papel de quem olha vem da mesma carga da tela de equipe, e da mesma chave. */
const CHAVE_DA_EQUIPE = ['equipe'] as const

type Formulario = 'nenhum' | 'incluir' | 'importar'

/**
 * `/config/bloqueios`: a lista de não perturbe (RF-804).
 *
 * Três decisões explicam o desenho:
 *
 * 1. **O número se grava normalizado.** O passo 3 da guarda compara por
 *    igualdade com `leads.phone_e164`, e quem normaliza é
 *    `@compartilhado/telefone.ts` dentro de `validarInclusao`.
 * 2. **Remover exige motivo e é `update`.** O bloqueio removido continua na
 *    tabela e aparece no recorte de removidos, com quem removeu e por quê.
 * 3. **Importar tem prévia.** Válidos, inválidos e já bloqueados aparecem antes
 *    de qualquer escrita, como na importação de leads, e a confirmação
 *    recalcula a partir do texto.
 */
export function TelaDeBloqueios() {
  const servico = useServicoDeBloqueios()
  const servicoDeEquipe = useServicoDeEquipe()
  const clienteDeConsulta = useQueryClient()

  // Acima do `useQuery`: chave nova volta a `isPending`, e o que mora no ramo
  // da lista morre junto.
  const [recorte, definirRecorte] = useState<RecorteDeBloqueios>(RECORTE_INICIAL)
  const [formulario, definirFormulario] = useState<Formulario>('nenhum')
  const [aviso, definirAviso] = useState<string | null>(null)
  const [removendo, definirRemovendo] = useState<Bloqueio | null>(null)

  const consulta = useQuery({
    queryKey: [...CHAVE, recorte.estado, recorte.origem],
    queryFn: () => servico.carregar(recorte),
  })

  const equipe = useQuery({
    queryKey: CHAVE_DA_EQUIPE,
    queryFn: () => servicoDeEquipe.carregar(),
  })

  if (equipe.isPending) {
    return (
      <Moldura>
        <Carregando texto={copy.carregando} />
      </Moldura>
    )
  }

  const cargaDaEquipe = equipe.data
  // Equipe que não carregou não libera escrita: a política decide de verdade,
  // e oferecer o formulário para receber a recusa dela no meio trocaria uma
  // negativa explicada por um erro sem saída.
  const papel = cargaDaEquipe?.ok ? cargaDaEquipe.equipe.papelDoUsuario : null
  const podeEscrever = papel !== null && podeOperarBloqueios(papel)
  const membros = cargaDaEquipe?.ok ? cargaDaEquipe.equipe.membros : []

  function concluir(mensagem: string) {
    definirFormulario('nenhum')
    definirRemovendo(null)
    definirAviso(mensagem)
    void clienteDeConsulta.invalidateQueries({ queryKey: CHAVE })
  }

  function abrir(qual: Formulario) {
    definirAviso(null)
    definirFormulario(qual)
  }

  return (
    <Moldura
      acoes={
        podeEscrever && formulario === 'nenhum' ? (
          <div className="flex flex-wrap gap-3">
            <button type="button" className="botao-secundario" onClick={() => abrir('importar')}>
              {copy.importar.abrir}
            </button>
            <button type="button" className="botao-primario" onClick={() => abrir('incluir')}>
              {copy.incluir.abrir}
            </button>
          </div>
        ) : null
      }
    >
      <div className="flex flex-col gap-5">
        {papel !== null && !podeEscrever ? (
          <NegativaPorPapel
            aviso={copy.leitura.aviso}
            administradores={quemConcedeAcesso(membros)}
          />
        ) : null}

        {cargaDaEquipe && !cargaDaEquipe.ok ? (
          <CaixaDeErro>{copyDaEquipe.falhas[cargaDaEquipe.motivo]}</CaixaDeErro>
        ) : null}

        <p className="bloco-secundario m-0 border-informacao-borda bg-informacao-fundo text-[13px] text-texto-secundario">
          {copy.efeito}
        </p>

        {aviso ? (
          <p
            role="status"
            className="m-0 rounded-controle border border-positivo-borda bg-positivo-fundo px-3.5 py-2.5 text-[13px] font-semibold text-positivo"
          >
            {aviso}
          </p>
        ) : null}

        {formulario === 'incluir' ? (
          <FormularioDeInclusao
            servico={servico}
            aoCancelar={() => definirFormulario('nenhum')}
            aoIncluir={(e164) => concluir(copy.incluir.feito(e164))}
          />
        ) : null}

        {formulario === 'importar' ? (
          <FormularioDeImportacao
            servico={servico}
            aoCancelar={() => definirFormulario('nenhum')}
            aoImportar={(gravados) => concluir(copy.importar.feito(gravados))}
          />
        ) : null}

        <div className="bloco-secundario flex flex-wrap items-end gap-3">
          <Seletor
            rotulo={copy.filtros.estado}
            valor={recorte.estado}
            aoTrocar={(valor) =>
              definirRecorte((atual) => ({ ...atual, estado: valor as EstadoDoBloqueio }))
            }
          >
            {ESTADOS.map((estado) => (
              <option key={estado} value={estado}>
                {ESTADO_DO_BLOQUEIO[estado]}
              </option>
            ))}
          </Seletor>
          <Seletor
            rotulo={copy.filtros.origem}
            valor={recorte.origem}
            aoTrocar={(valor) =>
              definirRecorte((atual) => ({
                ...atual,
                origem: valor as OrigemDoBloqueio | 'todas',
              }))
            }
          >
            <option value="todas">{copy.filtros.todas}</option>
            {ORIGENS.map((origem) => (
              <option key={origem} value={origem}>
                {ORIGEM_DO_BLOQUEIO[origem]}
              </option>
            ))}
          </Seletor>
          {!recorteEhInicial(recorte) ? (
            <button
              type="button"
              className="botao-fantasma"
              onClick={() => definirRecorte(RECORTE_INICIAL)}
            >
              {copy.filtros.limpar}
            </button>
          ) : null}
        </div>

        <Lista
          pendente={consulta.isPending}
          carga={consulta.data}
          recorte={recorte}
          membros={membros}
          podeEscrever={podeEscrever}
          aoRemover={(bloqueio) => {
            definirAviso(null)
            definirRemovendo(bloqueio)
          }}
        />
      </div>

      {removendo ? (
        <DialogoDeRemocao
          servico={servico}
          bloqueio={removendo}
          aoCancelar={() => definirRemovendo(null)}
          aoRemover={() => concluir(copy.remover.feito(removendo.e164))}
        />
      ) : null}
    </Moldura>
  )
}

function Moldura({ acoes, children }: { acoes?: ReactNode; children: ReactNode }) {
  return (
    <AreaDeTrabalho titulo={copy.titulo} lead={copy.explicacao} acoes={acoes}>
      {children}
    </AreaDeTrabalho>
  )
}

function nomeDe(usuarioId: string | null, membros: readonly Membro[]): string {
  if (usuarioId === null) return copy.tabela.sarah
  return membros.find((membro) => membro.usuarioId === usuarioId)?.nome ?? copy.tabela.exMembro
}

/** Os quatro estados da lista: carregando, falha, os dois vazios e a tabela. */
function Lista({
  pendente,
  carga,
  recorte,
  membros,
  podeEscrever,
  aoRemover,
}: {
  pendente: boolean
  carga: Awaited<ReturnType<ServicoDeBloqueios['carregar']>> | undefined
  recorte: RecorteDeBloqueios
  membros: readonly Membro[]
  podeEscrever: boolean
  aoRemover: (bloqueio: Bloqueio) => void
}) {
  if (pendente) return <Carregando texto={copy.carregando} />

  if (!carga?.ok) {
    return <CaixaDeErro>{copy.falhas[carga?.motivo ?? 'falha-de-comunicacao']}</CaixaDeErro>
  }

  if (carga.bloqueios.length === 0) {
    return carga.haBloqueios ? (
      <EstadoVazio titulo={copy.semResultado.titulo} explicacao={copy.semResultado.explicacao} />
    ) : (
      <EstadoVazio titulo={copy.vazio.titulo} explicacao={copy.vazio.explicacao} />
    )
  }

  const comuns: ColunaDensa<Bloqueio>[] = [
    { titulo: copy.tabela.numero, classe: 'val', conteudo: (linha) => linha.e164 },
    { titulo: copy.tabela.motivo, conteudo: (linha) => linha.motivo },
    { titulo: copy.tabela.origem, conteudo: (linha) => ORIGEM_DO_BLOQUEIO[linha.origem] },
    { titulo: copy.tabela.incluidoPor, conteudo: (linha) => nomeDe(linha.incluidoPor, membros) },
    {
      titulo: copy.tabela.incluidoEm,
      classe: 'val',
      conteudo: (linha) => formatarInstante(linha.incluidoEm),
    },
  ]

  const colunas: ColunaDensa<Bloqueio>[] =
    recorte.estado === 'removido'
      ? [
          ...comuns,
          {
            titulo: copy.tabela.removidoEm,
            classe: 'val',
            conteudo: (linha) => formatarInstante(linha.removidoEm),
          },
          {
            titulo: copy.tabela.removidoPor,
            conteudo: (linha) => nomeDe(linha.removidoPor, membros),
          },
          { titulo: copy.tabela.motivoDaRemocao, conteudo: (linha) => linha.motivoDaRemocao },
        ]
      : podeEscrever
        ? [
            ...comuns,
            {
              titulo: copy.tabela.acao,
              conteudo: (linha) => (
                <button
                  type="button"
                  className="botao-link text-perigo"
                  aria-label={copy.tabela.removerRotulo(linha.e164)}
                  onClick={() => aoRemover(linha)}
                >
                  {copy.tabela.remover}
                </button>
              ),
            },
          ]
        : comuns

  return (
    <TabelaDensa
      rotulo={copy.tabela.rotulo}
      colunas={colunas}
      linhas={carga.bloqueios}
      chaveDaLinha={(linha) => linha.id}
    />
  )
}

function FormularioDeInclusao({
  servico,
  aoCancelar,
  aoIncluir,
}: {
  servico: ServicoDeBloqueios
  aoCancelar: () => void
  aoIncluir: (e164: string) => void
}) {
  const [campos, definirCampos] = useState<CamposDaInclusao>(INCLUSAO_EM_BRANCO)
  const [recusas, definirRecusas] = useState<RecusasDaInclusao>({})
  const [falha, definirFalha] = useState<MotivoDeFalhaDosBloqueios | null>(null)
  const [gravando, definirGravando] = useState(false)

  function mudar(mudanca: Partial<CamposDaInclusao>) {
    definirCampos((atual) => ({ ...atual, ...mudanca }))
    definirFalha(null)
  }

  async function gravar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    const validado = validarInclusao(campos)
    if (!validado.ok) {
      definirRecusas(validado.recusas)
      return
    }

    definirRecusas({})
    definirGravando(true)
    const resultado = await servico.incluir(validado.dados)
    definirGravando(false)

    if (!resultado.ok) {
      definirFalha(resultado.motivo)
      return
    }

    aoIncluir(validado.dados.e164)
  }

  return (
    <Painel titulo={copy.incluir.titulo} apoio={copy.incluir.apoio}>
      <form onSubmit={gravar} noValidate className="flex flex-col gap-4">
        <LinhaDeCampos>
          <CampoDeTexto
            rotulo={copy.incluir.numero}
            exemplo={copy.incluir.numeroExemplo}
            name="numero"
            inputMode="tel"
            autoComplete="off"
            value={campos.numero}
            erro={recusas.numero ? copy.incluir.recusas.numero[recusas.numero] : undefined}
            onChange={(evento) => mudar({ numero: evento.target.value })}
          />
          <CampoDeTexto
            rotulo={copy.incluir.motivo}
            exemplo={copy.incluir.motivoExemplo}
            name="motivo"
            autoComplete="off"
            value={campos.motivo}
            erro={recusas.motivo ? copy.incluir.recusas.motivo : undefined}
            onChange={(evento) => mudar({ motivo: evento.target.value })}
          />
        </LinhaDeCampos>

        {falha ? <CaixaDeErro>{copy.falhas[falha]}</CaixaDeErro> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={gravando} className="botao-primario">
            {gravando ? copy.incluir.gravando : copy.incluir.gravar}
          </button>
          <button type="button" className="botao-fantasma" disabled={gravando} onClick={aoCancelar}>
            {copy.incluir.cancelar}
          </button>
        </div>
      </form>
    </Painel>
  )
}

function FormularioDeImportacao({
  servico,
  aoCancelar,
  aoImportar,
}: {
  servico: ServicoDeBloqueios
  aoCancelar: () => void
  aoImportar: (gravados: number) => void
}) {
  const [texto, definirTexto] = useState('')
  const [motivo, definirMotivo] = useState('')
  const [recusa, definirRecusa] = useState<string | null>(null)
  const [falha, definirFalha] = useState<MotivoDeFalhaDosBloqueios | null>(null)
  const [previa, definirPrevia] = useState<PreviaDaImportacao | null>(null)
  const [ocupado, definirOcupado] = useState(false)

  async function lerArquivo(evento: ChangeEvent<HTMLInputElement>) {
    const escolhido = evento.target.files?.[0]
    if (!escolhido) return
    definirTexto(await escolhido.text())
    definirRecusa(null)
  }

  async function prever(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    definirFalha(null)

    const linhas = lerLista(texto).length
    if (linhas === 0) return definirRecusa(copy.importar.listaVazia)
    if (linhas > TETO_DA_LISTA) return definirRecusa(copy.importar.linhasDemais(TETO_DA_LISTA))
    if (!motivoValido(motivo)) return definirRecusa(copy.importar.semMotivo)

    definirRecusa(null)
    definirOcupado(true)
    const resultado = await servico.preverImportacao(texto)
    definirOcupado(false)

    if (!resultado.ok) return definirFalha(resultado.motivo)
    definirPrevia(resultado.previa)
  }

  async function confirmar() {
    definirFalha(null)
    definirOcupado(true)
    const resultado = await servico.importar(texto, motivo)
    definirOcupado(false)

    if (!resultado.ok) return definirFalha(resultado.motivo)
    aoImportar(resultado.gravados)
  }

  if (previa) {
    return (
      <PreviaDaLista
        previa={previa}
        ocupado={ocupado}
        falha={falha}
        aoConfirmar={() => void confirmar()}
        aoVoltar={() => {
          definirFalha(null)
          definirPrevia(null)
        }}
      />
    )
  }

  return (
    <Painel titulo={copy.importar.titulo} apoio={copy.importar.apoio}>
      <form onSubmit={prever} noValidate className="flex flex-col gap-4">
        <CampoDeTextoLongo
          rotulo={copy.importar.lista}
          exemplo={copy.importar.listaExemplo}
          name="lista"
          rows={6}
          value={texto}
          onChange={(evento) => {
            definirTexto(evento.target.value)
            definirRecusa(null)
          }}
        />
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-texto-secundario">
          {copy.importar.arquivo}
          <input
            type="file"
            accept={EXTENSOES_ACEITAS}
            aria-label={copy.importar.arquivo}
            onChange={(evento) => void lerArquivo(evento)}
          />
        </label>
        <CampoDeTexto
          rotulo={copy.importar.motivo}
          exemplo={copy.importar.motivoExemplo}
          name="motivo-da-importacao"
          autoComplete="off"
          value={motivo}
          onChange={(evento) => {
            definirMotivo(evento.target.value)
            definirRecusa(null)
          }}
        />
        <p className="m-0 -mt-2 text-[12.5px] text-texto-apoio">{copy.importar.motivoApoio}</p>

        {recusa ? <CaixaDeErro tom="atencao">{recusa}</CaixaDeErro> : null}
        {falha ? <CaixaDeErro>{copy.falhas[falha]}</CaixaDeErro> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={ocupado} className="botao-primario">
            {ocupado ? copy.importar.conferindo : copy.importar.prever}
          </button>
          <button type="button" className="botao-fantasma" disabled={ocupado} onClick={aoCancelar}>
            {copy.importar.cancelar}
          </button>
        </div>
      </form>
    </Painel>
  )
}

function PreviaDaLista({
  previa,
  ocupado,
  falha,
  aoConfirmar,
  aoVoltar,
}: {
  previa: PreviaDaImportacao
  ocupado: boolean
  falha: MotivoDeFalhaDosBloqueios | null
  aoConfirmar: () => void
  aoVoltar: () => void
}) {
  const textos = copy.importar.previa
  const validos = previa.validos.length

  return (
    <Painel titulo={textos.titulo} apoio={textos.apoio}>
      <div className="flex flex-col gap-4">
        <ul aria-label={textos.titulo} className="m-0 flex list-none flex-col gap-1 p-0 text-[13.5px]">
          <li className="font-medium">{textos.lidas(linhasLidas(previa))}</li>
          <li>{textos.validos(validos)}</li>
          <li>{textos.invalidos(previa.invalidos.length)}</li>
          <li>{textos.jaBloqueados(previa.jaBloqueados.length)}</li>
          {previa.repetidos ? <li>{textos.repetidos(previa.repetidos)}</li> : null}
        </ul>

        {previa.invalidos.length ? (
          <ul aria-label={textos.rotuloDosInvalidos} className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
            {previa.invalidos.map((invalida) => (
              <li key={invalida.linha}>
                {textos.linha(invalida.linha)}: <span className="val">{invalida.bruto}</span>.{' '}
                <span className="text-texto-apoio">{RECUSA_DO_TELEFONE[invalida.motivo]}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {previa.jaBloqueados.length ? (
          <ul aria-label={textos.rotuloDosJaBloqueados} className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
            {previa.jaBloqueados.map((e164) => (
              <li key={e164} className="val">
                {e164}
              </li>
            ))}
          </ul>
        ) : null}

        {validos === 0 ? (
          <p className="m-0 text-[13px] text-texto-apoio">{textos.nadaAGravar}</p>
        ) : null}

        {falha ? <CaixaDeErro>{copy.falhas[falha]}</CaixaDeErro> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="botao-primario"
            disabled={ocupado || validos === 0}
            onClick={aoConfirmar}
          >
            {ocupado ? textos.gravando : textos.confirmar(validos)}
          </button>
          <button type="button" className="botao-fantasma" disabled={ocupado} onClick={aoVoltar}>
            {textos.voltar}
          </button>
        </div>
      </div>
    </Painel>
  )
}

function DialogoDeRemocao({
  servico,
  bloqueio,
  aoCancelar,
  aoRemover,
}: {
  servico: ServicoDeBloqueios
  bloqueio: Bloqueio
  aoCancelar: () => void
  aoRemover: () => void
}) {
  const [motivo, definirMotivo] = useState('')
  const [falha, definirFalha] = useState<MotivoDeFalhaDosBloqueios | null>(null)
  const [removendo, definirRemovendo] = useState(false)

  async function remover() {
    definirFalha(null)
    definirRemovendo(true)
    const resultado = await servico.remover(bloqueio.id, motivo)
    definirRemovendo(false)

    if (!resultado.ok) return definirFalha(resultado.motivo)
    aoRemover()
  }

  return (
    <Dialogo
      titulo={copy.remover.titulo}
      explicacao={copy.remover.explicacao(bloqueio.e164)}
      confirmar={removendo ? copy.remover.removendo : copy.remover.confirmar}
      cancelar={copy.remover.cancelar}
      tom="perigo"
      ocupado={removendo}
      podeConfirmar={motivoValido(motivo)}
      aoConfirmar={() => void remover()}
      aoCancelar={aoCancelar}
    >
      <div className="flex flex-col gap-3">
        <CampoDeTextoLongo
          rotulo={copy.remover.motivo}
          exemplo={copy.remover.motivoExemplo}
          apoio={copy.remover.semMotivo}
          rows={3}
          value={motivo}
          onChange={(evento) => definirMotivo(evento.target.value)}
        />
        {falha ? <CaixaDeErro>{copy.falhas[falha]}</CaixaDeErro> : null}
      </div>
    </Dialogo>
  )
}

import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState, type ChangeEvent } from 'react'

import {
  AreaDeTrabalho,
  type PropsDeTelaEmbutivel,
} from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { Painel } from '@/componentes/painel'
import { Selo } from '@/componentes/selo'
import { Seletor } from '@/componentes/seletor'
import { TabelaDensa, type ColunaDensa } from '@/componentes/tabela-densa'
import {
  CAMPO_EM_PORTUGUES,
  importacaoDeLeads as copy,
  PASSOS,
  type Passo,
} from '@/copy/leads-importar'
import { useServicoDeEquipe } from '@/equipe/contexto'
import { podeOperarLeads, quemConcedeAcesso } from '@/equipe/papeis'
import type { Membro } from '@/equipe/tipos'
import { BUSCA_LIMPA } from '@/leads/consulta'
import { useServicoDeLeads } from '@/leads/contexto'
import {
  agruparPrevia,
  amostraDoMapeamento,
  camposMapeados,
  chaveDoMapeamento,
  hashDoArquivo,
  linhasComErro,
  podeVerPrevia,
  type ArquivoLido,
  type LinhaDaAmostra,
} from '@/leads/importacao'
import {
  escreverCsv,
  EXTENSOES_ACEITAS,
  lerArquivoDePlanilha,
  type MotivoDaLeitura,
  TETO_DE_LINHAS,
} from '@/leads/planilha'
import type {
  EscolhaDeDuplicata,
  FrasesDaImportacao,
  MotivoDaImportacao,
  RespostaDaPrevia,
} from '@/leads/tipos'
import { baixarTexto } from '@/utilidades/download'
import {
  CAMPOS_DO_LEAD,
  resolverMapeamento,
  type CampoDoLead,
  type LinhaDaPrevia,
  type MapeamentoDeColunas,
  type MapeamentoResolvido,
} from '@importacao/previa.ts'
import type { RelatorioDaImportacao } from '@importacao/confirmacao.ts'

/** A mesma chave de `/leads`: quem já abriu a equipe não busca de novo. */
const CHAVE_DA_EQUIPE = ['equipe'] as const

/** Quantas linhas de cada grupo da prévia aparecem antes do "ver todas". */
const LIMITE_DA_LISTA = 10

/** As duas escolhas que a tela oferece para telefone já cadastrado (RF-103). */
const ESCOLHAS: readonly EscolhaDeDuplicata[] = ['ignorar', 'atualizar']

/** O que a confirmação devolveu: o relatório e as frases dos motivos dele. */
interface ResultadoDaImportacao {
  relatorio: RelatorioDaImportacao
  frases: FrasesDaImportacao
}

/**
 * `/leads/importar`: subir a planilha, conferir o que entra e só então gravar
 * (RF-101, RF-103, RF-104, RF-105).
 *
 * Três decisões explicam o desenho:
 *
 * 1. **O arquivo não sobe; as linhas sim.** Quem abre o CSV é o navegador
 *    (`@/leads/planilha`), e o que viaja é a planilha já em células. Erro de
 *    formato se descobre sem gastar uma ida ao servidor, e a coluna que ninguém
 *    mapeou continua no arquivo de quem o tem.
 * 2. **A prévia lê e a confirmação grava, e a tela diz qual é qual.** São duas
 *    chamadas ao mesmo endereço, separadas pela ação, e o passo 3 afirma em
 *    texto que nada foi gravado ainda. A promessa é conferível pelo lado do
 *    teste: até o clique em confirmar, a lista de importações do serviço está
 *    vazia.
 * 3. **O mapeamento é palpite com direito a correção.** `resolverMapeamento`
 *    acerta o nome usual de cada coluna, e o que ele errar se troca no seletor.
 *    Só a coluna de telefone é obrigatória, porque sem ela toda linha cairia em
 *    `coluna_nao_mapeada` e a importação inteira seria uma lista de erros.
 */
export function TelaDeImportacaoDeLeads({
  dentroDoAssistente = false,
}: PropsDeTelaEmbutivel) {
  const servico = useServicoDeLeads()
  const servicoDeEquipe = useServicoDeEquipe()

  const [passo, definirPasso] = useState<Passo>('arquivo')
  const [arquivo, definirArquivo] = useState<ArquivoLido | null>(null)
  const [falhaDaLeitura, definirFalhaDaLeitura] = useState<MotivoDaLeitura>()
  const [escolhas, definirEscolhas] = useState<MapeamentoDeColunas>({})
  const [aoDuplicar, definirAoDuplicar] = useState<EscolhaDeDuplicata>('ignorar')
  const [resultado, definirResultado] = useState<ResultadoDaImportacao | null>(null)
  const [importando, definirImportando] = useState(false)
  const [falha, definirFalha] = useState<MotivoDaImportacao>()

  const equipe = useQuery({
    queryKey: CHAVE_DA_EQUIPE,
    queryFn: () => servicoDeEquipe.carregar(),
  })

  const cargaDaEquipe = equipe.data
  // Equipe que não carregou não libera escrita, como em `/leads` e em
  // `/leads/novo`: a política é quem decide de verdade, e oferecer o botão para
  // descobrir que ela nega trocaria uma negativa explicada por uma recusa no
  // meio do caminho.
  const papel = cargaDaEquipe?.ok ? cargaDaEquipe.equipe.papelDoUsuario : null
  const podeEscrever = papel !== null && podeOperarLeads(papel)
  const administradores = cargaDaEquipe?.ok
    ? quemConcedeAcesso(cargaDaEquipe.equipe.membros)
    : []

  const mapeamento =
    arquivo === null ? null : resolverMapeamento(arquivo.planilha.colunas, escolhas)

  // A prévia sai quando o passo 3 abre e enquanto não há relatório: depois de
  // gravar, a foto de antes não descreve mais a base.
  const previa = useQuery({
    queryKey: [
      'previa-da-importacao',
      arquivo?.hash ?? '',
      mapeamento === null ? '' : chaveDoMapeamento(mapeamento),
    ],
    queryFn: (): Promise<RespostaDaPrevia> => {
      if (arquivo === null || mapeamento === null) {
        return Promise.resolve({ ok: false, motivo: 'falha-de-comunicacao' })
      }
      return servico.preverImportacao({ planilha: arquivo.planilha, mapeamento })
    },
    enabled: passo === 'previa' && arquivo !== null && resultado === null,
  })

  async function escolherArquivo(evento: ChangeEvent<HTMLInputElement>) {
    const escolhido = evento.target.files?.[0]
    if (escolhido === undefined) return

    const leitura = await lerArquivoDePlanilha(new Uint8Array(await escolhido.arrayBuffer()))

    // Arquivo novo zera o que valia para o anterior: mapeamento corrigido à
    // mão, relatório na tela e falha de servidor são todos do outro arquivo.
    definirEscolhas({})
    definirResultado(null)
    definirFalha(undefined)

    if (!leitura.ok) {
      definirArquivo(null)
      definirFalhaDaLeitura(leitura.motivo)
      return
    }

    definirFalhaDaLeitura(undefined)
    definirArquivo({
      nome: escolhido.name,
      // O hash é do que foi lido, e não dos bytes: é a mesma planilha, seja
      // ela CSV ou Excel, que a prévia descreve.
      hash: await hashDoArquivo(JSON.stringify(leitura.planilha)),
      planilha: leitura.planilha,
    })
  }

  async function confirmar() {
    if (arquivo === null || mapeamento === null) return

    definirImportando(true)
    definirFalha(undefined)
    const resposta = await servico.importar({
      planilha: arquivo.planilha,
      mapeamento,
      arquivo: { nome: arquivo.nome, hash: arquivo.hash },
      aoDuplicar,
    })
    definirImportando(false)

    if (!resposta.ok) {
      definirFalha(resposta.motivo)
      return
    }
    definirResultado({ relatorio: resposta.relatorio, frases: resposta.frases })
  }

  function recomecar() {
    definirArquivo(null)
    definirEscolhas({})
    definirResultado(null)
    definirFalha(undefined)
    definirFalhaDaLeitura(undefined)
    definirPasso('arquivo')
  }

  const cargaDaPrevia = previa.data

  return (
    <AreaDeTrabalho
      titulo={copy.titulo}
      lead={copy.explicacao}
      embutida={dentroDoAssistente}
    >
      {papel !== null && !podeEscrever ? (
        <NegativaDeLeitura administradores={administradores} />
      ) : null}

      {cargaDaEquipe && !cargaDaEquipe.ok ? (
        <div className="mb-6">
          <CaixaDeErro>{copy.equipeIndisponivel}</CaixaDeErro>
        </div>
      ) : null}

      <TrilhaDePassos atual={passo} />

      <div className="mt-6 flex flex-col gap-6">
        {passo === 'arquivo' ? (
          <PassoDoArquivo
            arquivo={arquivo}
            falha={falhaDaLeitura}
            podeEscrever={podeEscrever}
            aoEscolher={(evento) => void escolherArquivo(evento)}
            aoSeguir={() => definirPasso('mapeamento')}
          />
        ) : null}

        {passo === 'mapeamento' && arquivo !== null && mapeamento !== null ? (
          <PassoDoMapeamento
            arquivo={arquivo}
            mapeamento={mapeamento}
            aoTrocar={(campo, coluna) =>
              definirEscolhas((atual) => ({ ...atual, [campo]: coluna }))
            }
            aoVoltar={() => definirPasso('arquivo')}
            aoSeguir={() => definirPasso('previa')}
          />
        ) : null}

        {passo === 'previa' ? (
          resultado !== null ? (
            <Relatorio
              resultado={resultado}
              dentroDoAssistente={dentroDoAssistente}
              aoRecomecar={recomecar}
            />
          ) : previa.isPending ? (
            <Carregando texto={copy.previa.carregando} />
          ) : cargaDaPrevia?.ok ? (
            <PassoDaPrevia
              previa={cargaDaPrevia}
              aoDuplicar={aoDuplicar}
              aoEscolher={definirAoDuplicar}
              importando={importando}
              podeEscrever={podeEscrever}
              falha={falha}
              aoVoltar={() => definirPasso('mapeamento')}
              aoConfirmar={() => void confirmar()}
            />
          ) : (
            <CaixaDeErro>
              {copy.falhas[cargaDaPrevia?.motivo ?? 'falha-de-comunicacao']}
            </CaixaDeErro>
          )
        ) : null}
      </div>
    </AreaDeTrabalho>
  )
}

/** Os três passos à vista, com o atual marcado para quem lê e para o leitor. */
function TrilhaDePassos({ atual }: { atual: Passo }) {
  return (
    <ol
      aria-label={copy.titulo}
      className="m-0 flex list-none flex-wrap gap-2 p-0"
    >
      {PASSOS.map((passo, indice) => {
        const ativo = passo === atual
        // O passo já dado fica menta, o atual carmim e o que falta neutro,
        // sempre com o número e o nome escritos.
        const feito = indice < PASSOS.indexOf(atual)
        return (
          <li key={passo}>
            <span
              aria-current={ativo ? 'step' : undefined}
              className={`selo ${ativo ? 'selo-acento' : feito ? 'selo-positivo' : 'selo-neutro'}`}
            >
              <span className="val">{copy.passos[passo].numero}</span>
              {copy.passos[passo].titulo}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

type PassoDoArquivoProps = {
  arquivo: ArquivoLido | null
  falha: MotivoDaLeitura | undefined
  podeEscrever: boolean
  aoEscolher: (evento: ChangeEvent<HTMLInputElement>) => void
  aoSeguir: () => void
}

function PassoDoArquivo({
  arquivo,
  falha,
  podeEscrever,
  aoEscolher,
  aoSeguir,
}: PassoDoArquivoProps) {
  return (
    <Painel titulo={copy.arquivo.titulo} apoio={copy.arquivo.apoio}>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-texto-secundario">
          {copy.arquivo.campo}
        </span>
        <input
          type="file"
          name="planilha"
          accept={EXTENSOES_ACEITAS}
          disabled={!podeEscrever}
          onChange={aoEscolher}
          className="campo cursor-pointer py-2 text-[13.5px] file:mr-3 file:cursor-pointer file:rounded-pequeno file:border file:border-borda file:bg-superficie-2 file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-texto-principal hover:file:bg-superficie-3"
        />
      </label>

      <p className="mt-2.5 mb-0 text-[12.5px] text-texto-apoio">
        {copy.arquivo.formatos(TETO_DE_LINHAS)}
      </p>

      {falha ? (
        <div className="mt-4">
          <CaixaDeErro>{copy.falhasDaLeitura[falha]}</CaixaDeErro>
        </div>
      ) : null}

      <div className="mt-5">
        {arquivo === null ? (
          <EstadoVazio
            titulo={copy.arquivo.vazio.titulo}
            explicacao={copy.arquivo.vazio.explicacao}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-[13.5px] text-texto-secundario">
              <span className="font-semibold">{arquivo.nome}</span>{' '}
              <span className="val text-texto-apoio">
                {copy.arquivo.lido(
                  arquivo.planilha.linhas.length,
                  arquivo.planilha.colunas.length,
                )}
              </span>
            </p>
            <button type="button" onClick={aoSeguir} className="botao-primario">
              {copy.arquivo.seguir}
            </button>
          </div>
        )}
      </div>
    </Painel>
  )
}

type PassoDoMapeamentoProps = {
  arquivo: ArquivoLido
  mapeamento: MapeamentoResolvido
  aoTrocar: (campo: CampoDoLead, coluna: string | null) => void
  aoVoltar: () => void
  aoSeguir: () => void
}

function PassoDoMapeamento({
  arquivo,
  mapeamento,
  aoTrocar,
  aoVoltar,
  aoSeguir,
}: PassoDoMapeamentoProps) {
  const campos = camposMapeados(mapeamento)
  const amostra = amostraDoMapeamento(arquivo.planilha, mapeamento)
  const semDestino = arquivo.planilha.colunas.filter(
    (coluna) => !campos.some((campo) => mapeamento[campo] === coluna),
  )

  const colunas: ColunaDensa<LinhaDaAmostra>[] = [
    {
      titulo: copy.mapeamento.linha,
      classe: 'val',
      conteudo: (linha) => String(linha.numero),
    },
    ...campos.map(
      (campo): ColunaDensa<LinhaDaAmostra> => ({
        titulo: CAMPO_EM_PORTUGUES[campo],
        classe: campo === 'telefone' ? 'val' : undefined,
        conteudo: (linha) => linha.valores[campo] || copy.mapeamento.vazio,
      }),
    ),
  ]

  return (
    <Painel titulo={copy.mapeamento.titulo} apoio={copy.mapeamento.apoio}>
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        {CAMPOS_DO_LEAD.map((campo) => (
          <Seletor
            key={campo}
            rotulo={CAMPO_EM_PORTUGUES[campo]}
            valor={mapeamento[campo] ?? ''}
            aoTrocar={(coluna) => aoTrocar(campo, coluna === '' ? null : coluna)}
          >
            <option value="">{copy.mapeamento.semColuna}</option>
            {arquivo.planilha.colunas.map((coluna) => (
              <option key={coluna} value={coluna}>
                {coluna}
              </option>
            ))}
          </Seletor>
        ))}
      </div>

      {semDestino.length > 0 ? (
        <p className="mt-4 mb-0 text-[12.5px] text-texto-apoio">
          {copy.mapeamento.ignoradas(semDestino)}
        </p>
      ) : null}

      <div className="mt-6">
        <p className="mt-0 mb-2 text-[13px] font-semibold text-texto-secundario">
          {copy.mapeamento.amostra}
        </p>
        <TabelaDensa
          rotulo={copy.mapeamento.amostra}
          colunas={colunas}
          linhas={amostra}
          chaveDaLinha={(linha) => String(linha.numero)}
        />
      </div>

      {!podeVerPrevia(mapeamento) ? (
        <div className="mt-5">
          <CaixaDeErro tom="atencao">{copy.mapeamento.semTelefone}</CaixaDeErro>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={aoSeguir}
          disabled={!podeVerPrevia(mapeamento)}
          className="botao-primario"
        >
          {copy.mapeamento.seguir}
        </button>
        <button type="button" onClick={aoVoltar} className="botao-link">
          {copy.mapeamento.voltar}
        </button>
      </div>
    </Painel>
  )
}

type PassoDaPreviaProps = {
  previa: Extract<RespostaDaPrevia, { ok: true }>
  aoDuplicar: EscolhaDeDuplicata
  aoEscolher: (escolha: EscolhaDeDuplicata) => void
  importando: boolean
  podeEscrever: boolean
  falha: MotivoDaImportacao | undefined
  aoVoltar: () => void
  aoConfirmar: () => void
}

function PassoDaPrevia({
  previa,
  aoDuplicar,
  aoEscolher,
  importando,
  podeEscrever,
  falha,
  aoVoltar,
  aoConfirmar,
}: PassoDaPreviaProps) {
  const numeros = previa.previa
  const grupos = agruparPrevia(numeros)
  // Nada a gravar é a soma que importa: linha válida vira lead novo, e
  // duplicada na base só muda alguma coisa quando a escolha é atualizar. A
  // repetida dentro do arquivo nunca chega ao banco.
  const nadaAImportar = numeros.validos === 0 && numeros.duplicadosNaBase === 0

  return (
    <>
      <Painel titulo={copy.previa.titulo} apoio={copy.previa.semGravar}>
        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <GrupoDaPrevia
            titulo={copy.previa.validos}
            quantas={numeros.validos}
            tom="positivo"
            linhas={grupos.validos}
            descrever={(linha) => linha.lead?.name ?? ''}
            valor={(linha) => linha.lead?.phone_e164 ?? ''}
          />
          <GrupoDaPrevia
            titulo={copy.previa.invalidos}
            quantas={numeros.invalidos}
            tom="perigo"
            linhas={grupos.invalidos}
            descrever={(linha) =>
              linha.recusa === null
                ? ''
                : (previa.frases[linha.recusa.motivo] ?? linha.recusa.motivo)
            }
          />
          <GrupoDaPrevia
            titulo={copy.previa.duplicados}
            quantas={numeros.duplicados}
            tom="atencao"
            linhas={grupos.duplicados}
            descrever={(linha) =>
              linha.primeiraOcorrencia === null
                ? copy.previa.duplicadoNaBase
                : copy.previa.duplicadoNoArquivo(linha.primeiraOcorrencia)
            }
            valor={(linha) => linha.lead?.phone_e164 ?? ''}
          />
        </div>
      </Painel>

      <Painel titulo={copy.previa.decisao} apoio={copy.previa.semCriar}>
        <Seletor
          rotulo={copy.previa.decisao}
          valor={aoDuplicar}
          aoTrocar={(escolha) =>
            aoEscolher(
              ESCOLHAS.find((candidata) => candidata === escolha) ?? 'ignorar',
            )
          }
        >
          {ESCOLHAS.map((escolha) => (
            <option key={escolha} value={escolha}>
              {copy.previa.escolhas[escolha]}
            </option>
          ))}
        </Seletor>
      </Painel>

      {nadaAImportar ? <CaixaDeErro tom="atencao">{copy.previa.nadaAImportar}</CaixaDeErro> : null}
      {falha ? <CaixaDeErro>{copy.falhas[falha]}</CaixaDeErro> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={aoConfirmar}
          disabled={importando || nadaAImportar || !podeEscrever}
          className="botao-primario"
        >
          {importando ? copy.previa.importando : copy.previa.confirmar}
        </button>
        <button type="button" onClick={aoVoltar} className="botao-link">
          {copy.previa.voltar}
        </button>
      </div>
    </>
  )
}

type GrupoDaPreviaProps = {
  titulo: string
  quantas: number
  tom: 'positivo' | 'perigo' | 'atencao'
  linhas: readonly LinhaDaPrevia[]
  /** A frase da linha: o nome do lead ou o motivo da recusa. */
  descrever: (linha: LinhaDaPrevia) => string
  /** O dado que se lê como valor, quando há um. */
  valor?: (linha: LinhaDaPrevia) => string
}

/**
 * Um dos três números do critério de aceite, com a lista embaixo (RF-104).
 *
 * A lista abre com as primeiras e cresce a pedido: novecentas linhas no
 * documento de uma vez não ajudam ninguém a decidir, e escondê-las sem dizer
 * quantas são esconderia o que a tela existe para mostrar.
 */
function GrupoDaPrevia({
  titulo,
  quantas,
  tom,
  linhas,
  descrever,
  valor,
}: GrupoDaPreviaProps) {
  const [inteira, definirInteira] = useState(false)
  const aVista = inteira ? linhas : linhas.slice(0, LIMITE_DA_LISTA)

  return (
    <section aria-label={titulo} className="bloco-secundario">
      <p className="m-0 flex items-center gap-2">
        <span className="valor-de-indicador val">{String(quantas)}</span>
        <Selo tom={tom}>{titulo}</Selo>
      </p>

      <ul className="mt-3 mb-0 flex list-none flex-col gap-1.5 p-0 text-[12.5px]">
        {aVista.map((linha) => (
          <li key={linha.numero} className="text-texto-apoio">
            <span className="val text-texto-secundario">
              {copy.previa.linha(linha.numero)}
            </span>{' '}
            {valor ? <span className="val">{valor(linha)}</span> : null}{' '}
            {descrever(linha)}
          </li>
        ))}
      </ul>

      {linhas.length > LIMITE_DA_LISTA ? (
        <button
          type="button"
          onClick={() => definirInteira((atual) => !atual)}
          className="botao-link mt-2.5"
        >
          {inteira ? copy.previa.verMenos : copy.previa.verTodas(linhas.length)}
        </button>
      ) : null}
    </section>
  )
}

/** O relatório da importação, com a lista de erros para baixar (RF-105). */
function Relatorio({
  resultado,
  dentroDoAssistente,
  aoRecomecar,
}: {
  resultado: ResultadoDaImportacao
  /** Dentro do assistente, a lista de leads tiraria a pessoa do passo. */
  dentroDoAssistente: boolean
  aoRecomecar: () => void
}) {
  const [semDownload, definirSemDownload] = useState(false)
  const { relatorio, frases } = resultado
  const erros = linhasComErro(relatorio, frases)

  function baixar() {
    const conteudo = escreverCsv(copy.relatorio.colunasDoArquivo, erros)
    definirSemDownload(!baixarTexto(copy.relatorio.arquivoDeErros, conteudo))
  }

  return (
    <Painel
      titulo={copy.relatorio.titulo}
      apoio={copy.relatorio.resumo(relatorio.arquivo.nome, relatorio.totalDeLinhas)}
    >
      <div role="status" className="flex flex-wrap gap-2">
        <Selo tom="positivo">
          {copy.relatorio.criados}{' '}
          <span className="val">{String(relatorio.criados)}</span>
        </Selo>
        <Selo tom="neutro">
          {copy.relatorio.ignorados}{' '}
          <span className="val">{String(relatorio.ignorados)}</span>
        </Selo>
        <Selo tom="informacao">
          {copy.relatorio.atualizados}{' '}
          <span className="val">{String(relatorio.atualizados)}</span>
        </Selo>
        <Selo tom={relatorio.erros > 0 ? 'perigo' : 'neutro'}>
          {copy.relatorio.erros}{' '}
          <span className="val">{String(relatorio.erros)}</span>
        </Selo>
      </div>

      {relatorio.semRegistroDeImportacao.length > 0 ? (
        <p className="mt-4 mb-0 text-[12.5px] text-texto-apoio">
          {copy.relatorio.semRegistro(relatorio.semRegistroDeImportacao)}
        </p>
      ) : null}

      {erros.length > 0 ? (
        <div className="mt-5">
          <p className="mt-0 mb-2 text-[13px] font-semibold text-texto-secundario">
            {copy.relatorio.listaDeErros}
          </p>
          <ul
            aria-label={copy.relatorio.listaDeErros}
            className="m-0 flex max-h-72 list-none flex-col gap-1.5 overflow-auto p-0 text-[12.5px] text-texto-apoio"
          >
            {erros.map((linha) => (
              <li key={linha[0]}>
                <span className="val text-texto-secundario">
                  {copy.previa.linha(Number(linha[0]))}
                </span>{' '}
                {linha[1]}
              </li>
            ))}
          </ul>
          <button type="button" onClick={baixar} className="botao-link mt-2.5">
            {copy.relatorio.baixar}
          </button>
          {semDownload ? (
            <p className="mt-2 mb-0 text-[12.5px] text-texto-apoio">
              {copy.relatorio.semDownload}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {dentroDoAssistente ? null : (
          <Link to="/leads" search={BUSCA_LIMPA} className="botao-primario no-underline">
            {copy.relatorio.verLeads}
          </Link>
        )}
        <button type="button" onClick={aoRecomecar} className="botao-link">
          {copy.relatorio.outraPlanilha}
        </button>
      </div>
    </Painel>
  )
}

/** Quem acompanha a conta em leitura abre a tela, e lê por que não importa. */
function NegativaDeLeitura({
  administradores,
}: {
  administradores: readonly Membro[]
}) {
  return (
    <div className="mb-6">
      <CaixaDeErro tom="atencao">
        <p className="m-0 font-medium">{copy.leitura.aviso}</p>
        {administradores.length ? (
          <>
            <p className="mt-2.5 mb-1.5">{copy.leitura.pedirAcesso}</p>
            <ul
              aria-label={copy.leitura.pedirAcesso}
              className="m-0 flex list-none flex-col gap-1 p-0"
            >
              {administradores.map((membro) => (
                <li key={membro.usuarioId}>
                  {membro.nome}{' '}
                  <span className="val text-[12.5px]">{membro.email}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2.5 mb-0">{copy.leitura.semAdministrador}</p>
        )}
      </CaixaDeErro>
    </div>
  )
}

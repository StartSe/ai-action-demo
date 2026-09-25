import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { aceitaAEntrada, MODELOS_PADRAO, type Tarefa } from '@compartilhado/modelo/resolucao.ts'

import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { Carregando } from '@/componentes/carregando'
import { Painel } from '@/componentes/painel'
import { Selo } from '@/componentes/selo'
import { modelo as copy } from '@/copy/modelo'
import { useServicoDaSarah } from '@/sarah/contexto'
import {
  descreverPreco,
  esquecerMarca,
  guardarMarca,
  lerMarcaGuardada,
  TAREFAS_NA_TELA,
} from '@/sarah/modelo'
import { formatarData } from '@/utilidades/datas'

/**
 * A conexão do provedor de modelo, dentro da tela de integrações (US-246).
 *
 * Quatro decisões explicam o desenho:
 *
 * 1. **O cartão diz o que este modelo não é.** Quem chega aqui acabou de
 *    cadastrar a chave do provedor de voz, e confundir os dois é o erro fácil:
 *    durante a ligação quem fala é o agente publicado lá, e o que passa por
 *    aqui é a retaguarda — ler a conversa, sugerir, redigir.
 * 2. **A volta do OAuth é tratada aqui, e não numa rota própria.** O provedor
 *    devolve para esta tela com `code` na barra de endereço; o componente
 *    conclui, limpa a barra e recarrega o estado. Uma rota de retorno separada
 *    seria uma tela em branco que só redireciona.
 * 3. **A escolha do modelo só aparece depois de conectar.** Os identificadores
 *    são do OpenRouter (`anthropic/claude-opus-5`), e sem conexão não há
 *    modelo nenhum: a instalação não tem chave de modelo própria para cair.
 * 4. **"O padrão do código" é uma opção de verdade**, e é o padrão.
 *    Quem não escolhe acompanha a troca de padrão em vez de congelar a do dia.
 */
export function ProvedorDeModelo({
  codigoDaVolta,
  estadoDaVolta,
  aoConcluirVolta,
}: {
  /** O `code` que o provedor devolveu na barra de endereço, quando houve. */
  codigoDaVolta?: string
  estadoDaVolta?: string
  /** Chamado depois de concluir, para a tela limpar a barra de endereço. */
  aoConcluirVolta?: () => void
}) {
  const servico = useServicoDaSarah()
  const [emCurso, setEmCurso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  /**
   * A volta que já foi concluída. Guardar o código tratado, em vez de escrever
   * "concluindo" no estado assim que o efeito roda, evita a escrita síncrona
   * dentro do efeito — que dispara renderização em cascata — e ainda garante
   * que o mesmo código não seja trocado duas vezes: ele vale uma vez só.
   */
  const [voltaTratada, setVoltaTratada] = useState<string | null>(null)

  const estado = useQuery({
    queryKey: ['modelo-da-sarah'],
    queryFn: () => servico.carregarModelo(),
  })

  const conectado = estado.data?.ok === true && estado.data.estado.porta === 'openrouter'

  const catalogo = useQuery({
    queryKey: ['catalogo-de-modelos'],
    queryFn: () => servico.carregarCatalogoDeModelos(),
    // Só depois de conectar: o catálogo é do provedor da conta, e pedi-lo sem
    // conexão gastaria uma ida para oferecer uma escolha que não vale.
    enabled: conectado,
  })

  // A volta do OAuth. Roda uma vez por código: o efeito depende dele, e
  // `aoConcluirVolta` limpa a barra de endereço logo em seguida.
  const marca = estadoDaVolta ?? lerMarcaGuardada()
  const concluindoVolta = Boolean(codigoDaVolta) && voltaTratada !== codigoDaVolta

  useEffect(() => {
    if (!codigoDaVolta) return
    let ativo = true

    // Código sem marca nenhuma: nem o provedor a devolveu, nem o navegador a
    // tinha. Dizer isso é melhor do que ficar parado — foi assim que a tela
    // não deu feedback nenhum antes desta guarda existir.
    //
    // A recusa entra por uma promessa já resolvida, e não direto: escrever o
    // estado dentro do corpo do efeito dispara renderização em cascata, e o
    // lint recusa com razão.
    const passo = marca
      ? servico.concluirConexaoDoModelo(codigoDaVolta, marca)
      : Promise.resolve({ ok: false as const, mensagem: copy.voltaSemMarca })

    void passo.then((resultado) => {
      if (!ativo) return
      setVoltaTratada(codigoDaVolta)
      esquecerMarca()
      if (resultado.ok) {
        setAviso(copy.conectado_agora)
        void estado.refetch()
      } else {
        setErro(resultado.mensagem)
      }
      aoConcluirVolta?.()
    })
    return () => {
      ativo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoDaVolta, marca])

  async function conectar() {
    setEmCurso(copy.conectando)
    setErro(null)
    setAviso(null)
    // O retorno é esta tela, com o caminho que o navegador já tem: a borda o
    // confere contra as origens da instalação antes de gravar estado nenhum.
    const retorno = `${window.location.origin}${window.location.pathname}`
    const resultado = await servico.iniciarConexaoDoModelo(retorno)
    if (!resultado.ok) {
      setEmCurso(null)
      setErro(resultado.mensagem)
      return
    }
    // A marca sai da própria URL que a borda montou e fica no navegador até a
    // volta. O provedor documenta que devolve `state`, mas não garante: sem
    // esta cópia, uma volta sem ele não teria como dizer de qual conta é o
    // código, e a tela ficaria parada sem dizer nada. O segredo do PKCE não
    // passa por aqui — ele continua só no servidor.
    guardarMarca(resultado.url)
    window.location.assign(resultado.url)
  }

  async function desconectar() {
    setEmCurso(copy.desconectando)
    setErro(null)
    setAviso(null)
    const resultado = await servico.desconectarModelo()
    setEmCurso(null)
    if (resultado.ok) {
      setAviso(copy.desconectado)
      void estado.refetch()
    } else {
      setErro(resultado.mensagem)
    }
  }

  async function escolher(tarefa: Tarefa, valor: string) {
    setEmCurso(copy.salvandoEscolha)
    setErro(null)
    const resultado = await servico.escolherModelo(tarefa, valor === '' ? null : valor)
    setEmCurso(null)
    if (resultado.ok) {
      setAviso(copy.escolhaSalva)
      void estado.refetch()
    } else {
      setErro(resultado.mensagem)
    }
  }

  const carga = estado.data

  return (
    <Painel
      id="modelo"
      rotulo={copy.titulo}
      titulo={copy.titulo}
      apoio={copy.apoio}
      estado={
        carga?.ok ? (
          <Selo tom={conectado ? 'positivo' : 'neutro'}>
            {conectado ? copy.estados.conectado : copy.estados.naoConectado}
          </Selo>
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        {erro ? <CaixaDeErro>{erro}</CaixaDeErro> : null}
        {aviso ? (
          <p role="status" className="bloco-secundario m-0 px-4 py-3 text-[13.5px]">
            {aviso}
          </p>
        ) : null}

        {estado.isPending ? <Carregando texto={copy.carregando} /> : null}

        {carga?.ok === false ? <CaixaDeErro>{copy.falha}</CaixaDeErro> : null}

        {/* O botão aparece também quando a leitura falhou. Uma tela que só
            informa a falha deixa quem chegou aqui sem saída, e conectar é
            justamente o que resolve — reconectar troca a credencial, não
            recomeça a configuração. */}
        {carga && !conectado ? (
          <>
            <p className="m-0 text-[13.5px] text-texto-apoio">{copy.naoConectado.explicacao}</p>
            <div>
              <button
                type="button"
                className="botao-primario"
                disabled={emCurso !== null || concluindoVolta}
                onClick={() => void conectar()}
              >
                {copy.conectar}
              </button>
            </div>
          </>
        ) : null}

        {carga?.ok && conectado ? (
          <>
            <p className="m-0 text-[13px] text-texto-apoio">
              {carga.estado.finalDaChave ? copy.conectado.chave(carga.estado.finalDaChave) : null}
              {carga.estado.finalDaChave && carga.estado.conectadoEm ? ' · ' : null}
              {carga.estado.conectadoEm
                ? copy.conectado.desde(formatarData(carga.estado.conectadoEm))
                : null}
            </p>

            <div className="flex flex-col gap-4">
              {TAREFAS_NA_TELA.map((tarefa) => (
                <EscolhaDaTarefa
                  key={tarefa}
                  tarefa={tarefa}
                  valor={carga.estado.escolhas[tarefa] ?? ''}
                  // O padrão da porta em que a conta está. A tela só mostra os
                  // seletores conectada, então é sempre o do provedor dela.
                  padrao={MODELOS_PADRAO.openrouter[tarefa]}
                  // Só os modelos que aceitam a entrada da tarefa: áudio para
                  // quem ouve, imagem para quem vê.
                  modelos={
                    catalogo.data?.ok
                      ? catalogo.data.modelos.filter((modelo) => aceitaAEntrada(modelo.entradas, tarefa))
                      : []
                  }
                  carregando={catalogo.isPending}
                  desabilitado={emCurso !== null || concluindoVolta}
                  aoEscolher={(valor) => void escolher(tarefa, valor)}
                />
              ))}
            </div>

            <div>
              <button
                type="button"
                className="botao-secundario"
                disabled={emCurso !== null || concluindoVolta}
                onClick={() => void desconectar()}
              >
                {copy.desconectar}
              </button>
            </div>
          </>
        ) : null}

        {emCurso ?? (concluindoVolta ? copy.concluindo : null) ? (
          <p role="status" className="m-0 text-[13px] text-texto-apoio">
            {emCurso ?? copy.concluindo}
          </p>
        ) : null}
      </div>
    </Painel>
  )
}

/** Uma linha da lista: nome, contexto e preço, no que houver. */
function rotuloDoModelo(item: ModeloNaLista): string {
  const partes = [item.nome]
  if (item.contexto) partes.push(copy.contextoDoModelo(item.contexto))
  const preco = descreverPreco(item.precoDeEntrada, item.precoDeSaida)
  if (preco) partes.push(preco)
  return partes.join(' · ')
}

interface ModeloNaLista {
  id: string
  nome: string
  contexto: number | null
  precoDeEntrada: string | null
  precoDeSaida: string | null
}

function EscolhaDaTarefa({
  tarefa,
  valor,
  padrao,
  modelos,
  carregando,
  desabilitado,
  aoEscolher,
}: {
  tarefa: Tarefa
  valor: string
  /** O modelo que vale quando a conta não escolheu. */
  padrao: string
  modelos: readonly ModeloNaLista[]
  carregando: boolean
  desabilitado: boolean
  aoEscolher: (valor: string) => void
}) {
  // O padrão aparece pelo nome, e não como "o escolhido pela plataforma": quem
  // abre esta tela quer saber com qual modelo a conta está falando.
  const doPadrao = modelos.find((item) => item.id === padrao)
  const rotuloDoPadrao = doPadrao
    ? copy.padrao(rotuloDoModelo(doPadrao))
    : copy.padraoSemNome(padrao)

  return (
    <div className="flex flex-col gap-1.5 border-l-2 border-menta/40 pl-4">
      <label className="text-[13px] font-semibold" htmlFor={`modelo-${tarefa}`}>
        {copy.tarefas[tarefa]}
      </label>
      <p className="m-0 text-[12.5px] text-texto-apoio">{copy.explicacaoDaTarefa[tarefa]}</p>
      <select
        id={`modelo-${tarefa}`}
        className="campo"
        value={valor}
        disabled={desabilitado}
        onChange={(evento) => aoEscolher(evento.target.value)}
      >
        {/* Opção de verdade, e a primeira: quem não escolhe acompanha a troca
            de padrão em vez de congelar a do dia em que escolheu. O rótulo
            nomeia o modelo que vale hoje, para a tela nunca esconder com quem
            a conta está falando. */}
        <option value="">{rotuloDoPadrao}</option>
        {/* O modelo escolhido entra mesmo quando não está na lista: o catálogo
            chega depois da carga, e o provedor pode ter tirado um modelo dela.
            Sem esta opção o select cairia no padrão e mostraria à conta uma
            escolha que ela não fez. */}
        {valor !== '' && !modelos.some((item) => item.id === valor) ? (
          <option value={valor}>{valor}</option>
        ) : null}
        {modelos.map((item) => (
          <option key={item.id} value={item.id}>
            {rotuloDoModelo(item)}
          </option>
        ))}
      </select>
      {carregando ? (
        <p className="m-0 text-[12px] text-texto-desativado">{copy.carregandoCatalogo}</p>
      ) : (
        // A ordem dos dois preços fica aqui, e não em cada linha: repeti-la em
        // toda opção dobraria o comprimento de cada uma para dizer o mesmo.
        <p className="m-0 text-[12px] text-texto-desativado">{copy.legendaDoPreco}</p>
      )}
    </div>
  )
}

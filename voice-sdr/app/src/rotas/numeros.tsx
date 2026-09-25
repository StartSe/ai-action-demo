import { useQuery } from '@tanstack/react-query'
import { useId, useState, type FormEvent, type ReactNode } from 'react'

import {
  AreaDeTrabalho,
  type PropsDeTelaEmbutivel,
} from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { Dialogo } from '@/componentes/dialogo'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { LinhaDeCampos } from '@/componentes/linha-de-campos'
import { NegativaPorPapel } from '@/componentes/negativa-por-papel'
import { Painel } from '@/componentes/painel'
import { Selo, type TomDoSelo } from '@/componentes/selo'
import { equipe as copyDaEquipe } from '@/copy/equipe'
import { COMPORTAMENTO_DE_ENTRADA, numeros as copy } from '@/copy/numeros'
import { useServicoDeEquipe } from '@/equipe/contexto'
import { podeAdministrarNumeros, quemConcedeAcesso } from '@/equipe/papeis'
import { useServicoDeNumeros } from '@/numeros/contexto'
import {
  CADASTRO_EM_BRANCO,
  estadoDaLinha,
  leituraDaSaude,
  validarCadastro,
  type CamposDoCadastro,
  type EstadoDaLinha,
  type RecusasDoCadastro,
} from '@/numeros/linhas'
import {
  COMPORTAMENTOS,
  type LinhaTelefonica,
  type MotivoDeFalhaDeNumeros,
  type MudancaDaLinha,
  type ResultadoDoRegistro,
  type ServicoDeNumeros,
} from '@/numeros/tipos'

const CHAVE = ['numeros'] as const

/** O papel de quem olha vem da mesma carga da tela de equipe, e da mesma chave. */
const CHAVE_DA_EQUIPE = ['equipe'] as const

const TOM_DO_ESTADO: Record<EstadoDaLinha, TomDoSelo> = {
  ativa: 'positivo',
  // Âmbar e não vermelho: a espera da operadora é estado normal (P-04), e a
  // cor de erro mandaria agir sobre o que não depende de ninguém daqui.
  aguardando_operadora: 'atencao',
  desligada: 'neutro',
}

/** O último registro pedido nesta aba, para o cartão da linha dizer como foi. */
interface RegistroDaLinha {
  linhaId: string
  resultado: ResultadoDoRegistro
}

/**
 * `/numeros`: as linhas por onde a Sarah liga e atende (RF-409, RF-709).
 *
 * Três decisões explicam o desenho:
 *
 * 1. **Aguardar a operadora é estado normal.** O pacote regulatório leva dias
 *    (P-04), e a linha aparece na lista desde o cadastro, com o selo da espera
 *    e a explicação. Tratar como erro faria a conta parar de configurar o
 *    resto enquanto espera um terceiro.
 * 2. **Encaminhar exige destino no mesmo formulário.** O campo aparece com a
 *    escolha e a recusa vem antes da ida ao servidor: comportamento que aponta
 *    para lugar nenhum é configuração morta.
 * 3. **Saúde é medida e não se edita.** Em F2 ela nasce vazia, porque quem a
 *    escreve é `cron-line-health` (F7), e a tela diz "ainda sem histórico" em
 *    vez de zero: zero de atendimento é linha queimada, não linha nova.
 */
export function TelaDeNumeros({
  dentroDoAssistente = false,
}: PropsDeTelaEmbutivel) {
  const servico = useServicoDeNumeros()
  const servicoDeEquipe = useServicoDeEquipe()

  const [cadastrando, definirCadastrando] = useState(false)
  const [registro, definirRegistro] = useState<RegistroDaLinha | null>(null)
  // Sobrevive ao cartão, que some quando a lista recarrega: quem excluiu
  // precisa saber que falta desfazer o apontamento no provedor.
  const [avisoDoProvedor, definirAvisoDoProvedor] = useState(false)

  const consulta = useQuery({
    queryKey: CHAVE,
    queryFn: () => servico.carregar(),
  })

  const equipe = useQuery({
    queryKey: CHAVE_DA_EQUIPE,
    queryFn: () => servicoDeEquipe.carregar(),
  })

  if (consulta.isPending || equipe.isPending) {
    return (
      <Moldura embutida={dentroDoAssistente}>
        <Carregando texto={copy.carregando} />
      </Moldura>
    )
  }

  const carga = consulta.data

  if (!carga?.ok) {
    return (
      <Moldura embutida={dentroDoAssistente}>
        <CaixaDeErro>
          {copy.falhas[carga?.motivo ?? 'falha-de-comunicacao']}
        </CaixaDeErro>
      </Moldura>
    )
  }

  const cargaDaEquipe = equipe.data
  // Equipe que não carregou não libera escrita: a política decide de verdade,
  // e oferecer o formulário para receber a recusa dela no meio do caminho
  // trocaria uma negativa explicada por um erro sem saída.
  const papel = cargaDaEquipe?.ok ? cargaDaEquipe.equipe.papelDoUsuario : null
  const podeEscrever = papel !== null && podeAdministrarNumeros(papel)
  const administradores = cargaDaEquipe?.ok
    ? quemConcedeAcesso(cargaDaEquipe.equipe.membros)
    : []

  const { linhas } = carga

  return (
    <Moldura
      embutida={dentroDoAssistente}
      acoes={
        podeEscrever && !cadastrando ? (
          <button
            type="button"
            className="botao-primario"
            onClick={() => definirCadastrando(true)}
          >
            {copy.cadastrar.abrir}
          </button>
        ) : null
      }
    >
      <div className="flex flex-col gap-5">
        {papel !== null && !podeEscrever ? (
          <NegativaPorPapel
            aviso={copy.leitura.aviso}
            administradores={administradores}
          />
        ) : null}

        {cargaDaEquipe && !cargaDaEquipe.ok ? (
          <CaixaDeErro>{copyDaEquipe.falhas[cargaDaEquipe.motivo]}</CaixaDeErro>
        ) : null}

        {cadastrando ? (
          <FormularioDeCadastro
            servico={servico}
            aoCancelar={() => definirCadastrando(false)}
            aoCadastrar={(linhaId, resultado) => {
              definirCadastrando(false)
              definirRegistro({ linhaId, resultado })
              void consulta.refetch()
            }}
          />
        ) : null}

        {linhas.length === 0 && !cadastrando ? (
          <EstadoVazio
            titulo={copy.vazio.titulo}
            explicacao={copy.vazio.explicacao}
            {...(dentroDoAssistente
              ? {}
              : {
                  acao: {
                    rotulo: copy.vazio.irParaConfiguracao,
                    endereco: '/configuracao-inicial',
                  },
                })}
          />
        ) : null}

        {avisoDoProvedor ? (
          <p role="status" className="m-0 text-[13px] text-atencao">
            {copy.excluir.aindaNoProvedor}
          </p>
        ) : null}

        {linhas.map((linha) => (
          <CartaoDaLinha
            key={linha.id}
            servico={servico}
            linha={linha}
            podeEscrever={podeEscrever}
            registro={registro?.linhaId === linha.id ? registro.resultado : null}
            aoExcluir={definirAvisoDoProvedor}
            aoRegistrar={(resultado) =>
              definirRegistro({ linhaId: linha.id, resultado })
            }
            aoMudar={() => void consulta.refetch()}
          />
        ))}
      </div>
    </Moldura>
  )
}

function Moldura({
  embutida,
  acoes,
  children,
}: {
  embutida: boolean
  acoes?: ReactNode
  children: ReactNode
}) {
  return (
    <AreaDeTrabalho
      titulo={copy.titulo}
      lead={copy.explicacao}
      acoes={acoes}
      embutida={embutida}
    >
      {children}
    </AreaDeTrabalho>
  )
}

type FormularioDeCadastroProps = {
  servico: ServicoDeNumeros
  aoCancelar: () => void
  aoCadastrar: (linhaId: string, resultado: ResultadoDoRegistro) => void
}

function FormularioDeCadastro({
  servico,
  aoCancelar,
  aoCadastrar,
}: FormularioDeCadastroProps) {
  const [campos, definirCampos] = useState<CamposDoCadastro>(CADASTRO_EM_BRANCO)
  const [recusas, definirRecusas] = useState<RecusasDoCadastro>({})
  const [falha, definirFalha] = useState<MotivoDeFalhaDeNumeros | null>(null)
  const [gravando, definirGravando] = useState(false)
  const idDoGrupo = useId()

  function mudar(mudanca: Partial<CamposDoCadastro>) {
    definirCampos((atual) => ({ ...atual, ...mudanca }))
    definirFalha(null)
  }

  async function gravar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    const validado = validarCadastro(campos)
    if (!validado.ok) {
      definirRecusas(validado.recusas)
      return
    }

    definirRecusas({})
    definirGravando(true)
    const resultado = await servico.cadastrar(validado.dados)
    definirGravando(false)

    if (!resultado.ok) {
      definirFalha(resultado.motivo)
      return
    }

    aoCadastrar(resultado.linha.id, resultado.registro)
  }

  return (
    <Painel titulo={copy.cadastrar.titulo} apoio={copy.cadastrar.apoio}>
      <form onSubmit={gravar} noValidate className="flex flex-col gap-4">
        <LinhaDeCampos>
          <CampoDeTexto
            rotulo={copy.cadastrar.numero}
            exemplo={copy.cadastrar.numeroExemplo}
            name="numero"
            inputMode="tel"
            autoComplete="off"
            value={campos.numero}
            erro={
              recusas.numero
                ? copy.cadastrar.recusas.numero[recusas.numero]
                : undefined
            }
            onChange={(evento) => mudar({ numero: evento.target.value })}
          />
          <CampoDeTexto
            rotulo={copy.cadastrar.rotulo}
            exemplo={copy.cadastrar.rotuloExemplo}
            name="rotulo"
            autoComplete="off"
            value={campos.rotulo}
            erro={recusas.rotulo ? copy.cadastrar.recusas.rotulo : undefined}
            onChange={(evento) => mudar({ rotulo: evento.target.value })}
          />
        </LinhaDeCampos>
        <p className="m-0 -mt-2 text-[12.5px] text-texto-apoio">
          {copy.cadastrar.rotuloExplicacao}
        </p>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[13px] font-semibold">
            {copy.cadastrar.comportamento}
          </legend>
          {COMPORTAMENTOS.map((comportamento) => {
            const texto = COMPORTAMENTO_DE_ENTRADA[comportamento]
            const id = `${idDoGrupo}-${comportamento}`
            return (
              <div
                key={comportamento}
                className="bloco-secundario flex gap-3 py-2.5 transition-colors duration-150 has-checked:border-acento/60 has-checked:bg-acento-repouso"
              >
                <input
                  type="radio"
                  id={id}
                  name="comportamento"
                  value={comportamento}
                  checked={campos.comportamento === comportamento}
                  aria-describedby={`${id}-consequencia`}
                  onChange={() => mudar({ comportamento })}
                  className="mt-1"
                />
                <div className="min-w-0">
                  <label htmlFor={id} className="cursor-pointer text-[13.5px] font-semibold text-texto-principal">
                    {texto.rotulo}
                  </label>
                  <p
                    id={`${id}-consequencia`}
                    className="m-0 text-[12.5px] text-texto-apoio"
                  >
                    {texto.consequencia}
                  </p>
                </div>
              </div>
            )
          })}
        </fieldset>

        {campos.comportamento === 'forward' ? (
          <CampoDeTexto
            rotulo={copy.cadastrar.destino}
            exemplo={copy.cadastrar.destinoExemplo}
            name="destino"
            inputMode="tel"
            autoComplete="off"
            value={campos.destino}
            erro={
              recusas.destino
                ? copy.cadastrar.recusas.destino[recusas.destino]
                : undefined
            }
            onChange={(evento) => mudar({ destino: evento.target.value })}
          />
        ) : null}

        {falha ? <CaixaDeErro>{copy.falhas[falha]}</CaixaDeErro> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={gravando} className="botao-primario">
            {gravando ? copy.cadastrar.gravando : copy.cadastrar.gravar}
          </button>
          <button
            type="button"
            className="botao-fantasma"
            disabled={gravando}
            onClick={aoCancelar}
          >
            {copy.cadastrar.cancelar}
          </button>
        </div>
      </form>
    </Painel>
  )
}

type CartaoDaLinhaProps = {
  servico: ServicoDeNumeros
  linha: LinhaTelefonica
  podeEscrever: boolean
  registro: ResultadoDoRegistro | null
  aoRegistrar: (resultado: ResultadoDoRegistro) => void
  aoMudar: () => void
  /** Recebe se o número continuou apontando para cá no provedor. */
  aoExcluir: (aindaNoProvedor: boolean) => void
}

function CartaoDaLinha({
  servico,
  linha,
  podeEscrever,
  registro,
  aoRegistrar,
  aoMudar,
  aoExcluir,
}: CartaoDaLinhaProps) {
  const [salvando, definirSalvando] = useState(false)
  const [registrando, definirRegistrando] = useState(false)
  const [excluindo, definirExcluindo] = useState(false)
  const [confirmandoExclusao, definirConfirmandoExclusao] = useState(false)
  const [falha, definirFalha] = useState<MotivoDeFalhaDeNumeros | null>(null)

  const estado = estadoDaLinha(linha)
  const saude = leituraDaSaude(linha.saude)
  const entrada = COMPORTAMENTO_DE_ENTRADA[linha.comportamento]

  async function mudar(mudanca: MudancaDaLinha) {
    definirSalvando(true)
    definirFalha(null)
    const resultado = await servico.alterar(linha.id, mudanca)
    definirSalvando(false)
    if (!resultado.ok) {
      definirFalha(resultado.motivo)
      return
    }
    aoMudar()
  }

  async function registrarDeNovo() {
    definirRegistrando(true)
    const resultado = await servico.registrarDeNovo(linha.id)
    definirRegistrando(false)
    aoRegistrar(resultado)
    aoMudar()
  }

  async function excluir() {
    definirExcluindo(true)
    const resultado = await servico.excluir(linha.id)
    definirExcluindo(false)

    if (!resultado.ok) {
      definirConfirmandoExclusao(false)
      definirFalha(resultado.motivo)
      return
    }

    // O aviso sobre o provedor sobrevive ao cartão, que some com a recarga da
    // lista: quem excluiu precisa saber que falta um passo do outro lado.
    aoExcluir(resultado.aindaNoProvedor)
    definirConfirmandoExclusao(false)
    aoMudar()
  }

  return (
    <Painel
      rotulo={linha.rotulo}
      titulo={linha.rotulo}
      estado={<Selo tom={TOM_DO_ESTADO[estado]}>{copy.estados[estado]}</Selo>}
    >
      <div className="flex flex-col gap-4">
        {estado === 'aguardando_operadora' ? (
          <p className="m-0 text-[13px] text-texto-apoio">
            {copy.aguardandoExplicacao}
          </p>
        ) : null}
        {estado === 'desligada' ? (
          <p className="m-0 text-[13px] text-texto-apoio">
            {copy.desligadaExplicacao}
          </p>
        ) : null}

        {registro ? (
          <AvisoDoRegistro
            resultado={registro}
            podeEscrever={podeEscrever}
            registrando={registrando}
            aoRegistrarDeNovo={registrarDeNovo}
          />
        ) : null}

        {podeEscrever ? (
          <>
            <button
              type="button"
              className="botao-link self-start text-perigo"
              onClick={() => definirConfirmandoExclusao(true)}
            >
              {copy.excluir.acao}
            </button>

            {confirmandoExclusao ? (
              <Dialogo
                titulo={copy.excluir.titulo}
                explicacao={copy.excluir.explicacao}
                confirmar={excluindo ? copy.excluir.excluindo : copy.excluir.confirmar}
                cancelar={copy.excluir.cancelar}
                tom="perigo"
                ocupado={excluindo}
                aoConfirmar={() => void excluir()}
                aoCancelar={() => definirConfirmandoExclusao(false)}
              />
            ) : null}
          </>
        ) : null}

        <dl className="m-0 grid grid-cols-[minmax(0,180px)_1fr] gap-x-4 gap-y-2.5 text-[13.5px] max-md:grid-cols-1">
          <Dado titulo={copy.cartao.numero}>
            <span className="val">{linha.e164}</span>
          </Dado>
          <Dado titulo={copy.cartao.provedor}>{linha.provedor}</Dado>
          <Dado titulo={copy.cartao.entrada}>
            <span className="font-medium">{entrada.rotulo}</span>
            <span className="block text-[12.5px] text-texto-apoio">
              {entrada.consequencia}
            </span>
          </Dado>
          {linha.comportamento === 'forward' && linha.encaminharPara ? (
            <Dado titulo={copy.cartao.destino}>
              <span className="val">{linha.encaminharPara}</span>
            </Dado>
          ) : null}
          <Dado titulo={copy.cartao.teto}>
            <span className="val">{copy.cartao.tetoValor(linha.tetoDiario)}</span>
          </Dado>
          <Dado titulo={copy.cartao.saude}>
            <span className={saude.medida ? 'val' : 'text-texto-apoio'}>
              {saude.medida
                ? copy.cartao.saudeValor(saude.taxaDeAtendimento, saude.tentativas)
                : copy.cartao.semHistorico}
            </span>
            <span className="block text-[12.5px] text-texto-apoio">
              {copy.cartao.saudeExplicacao}
            </span>
          </Dado>
        </dl>

        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <Alternador
            rotulo={copy.cartao.saida}
            ligado={linha.saidaLigada}
            efeito={
              linha.saidaLigada
                ? copy.cartao.saidaLigada
                : copy.cartao.saidaDesligada
            }
            desabilitado={!podeEscrever || salvando}
            aoAlternar={(valor) => void mudar({ saidaLigada: valor })}
          />
          <Alternador
            rotulo={copy.cartao.rodizio}
            ligado={linha.noRodizio}
            efeito={
              linha.noRodizio
                ? copy.cartao.rodizioLigado
                : copy.cartao.rodizioDesligado
            }
            desabilitado={!podeEscrever || salvando}
            aoAlternar={(valor) => void mudar({ noRodizio: valor })}
          />
        </div>

        {falha ? <CaixaDeErro>{copy.falhas[falha]}</CaixaDeErro> : null}
      </div>
    </Painel>
  )
}

function Dado({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <>
      <dt className="rotulo-de-indicador">{titulo}</dt>
      <dd className="m-0 min-w-0 text-texto-principal">{children}</dd>
    </>
  )
}

function Alternador({
  rotulo,
  ligado,
  efeito,
  desabilitado,
  aoAlternar,
}: {
  rotulo: string
  ligado: boolean
  efeito: string
  desabilitado: boolean
  aoAlternar: (valor: boolean) => void
}) {
  const id = useId()
  return (
    <div className="bloco-secundario flex items-start gap-3 py-2.5">
      {/* O `switch` do design system: a caixa de marcar continua sendo caixa de
          marcar para quem lê a tela, só o desenho muda. Ligado é menta. */}
      <input
        type="checkbox"
        id={id}
        checked={ligado}
        disabled={desabilitado}
        aria-describedby={`${id}-efeito`}
        onChange={(evento) => aoAlternar(evento.target.checked)}
        className="relative mt-0.5 h-[22px] w-[38px] shrink-0 cursor-pointer appearance-none rounded-selo border border-borda-controle bg-superficie-funda transition-colors duration-200 before:absolute before:top-[2px] before:left-[2px] before:h-4 before:w-4 before:rounded-full before:bg-texto-desativado before:transition-[left,background-color] before:duration-200 before:content-[''] checked:border-menta/45 checked:bg-menta/20 checked:before:left-[18px] checked:before:bg-menta-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-menta-2 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none motion-reduce:before:transition-none"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-[13.5px] font-semibold text-texto-principal">
          {rotulo}
        </label>
        <p id={`${id}-efeito`} className="m-0 text-[12.5px] text-texto-apoio">
          {efeito}
        </p>
      </div>
    </div>
  )
}

function AvisoDoRegistro({
  resultado,
  podeEscrever,
  registrando,
  aoRegistrarDeNovo,
}: {
  resultado: ResultadoDoRegistro
  podeEscrever: boolean
  registrando: boolean
  aoRegistrarDeNovo: () => void
}) {
  if (resultado.estado === 'registrada') {
    return (
      <p role="status" className="m-0 flex items-center gap-2 text-[13px] font-semibold text-positivo">
        <span aria-hidden="true" className="ao-vivo" />
        {copy.registro.registrada}
      </p>
    )
  }

  if (resultado.estado === 'aguardando_operadora') {
    return (
      <p
        role="status"
        className="m-0 rounded-controle border border-atencao-borda bg-atencao-fundo px-3.5 py-2.5 text-[13px] text-texto-secundario"
      >
        {copy.registro.aguardando}
      </p>
    )
  }

  return (
    <CaixaDeErro>
      <p className="m-0">{copy.registro.naoRegistrada}</p>
      {resultado.mensagem ? (
        <p className="mt-1.5 mb-0">{resultado.mensagem}</p>
      ) : null}
      {podeEscrever ? (
        <button
          type="button"
          className="botao-secundario mt-3"
          disabled={registrando}
          onClick={aoRegistrarDeNovo}
        >
          {registrando ? copy.registro.registrando : copy.registro.registrarDeNovo}
        </button>
      ) : null}
    </CaixaDeErro>
  )
}

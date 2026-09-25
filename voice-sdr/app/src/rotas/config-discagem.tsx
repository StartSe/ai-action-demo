import { useQuery } from '@tanstack/react-query'
import { useId, useState, type FormEvent, type ReactNode } from 'react'

import {
  AreaDeTrabalho,
  type PropsDeTelaEmbutivel,
} from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { LinhaDeCampos } from '@/componentes/linha-de-campos'
import { Painel } from '@/componentes/painel'
import { discagem as copy } from '@/copy/discagem'
import { equipe as copyDaEquipe } from '@/copy/equipe'
import { useServicoDeDiscagem } from '@/discagem/contexto'
import {
  camposMudados,
  DIAS_NA_ORDEM,
  FAIXAS,
  janelaValidaDoRascunho,
  limiteDeSimultaneidade,
  mudancasDe,
  previaDaJanela,
  rascunhoDe,
  validarPolitica,
  type ErrosDaPolitica,
  type FaixaDoRascunho,
  type LimiteDeSimultaneidade,
  type MotivoDoCampo,
  type RascunhoDaPolitica,
} from '@/discagem/politica'
import type {
  CampoDaPolitica,
  MotivoDeFalhaDaDiscagem,
  PoliticaDeDiscagem,
} from '@/discagem/tipos'
import { AutomacaoDaDiscagem } from '@/componentes/automacao-da-conta'
import { EstadoDoPortao } from '@/componentes/estado-do-portao'
import { NumerosDeTeste } from '@/componentes/numeros-de-teste'
import { LigacaoAoLeadNovo } from '@/discagem/ligacao-ao-lead-novo'
import { useServicoDeEquipe } from '@/equipe/contexto'
import {
  podeDefinirPoliticaDeDiscagem,
  quemConcedeAcesso,
} from '@/equipe/papeis'
import { useServicoDeIntegracoes } from '@/integracoes/contexto'
import type { Integracao } from '@/integracoes/tipos'
import { useServicoDaSarah } from '@/sarah/contexto'

// O papel de quem olha vem da mesma carga da tela de equipe, e por isso da
// mesma chave: é o mesmo recurso, e quem já abriu a equipe não busca de novo.
const CHAVE_DA_EQUIPE = ['equipe'] as const
const CHAVE_DA_POLITICA = ['politica-de-discagem'] as const
// A mesma chave de `/config/integracoes`: os limites de simultaneidade saem da
// mesma resposta de `integrations-status` que desenha os cartões (L-20).
const CHAVE_DAS_INTEGRACOES = ['integracoes'] as const

export function TelaDePoliticaDeDiscagem({
  dentroDoAssistente = false,
}: PropsDeTelaEmbutivel) {
  const servico = useServicoDeEquipe()

  const consulta = useQuery({
    queryKey: CHAVE_DA_EQUIPE,
    queryFn: () => servico.carregar(),
  })

  if (consulta.isPending) {
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
          {copyDaEquipe.falhas[carga?.motivo ?? 'falha-de-comunicacao']}
        </CaixaDeErro>
      </Moldura>
    )
  }

  // A negativa é explícita: quem não pode definir a política não vê versão em
  // leitura dela, vê o motivo e a quem pedir. O portão e a lista de teste
  // continuam à vista, em leitura, porque são eles que explicam a recusa que
  // o discador dá a quem opera.
  if (!podeDefinirPoliticaDeDiscagem(carga.equipe.papelDoUsuario)) {
    const administradores = quemConcedeAcesso(carga.equipe.membros)

    return (
      <Moldura embutida={dentroDoAssistente}>
        <CaixaDeErro tom="atencao">
          <p className="m-0 font-medium">{copy.negativa.aviso}</p>
          {administradores.length ? (
            <>
              <p className="mt-3 mb-1.5">{copy.negativa.pedirAcesso}</p>
              <ul
                aria-label={copy.negativa.pedirAcesso}
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
            <p className="mt-3 mb-0">{copy.negativa.semAdministrador}</p>
          )}
        </CaixaDeErro>
        <div className="mt-7">
          <EstadoDoPortao />
          <NumerosDeTeste podeEditar={false} />
        </div>
      </Moldura>
    )
  }

  return (
    <Moldura embutida={dentroDoAssistente}>
      {/* O portão e os números de teste vêm antes da política: quem chega
          aqui pelo painel veio saber por que a ligação não sai, cadastrar o
          próprio número e fazer a primeira ligação, não ajustar janela e
          teto. */}
      <EstadoDoPortao />
      <NumerosDeTeste podeEditar />
      <PoliticaDaConta />
      <LigacaoAoLeadNovo />
      <AutomacaoDaDiscagem />
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

/** Os quatro estados: carregando, falha, vazio e a política. */
function PoliticaDaConta() {
  const servico = useServicoDeDiscagem()
  const integracoes = useServicoDeIntegracoes()

  const consulta = useQuery({
    queryKey: CHAVE_DA_POLITICA,
    queryFn: () => servico.carregar(),
  })

  // Falha aqui não trava a tela: sem os limites, a simultaneidade aceita até o
  // check da coluna e diz que não conferiu.
  const limites = useQuery({
    queryKey: CHAVE_DAS_INTEGRACOES,
    queryFn: () => integracoes.carregar(),
  })

  if (consulta.isPending) return <Carregando texto={copy.carregando} />

  const carga = consulta.data
  if (!carga?.ok) {
    return <CaixaDeErro>{copy.falhas[carga?.motivo ?? 'falha-de-comunicacao']}</CaixaDeErro>
  }

  if (!carga.politica) {
    return <EstadoVazio titulo={copy.vazio.titulo} explicacao={copy.vazio.explicacao} />
  }

  return (
    <Formulario
      politica={carga.politica}
      fusoDaConta={carga.fusoDaConta}
      conferindoLimites={limites.isPending}
      integracoes={limites.data?.ok ? limites.data.integracoes : null}
      aoGravar={async () => {
        await consulta.refetch()
      }}
    />
  )
}

interface Confirmacao {
  antes: PoliticaDeDiscagem
  depois: PoliticaDeDiscagem
  campos: CampoDaPolitica[]
}

type Republicacao =
  | { estado: 'republicando' }
  | { estado: 'republicada' }
  | { estado: 'recusada'; mensagem: string }

function mensagemDoCampo(campo: CampoDaPolitica, motivo: MotivoDoCampo | undefined) {
  if (!motivo) return undefined
  if (motivo === 'fora-da-faixa' && campo in FAIXAS) {
    const faixa = FAIXAS[campo as keyof typeof FAIXAS]
    return `${copy.errosDoCampo[motivo]} ${copy.faixaDoCampo(faixa.minimo, faixa.maximo)}`
  }
  return copy.errosDoCampo[motivo]
}

function Formulario({
  politica,
  fusoDaConta,
  conferindoLimites,
  integracoes,
  aoGravar,
}: {
  politica: PoliticaDeDiscagem
  fusoDaConta: string
  conferindoLimites: boolean
  integracoes: readonly Integracao[] | null
  aoGravar: () => Promise<void>
}) {
  const servico = useServicoDeDiscagem()
  const sarah = useServicoDaSarah()

  // `base` é o que está gravado: a diferença para o rascunho é o que vai ao
  // RPC, e a trilha registra só isso.
  const [base, definirBase] = useState(politica)
  const [rascunho, definirRascunho] = useState<RascunhoDaPolitica>(() => rascunhoDe(politica))
  const [motivo, definirMotivo] = useState('')
  const [erros, definirErros] = useState<ErrosDaPolitica>({})
  const [diasComErro, definirDiasComErro] = useState<string[]>([])
  const [motivoFaltando, definirMotivoFaltando] = useState(false)
  const [aviso, definirAviso] = useState<'nada-mudou' | 'campos' | null>(null)
  const [falha, definirFalha] = useState<MotivoDeFalhaDaDiscagem | null>(null)
  const [confirmacao, definirConfirmacao] = useState<Confirmacao | null>(null)
  const [salvando, definirSalvando] = useState(false)
  const [republicacao, definirRepublicacao] = useState<Republicacao | null>(null)
  // A prévia só precisa do dia da semana, e ler o relógio uma vez, na
  // montagem, é o que mantém o desenho puro.
  const [agora] = useState(() => Date.now())

  const limite = limiteDeSimultaneidade(integracoes)

  function alterar<C extends Exclude<keyof RascunhoDaPolitica, 'janela'>>(campo: C, valor: string) {
    definirRascunho((atual) => ({ ...atual, [campo]: valor }))
  }

  function alterarDia(dia: string, mudanca: Partial<FaixaDoRascunho>) {
    definirRascunho((atual) => ({
      ...atual,
      janela: { ...atual.janela, [dia]: { ...atual.janela[dia]!, ...mudanca } },
    }))
  }

  async function gravar(evento: FormEvent) {
    evento.preventDefault()
    definirAviso(null)
    definirFalha(null)
    definirConfirmacao(null)

    const validacao = validarPolitica(rascunho, limite.teto)
    if (!validacao.ok) {
      definirErros(validacao.erros)
      definirDiasComErro(validacao.diasComErro)
      definirAviso('campos')
      return
    }
    definirErros({})
    definirDiasComErro([])

    const mudancas = mudancasDe(base, validacao.politica)
    if (Object.keys(mudancas).length === 0) {
      definirAviso('nada-mudou')
      return
    }

    const motivoEscrito = motivo.trim()
    if (!motivoEscrito) {
      definirMotivoFaltando(true)
      return
    }
    definirMotivoFaltando(false)

    definirSalvando(true)
    const resultado = await servico.salvar(mudancas, motivoEscrito)
    definirSalvando(false)

    if (!resultado.ok) {
      definirFalha(resultado.motivo)
      return
    }

    definirConfirmacao({
      antes: base,
      depois: resultado.politica,
      campos: camposMudados(base, resultado.politica),
    })
    definirBase(resultado.politica)
    definirRascunho(rascunhoDe(resultado.politica))
    definirMotivo('')
    await aoGravar()
  }

  async function republicar() {
    definirRepublicacao({ estado: 'republicando' })
    const resultado = await sarah.republicar()
    if (!resultado.ok) {
      definirRepublicacao({ estado: 'recusada', mensagem: copy.duracao.falhaAoRepublicar })
    } else if (resultado.relatorio.recusa) {
      definirRepublicacao({ estado: 'recusada', mensagem: resultado.relatorio.recusa })
    } else {
      definirRepublicacao({ estado: 'republicada' })
    }
  }

  // Republicar leva ao ar o que está salvo. Com alteração por salvar, o botão
  // espera: republicar antes de salvar deixaria a política nova de fora sem
  // ninguém perceber.
  const porSalvar = JSON.stringify(rascunho) !== JSON.stringify(rascunhoDe(base))

  const previa = previaDaJanela(janelaValidaDoRascunho(rascunho), fusoDaConta, agora)

  return (
    <form onSubmit={gravar} noValidate className="flex flex-col gap-6">
      <Painel titulo={copy.campos.janela.rotulo}>
        <GrupoDoCampo campo="janela">
          <div className="flex flex-col gap-2">
            {DIAS_NA_ORDEM.map((dia) => (
              <LinhaDoDia
                key={dia}
                dia={dia}
                faixa={rascunho.janela[dia]!}
                comErro={diasComErro.includes(dia)}
                aoMudar={(mudanca) => alterarDia(dia, mudanca)}
              />
            ))}
          </div>
          {erros.janela ? (
            <p className="m-0 text-[12.5px] text-perigo">
              {copy.errosDoCampo[erros.janela]} {copy.diasComErro(diasComErro)}
            </p>
          ) : null}
        </GrupoDoCampo>

        <section aria-label={copy.previa.titulo} className="bloco-secundario mt-4">
          <h3 className="titulo-de-secao m-0">{copy.previa.titulo}</h3>
          <p className="mt-1 mb-2 text-[12.5px] text-texto-apoio">{copy.previa.explicacao}</p>
          {previa.length === 0 ? (
            <p className="m-0 text-[12.5px]">{copy.previa.semDias}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {previa.map((item) => (
                <li key={item.dia} className="border-l-2 border-menta/40 pl-3">
                  <p className="m-0 text-[12.5px] font-semibold text-texto-principal">{copy.dia(item.dia)}</p>
                  {item.frases.map((frase) => (
                    <p key={frase.fuso} className="m-0 text-[12.5px]">
                      {copy.previa.leadEm(frase.fuso)}: <span className="val">{frase.frase}</span>
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>
      </Painel>

      <Painel>
        <div className="flex flex-col gap-5">
          <LinhaDeCampos>
            <CampoNumerico
              campo="intervaloMinimoMinutos"
              valor={rascunho.intervaloMinimoMinutos}
              erro={erros.intervaloMinimoMinutos}
              aoMudar={(valor) => alterar('intervaloMinimoMinutos', valor)}
            />
            <CampoNumerico
              campo="tentativasPorNumero"
              valor={rascunho.tentativasPorNumero}
              erro={erros.tentativasPorNumero}
              aoMudar={(valor) => alterar('tentativasPorNumero', valor)}
            />
          </LinhaDeCampos>
          <LinhaDeCampos>
            <CampoNumerico
              campo="tetoDiarioDeLigacoes"
              valor={rascunho.tetoDiarioDeLigacoes}
              erro={erros.tetoDiarioDeLigacoes}
              aoMudar={(valor) => alterar('tetoDiarioDeLigacoes', valor)}
            />
            <CampoNumerico
              campo="tetoDeGastoCentavos"
              valor={rascunho.tetoDeGastoReais}
              erro={erros.tetoDeGastoCentavos}
              aoMudar={(valor) => alterar('tetoDeGastoReais', valor)}
            />
          </LinhaDeCampos>
          <LinhaDeCampos>
            <CampoNumerico
              campo="duracaoMaximaSegundos"
              valor={rascunho.duracaoMaximaSegundos}
              erro={erros.duracaoMaximaSegundos}
              aoMudar={(valor) => alterar('duracaoMaximaSegundos', valor)}
            >
              <p className="m-0 text-[12.5px] text-atencao">{copy.duracao.republicacao}</p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="botao-secundario"
                  disabled={republicacao?.estado === 'republicando' || porSalvar}
                  onClick={republicar}
                >
                  {republicacao?.estado === 'republicando'
                    ? copy.duracao.republicando
                    : copy.duracao.republicar}
                </button>
                {porSalvar ? (
                  <p className="m-0 text-[12.5px] text-texto-apoio">{copy.duracao.salveAntes}</p>
                ) : null}
                {republicacao?.estado === 'republicada' ? (
                  <p role="status" className="m-0 flex items-center gap-2 text-[12.5px] font-semibold text-positivo">
                    <span aria-hidden="true" className="ao-vivo" />
                    {copy.duracao.republicada}
                  </p>
                ) : null}
              </div>
              {republicacao?.estado === 'recusada' ? (
                <CaixaDeErro>{republicacao.mensagem}</CaixaDeErro>
              ) : null}
            </CampoNumerico>
            <CampoNumerico
              campo="simultaneidade"
              valor={rascunho.simultaneidade}
              erro={erros.simultaneidade}
              aoMudar={(valor) => alterar('simultaneidade', valor)}
            >
              <LimiteDoProvedor limite={limite} conferindo={conferindoLimites} />
            </CampoNumerico>
          </LinhaDeCampos>
        </div>
      </Painel>

      <div className="flex flex-col gap-3">
        <CampoDeTexto
          rotulo={copy.motivo.rotulo}
          exemplo={copy.motivo.exemplo}
          value={motivo}
          erro={motivoFaltando ? copy.motivo.faltando : undefined}
          onChange={(evento) => definirMotivo(evento.target.value)}
        />
        <p className="m-0 text-[12.5px] text-texto-apoio">{copy.motivo.explicacao}</p>

        {aviso === 'campos' ? <CaixaDeErro tom="atencao">{copy.camposComErro}</CaixaDeErro> : null}
        {aviso === 'nada-mudou' ? (
          <CaixaDeErro tom="atencao">{copy.nadaMudou}</CaixaDeErro>
        ) : null}
        {falha ? <CaixaDeErro>{copy.falhas[falha]}</CaixaDeErro> : null}
        {confirmacao ? <ConfirmacaoDoQueMudou confirmacao={confirmacao} /> : null}

        <div>
          <button
            type="submit"
            className="botao-primario"
            disabled={salvando || conferindoLimites}
          >
            {salvando ? copy.salvando : copy.salvar}
          </button>
        </div>
      </div>
    </form>
  )
}

/**
 * Todo campo mora num grupo com o nome dele, e a consequência de atingi-lo
 * fica dentro do grupo. É o que o teste percorre, campo a campo.
 */
function GrupoDoCampo({ campo, children }: { campo: CampoDaPolitica; children: ReactNode }) {
  return (
    <div role="group" aria-label={copy.campos[campo].rotulo} className="flex flex-col gap-2">
      <p className="m-0 text-[12.5px] text-texto-apoio">{copy.campos[campo].consequencia}</p>
      {children}
    </div>
  )
}

function CampoNumerico({
  campo,
  valor,
  erro,
  aoMudar,
  children,
}: {
  campo: Exclude<CampoDaPolitica, 'janela'>
  valor: string
  erro: MotivoDoCampo | undefined
  aoMudar: (valor: string) => void
  children?: ReactNode
}) {
  const { rotulo, unidade } = copy.campos[campo]
  return (
    <div role="group" aria-label={rotulo} className="flex flex-col gap-2">
      <CampoDeTexto
        rotulo={rotulo}
        exemplo={unidade}
        inputMode="numeric"
        value={valor}
        erro={mensagemDoCampo(campo, erro)}
        onChange={(evento) => aoMudar(evento.target.value)}
      />
      <p className="m-0 text-[12.5px] text-texto-apoio">{copy.campos[campo].consequencia}</p>
      {children}
    </div>
  )
}

function LinhaDoDia({
  dia,
  faixa,
  comErro,
  aoMudar,
}: {
  dia: string
  faixa: FaixaDoRascunho
  comErro: boolean
  aoMudar: (mudanca: Partial<FaixaDoRascunho>) => void
}) {
  const id = useId()
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-controle px-2 py-1 transition-colors duration-150 ${
        faixa.ligado ? '' : 'opacity-70'
      }`}
    >
      <div className="flex w-[160px] items-center gap-2">
        <input
          type="checkbox"
          id={id}
          checked={faixa.ligado}
          onChange={(evento) => aoMudar({ ligado: evento.target.checked })}
        />
        <label htmlFor={id} className="cursor-pointer text-[13.5px] font-semibold text-texto-principal">
          {copy.dia(dia)}
        </label>
      </div>
      <input
        aria-label={copy.inicioDe(dia)}
        placeholder={copy.exemploDeHora}
        className={`val w-[90px] ${comErro ? 'campo-recusado' : 'campo'}`}
        disabled={!faixa.ligado}
        value={faixa.inicio}
        onChange={(evento) => aoMudar({ inicio: evento.target.value })}
      />
      <input
        aria-label={copy.fimDe(dia)}
        placeholder={copy.exemploDeHora}
        className={`val w-[90px] ${comErro ? 'campo-recusado' : 'campo'}`}
        disabled={!faixa.ligado}
        value={faixa.fim}
        onChange={(evento) => aoMudar({ fim: evento.target.value })}
      />
    </div>
  )
}

function LimiteDoProvedor({
  limite,
  conferindo,
}: {
  limite: LimiteDeSimultaneidade
  conferindo: boolean
}) {
  if (conferindo) return <p className="m-0 text-[12.5px]">{copy.simultaneidade.conferindo}</p>

  if (limite.voz === null && limite.telefonia === null) {
    return (
      <CaixaDeErro tom="atencao">{copy.simultaneidade.semConferencia}</CaixaDeErro>
    )
  }

  const semLeitura = limite.voz === null ? 'voz' : limite.telefonia === null ? 'telefonia' : null
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0 text-[12.5px]">{copy.simultaneidade.manda(limite.manda, limite.teto)}</p>
      {semLeitura ? (
        <p className="m-0 text-[12.5px] text-atencao">
          {copy.simultaneidade.semLimiteDe(semLeitura)}
        </p>
      ) : null}
    </div>
  )
}

function ConfirmacaoDoQueMudou({ confirmacao }: { confirmacao: Confirmacao }) {
  return (
    <div
      role="status"
      className="rounded-controle border border-positivo-borda bg-positivo-fundo px-4 py-3 text-[13.5px] text-texto-secundario"
    >
      <p className="m-0 font-bold text-positivo">{copy.confirmacao.titulo}</p>
      <ul aria-label={copy.confirmacao.titulo} className="mt-1.5 mb-0 pl-5">
        {confirmacao.campos.map((campo) => (
          <li key={campo}>{copy.confirmacao.linha(campo, confirmacao.antes, confirmacao.depois)}</li>
        ))}
      </ul>
      {confirmacao.campos.includes('duracaoMaximaSegundos') ? (
        <p className="mt-2 mb-0 text-atencao">{copy.confirmacao.lembreteDeRepublicar}</p>
      ) : null}
    </div>
  )
}

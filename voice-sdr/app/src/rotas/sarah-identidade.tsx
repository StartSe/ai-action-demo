import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'

import {
  AreaDeTrabalho,
  type PropsDeTelaEmbutivel,
} from '@/componentes/area-de-trabalho'
import { AvisoDePublicacao } from '@/componentes/aviso-de-publicacao'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { CampoDeTextoLongo } from '@/componentes/campo-de-texto-longo'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { LinhaDeCampos } from '@/componentes/linha-de-campos'
import { NegativaPorPapel } from '@/componentes/negativa-por-papel'
import { Painel } from '@/componentes/painel'
import { equipe as copyDaEquipe } from '@/copy/equipe'
import { identidadeDaSarah as copy, VARIAVEIS_DISPONIVEIS } from '@/copy/sarah'
import { useServicoDeEquipe } from '@/equipe/contexto'
import {
  podeDefinirIdentidadeDaSarah,
  quemConcedeAcesso,
} from '@/equipe/papeis'
import { useServicoDaSarah } from '@/sarah/contexto'
import { useNomeDaAssistente } from '@/sarah/nome-da-assistente'
import {
  IDENTIDADE_EM_BRANCO,
  identidadeGravavel,
  identidadesIguais,
  previaDaAberturaDoWhatsapp,
  previaDaPrimeiraFala,
  variaveisDesconhecidas,
} from '@/sarah/identidade'
import type {
  EstadoDePublicacao,
  IdentidadeDaSarah,
  MotivoDeFalhaDaSarah,
  ServicoDaSarah,
} from '@/sarah/tipos'

const CHAVE = ['sarah-identidade'] as const

/** O papel de quem olha vem da mesma carga da tela de equipe, e da mesma chave. */
const CHAVE_DA_EQUIPE = ['equipe'] as const

/**
 * `/sarah/identidade`: quem a Sarah diz que é (RF-301, RF-304, RF-308).
 *
 * Duas decisões explicam o desenho:
 *
 * 1. **Variável que não resolve é recusada na gravação.** Um `{cargo}` escrito
 *    na primeira fala some da frase na hora da síntese, e a abertura chega ao
 *    lead com um buraco no meio. A recusa diz qual variável é e quais existem,
 *    porque a alternativa é descobrir isso ouvindo uma ligação.
 * 2. **Salvar não põe no ar.** A configuração publicada é a que vale na próxima
 *    ligação, e gravar aqui só muda o banco. A tela diz isso toda vez que a
 *    identidade fica mais nova do que a publicação: configuração salva que não
 *    está no ar é a forma mais silenciosa de enganar quem configura.
 */
export function TelaDeIdentidadeDaSarah({
  dentroDoAssistente = false,
}: PropsDeTelaEmbutivel) {
  const servico = useServicoDaSarah()
  const servicoDeEquipe = useServicoDeEquipe()

  const [montando, definirMontando] = useState(false)

  const consulta = useQuery({
    queryKey: CHAVE,
    queryFn: () => servico.carregarIdentidade(),
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
  // Equipe que não carregou não libera escrita: quem decide de verdade é a
  // política, e oferecer o formulário para receber a recusa dela no meio do
  // caminho trocaria uma negativa explicada por um erro sem saída.
  const papel = cargaDaEquipe?.ok ? cargaDaEquipe.equipe.papelDoUsuario : null
  const podeEscrever = papel !== null && podeDefinirIdentidadeDaSarah(papel)
  const administradores = cargaDaEquipe?.ok
    ? quemConcedeAcesso(cargaDaEquipe.equipe.membros)
    : []

  const { sarah } = carga

  return (
    <Moldura embutida={dentroDoAssistente}>
      {papel !== null && !podeEscrever ? (
        <div className="mb-6">
          <NegativaPorPapel
            aviso={copy.leitura.aviso}
            administradores={administradores}
          />
        </div>
      ) : null}

      {cargaDaEquipe && !cargaDaEquipe.ok ? (
        <div className="mb-6">
          <CaixaDeErro>{copyDaEquipe.falhas[cargaDaEquipe.motivo]}</CaixaDeErro>
        </div>
      ) : null}

      {sarah.identidade === null && !montando ? (
        <Vazio
          podeEscrever={podeEscrever}
          dentroDoAssistente={dentroDoAssistente}
          aoMontar={() => definirMontando(true)}
        />
      ) : (
        <Formulario
          servico={servico}
          identidade={sarah.identidade ?? IDENTIDADE_EM_BRANCO}
          publicacao={sarah.publicacao}
          podeEscrever={podeEscrever}
        />
      )}
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
  const nomeDaAssistente = useNomeDaAssistente()
  return (
    <AreaDeTrabalho titulo={copy.titulo} lead={copy.explicacao(nomeDaAssistente)} embutida={embutida}>
      {children}
    </AreaDeTrabalho>
  )
}

/**
 * A conta que ainda não montou a Sarah. O caminho para o assistente fica ao
 * lado do formulário, e não no lugar dele: quem chegou aqui pela barra lateral
 * já sabe o que quer escrever, e quem está começando pelo começo prefere os
 * oito passos.
 */
function Vazio({
  podeEscrever,
  dentroDoAssistente,
  aoMontar,
}: {
  podeEscrever: boolean
  dentroDoAssistente: boolean
  aoMontar: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <EstadoVazio
        titulo={copy.vazio.titulo}
        explicacao={copy.vazio.explicacao}
        {...(podeEscrever
          ? { acao: { rotulo: copy.vazio.montar, aoAcionar: aoMontar } }
          : {})}
      />
      {/* Dentro do assistente, o caminho para ele apontaria para a própria
          página. */}
      {dentroDoAssistente ? null : (
        <p className="m-0 text-center text-[13px] text-texto-apoio">
          {copy.vazio.assistente}{' '}
          <a href="/configuracao-inicial" className="botao-link">
            {copy.vazio.irParaAssistente}
          </a>
        </p>
      )}
    </div>
  )
}

type FormularioProps = {
  servico: ServicoDaSarah
  identidade: IdentidadeDaSarah
  publicacao: EstadoDePublicacao
  podeEscrever: boolean
}

function Formulario({
  servico,
  identidade,
  publicacao,
  podeEscrever,
}: FormularioProps) {
  // O que a conta tem gravado semeia o formulário uma vez, na montagem. Depois
  // da gravação o formulário continua sendo a fonte do que está na tela, e a
  // consulta não é refeita: recarregar aqui só serviria para reescrever por
  // cima o que a pessoa acabou de escrever.
  const [campos, definirCampos] = useState<IdentidadeDaSarah>(identidade)
  const [novoLimite, definirNovoLimite] = useState('')
  const [gravando, definirGravando] = useState(false)
  const [falha, definirFalha] = useState<MotivoDeFalhaDaSarah | null>(null)
  const [salvo, definirSalvo] = useState<IdentidadeDaSarah | null>(null)
  const [estado, definirEstado] = useState<EstadoDePublicacao>(publicacao)
  const [recusadas, definirRecusadas] = useState<string[]>([])
  const [recusadasNoWhatsapp, definirRecusadasNoWhatsapp] = useState<string[]>([])

  const previa = previaDaPrimeiraFala(campos)
  const mudou = salvo === null || !identidadesIguais(campos, salvo)

  function mudar(mudanca: Partial<IdentidadeDaSarah>) {
    definirCampos((atual) => ({ ...atual, ...mudanca }))
    definirFalha(null)
    if ('primeiraFala' in mudanca) definirRecusadas([])
    if ('aberturaDoWhatsapp' in mudanca) definirRecusadasNoWhatsapp([])
  }

  function acrescentarLimite() {
    const item = novoLimite.trim()
    if (item === '') return
    definirNovoLimite('')
    mudar({ nuncaAfirmar: [...campos.nuncaAfirmar, item] })
  }

  async function gravar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    // A recusa vem antes da ida ao servidor: o banco aceitaria o texto, e quem
    // descobriria o marcador órfão seria o lead, na ligação.
    // A abertura do WhatsApp passa pelo mesmo crivo: marcador que ninguém
    // preenche some da mensagem e deixa a frase pela metade.
    const desconhecidas = variaveisDesconhecidas(campos.primeiraFala)
    const desconhecidasNoWhatsapp = variaveisDesconhecidas(campos.aberturaDoWhatsapp)
    definirRecusadas(desconhecidas)
    definirRecusadasNoWhatsapp(desconhecidasNoWhatsapp)
    if (desconhecidas.length > 0 || desconhecidasNoWhatsapp.length > 0) return

    definirGravando(true)
    definirFalha(null)
    const resultado = await servico.salvarIdentidade(campos)
    definirGravando(false)

    if (!resultado.ok) {
      definirFalha(resultado.motivo)
      return
    }

    definirSalvo(campos)
    definirEstado(resultado.publicacao)
  }

  return (
    <form onSubmit={gravar} noValidate className="flex flex-col gap-6">
      <AvisoDePublicacao estado={estado} />

      <Painel titulo={copy.secoes.quemEla}>
        <div className="flex flex-col gap-4">
          <LinhaDeCampos>
            <CampoDeTexto
              rotulo={copy.campos.nome}
              exemplo={copy.campos.nomeExemplo}
              name="nome"
              autoComplete="off"
              value={campos.nome}
              disabled={!podeEscrever}
              onChange={(evento) => mudar({ nome: evento.target.value })}
            />
            <CampoDeTexto
              rotulo={copy.campos.empresa}
              exemplo={copy.campos.empresaExemplo}
              name="empresa"
              autoComplete="off"
              value={campos.empresa}
              disabled={!podeEscrever}
              onChange={(evento) => mudar({ empresa: evento.target.value })}
            />
          </LinhaDeCampos>

          <CampoDeTextoLongo
            rotulo={copy.campos.oferta}
            exemplo={copy.campos.ofertaExemplo}
            apoio={copy.campos.ofertaExplicacao}
            name="oferta"
            rows={2}
            value={campos.oferta}
            disabled={!podeEscrever}
            onChange={(evento) => mudar({ oferta: evento.target.value })}
          />

          <CampoDeTexto
            rotulo={copy.campos.destino}
            exemplo={copy.campos.destinoExemplo}
            name="destino"
            autoComplete="off"
            value={campos.destinoDeTransferencia}
            disabled={!podeEscrever}
            onChange={(evento) =>
              mudar({ destinoDeTransferencia: evento.target.value })
            }
          />
          <p className="m-0 text-[12.5px] text-texto-apoio">
            {copy.campos.destinoExplicacao}
          </p>
        </div>
      </Painel>

      <Painel titulo={copy.secoes.limites} apoio={copy.nuncaAfirmar.explicacao}>
        {campos.nuncaAfirmar.length ? (
          <ul
            aria-label={copy.nuncaAfirmar.lista}
            className="m-0 mb-4 flex list-none flex-col gap-2 p-0"
          >
            {campos.nuncaAfirmar.map((item, indice) => (
              <li
                key={`${item}-${indice}`}
                className="bloco-secundario flex items-center justify-between gap-3 border-l-2 border-l-acento/70 py-2.5 text-[13.5px]"
              >
                <span className="min-w-0 text-texto-principal">{item}</span>
                <button
                  type="button"
                  className="botao-fantasma"
                  disabled={!podeEscrever}
                  onClick={() =>
                    mudar({
                      nuncaAfirmar: campos.nuncaAfirmar.filter(
                        (_, posicao) => posicao !== indice,
                      ),
                    })
                  }
                >
                  {copy.nuncaAfirmar.remover(item)}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-0 mb-4 text-[13px] text-texto-apoio">
            {copy.nuncaAfirmar.vazia}
          </p>
        )}

        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <CampoDeTexto
              rotulo={copy.nuncaAfirmar.campo}
              exemplo={copy.nuncaAfirmar.exemplo}
              name="nunca-afirmar"
              autoComplete="off"
              value={novoLimite}
              disabled={!podeEscrever}
              onChange={(evento) => definirNovoLimite(evento.target.value)}
              // O Enter aqui acrescenta o item, e não envia o formulário: quem
              // está listando restrições costuma escrever várias seguidas.
              onKeyDown={(evento) => {
                if (evento.key !== 'Enter') return
                evento.preventDefault()
                acrescentarLimite()
              }}
            />
          </div>
          <button
            type="button"
            className="botao-secundario"
            disabled={!podeEscrever || novoLimite.trim() === ''}
            onClick={acrescentarLimite}
          >
            {copy.nuncaAfirmar.acrescentar}
          </button>
        </div>
      </Painel>

      <Painel titulo={copy.secoes.abertura}>
        <div className="grid grid-cols-[1fr_minmax(0,260px)] gap-5 max-md:grid-cols-1">
          <div className="flex min-w-0 flex-col gap-4">
            <CampoDeTextoLongo
              rotulo={copy.campos.primeiraFala}
              apoio={copy.campos.primeiraFalaExplicacao}
              name="primeira-fala"
              rows={3}
              value={campos.primeiraFala}
              disabled={!podeEscrever}
              erro={
                recusadas.length
                  ? copy.recusa.variavelDesconhecida(recusadas)
                  : undefined
              }
              onChange={(evento) => mudar({ primeiraFala: evento.target.value })}
            />

            <div className="bloco-secundario">
              <p className="sobretitulo m-0 mb-2">{copy.previa.titulo}</p>
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="sinal mt-0.5 h-8 w-8" />
                <p className="m-0 rounded-cartao rounded-tl-pequeno border border-positivo-borda bg-positivo-fundo px-3.5 py-2.5 text-[13.5px] leading-relaxed text-texto-principal">
                  {previa || copy.previa.vazia}
                </p>
              </div>
              <p className="mt-2 mb-0 text-[12.5px] text-texto-apoio">
                {copy.previa.explicacao}
              </p>
            </div>
          </div>

          <ListaDeVariaveis />
        </div>
      </Painel>

      <Painel titulo={copy.secoes.porCanal} apoio={copy.porCanal.explicacao}>
        <div className="flex flex-col gap-4">
          <CampoDeTextoLongo
            rotulo={copy.porCanal.aberturaDoWhatsapp}
            apoio={copy.porCanal.aberturaDoWhatsappExplicacao}
            name="abertura-do-whatsapp"
            rows={2}
            value={campos.aberturaDoWhatsapp}
            disabled={!podeEscrever}
            erro={
              recusadasNoWhatsapp.length
                ? copy.recusa.variavelDesconhecida(recusadasNoWhatsapp)
                : undefined
            }
            onChange={(evento) => mudar({ aberturaDoWhatsapp: evento.target.value })}
          />
          <div className="bloco-secundario">
            <p className="sobretitulo m-0 mb-2">{copy.porCanal.previaDoWhatsapp}</p>
            <p className="m-0 text-[13.5px] leading-relaxed text-texto-principal">
              {previaDaAberturaDoWhatsapp(campos)}
            </p>
          </div>
          <LinhaDeCampos>
            <CampoDeTextoLongo
              rotulo={copy.porCanal.jeitoNaVoz}
              exemplo={copy.porCanal.jeitoNaVozExemplo}
              apoio={copy.porCanal.jeitoNaVozExplicacao}
              name="jeito-na-voz"
              rows={3}
              value={campos.jeitoNaVoz}
              disabled={!podeEscrever}
              onChange={(evento) => mudar({ jeitoNaVoz: evento.target.value })}
            />
            <CampoDeTextoLongo
              rotulo={copy.porCanal.jeitoNoWhatsapp}
              exemplo={copy.porCanal.jeitoNoWhatsappExemplo}
              apoio={copy.porCanal.jeitoNoWhatsappExplicacao}
              name="jeito-no-whatsapp"
              rows={3}
              value={campos.jeitoNoWhatsapp}
              disabled={!podeEscrever}
              onChange={(evento) => mudar({ jeitoNoWhatsapp: evento.target.value })}
            />
          </LinhaDeCampos>
        </div>
      </Painel>

      {falha ? <CaixaDeErro>{copy.falhas[falha]}</CaixaDeErro> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={
            !podeEscrever || gravando || !mudou || !identidadeGravavel(campos)
          }
          className="botao-primario"
        >
          {gravando ? copy.gravando : copy.gravar}
        </button>
        {salvo && !mudou ? (
          <p role="status" className="m-0 flex items-center gap-2 text-[13px] font-semibold text-positivo">
            <span aria-hidden="true" className="ao-vivo" />
            {copy.salvo}
          </p>
        ) : null}
      </div>
    </form>
  )
}

/** As variáveis que a primeira fala aceita, com o que cada uma vale. */
function ListaDeVariaveis() {
  return (
    <aside className="bloco-secundario">
      <p className="sobretitulo m-0 mb-1">{copy.variaveis.titulo}</p>
      <p className="mt-0 mb-3 text-[12.5px] text-texto-apoio">
        {copy.variaveis.explicacao}
      </p>
      <ul
        aria-label={copy.variaveis.titulo}
        className="m-0 flex list-none flex-col gap-2 p-0 text-[12.5px]"
      >
        {VARIAVEIS_DISPONIVEIS.map((variavel) => (
          <li key={variavel.chave}>
            <span className="val rounded-pequeno border border-positivo-borda bg-positivo-fundo px-1.5 py-0.5 text-menta-2">
              {variavel.marcador}
            </span>
            <span className="mt-1 block text-texto-apoio">{variavel.explicacao}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}

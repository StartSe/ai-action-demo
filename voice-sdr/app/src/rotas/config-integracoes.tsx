import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import {
  AreaDeTrabalho,
  type PropsDeTelaEmbutivel,
} from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { Painel } from '@/componentes/painel'
import { ProvedorDeModelo } from '@/componentes/provedor-de-modelo'
import { FormularioDoSite } from '@/integracoes/formulario-do-site'
import { Selo, type TomDoSelo } from '@/componentes/selo'
import { ESTADO_EM_PORTUGUES, integracoes as copy } from '@/copy/integracoes'
import { textoDaInstrucao } from '@/copy/instrucoes-das-chaves'
import {
  algumaChaveCadastrada,
  descreverCota,
  descreverCredito,
  estadoDoCartao,
  podeSalvar,
  valoresParaSalvar,
  type EstadoDoCartao,
} from '@/integracoes/cartao'
import { useServicoDeIntegracoes } from '@/integracoes/contexto'
import type {
  Integracao,
  MotivoDeFalhaDasIntegracoes,
  ProvedorId,
} from '@/integracoes/tipos'
import { useServicoDeWhatsapp } from '@/whatsapp/contexto'
import type { ResultadoDaConexao } from '@/whatsapp/tipos'

/** O que está em voo, e o que a pessoa pediu. Só um por vez, por cartão. */
type EmCurso = { provedor: ProvedorId; tipo: 'salvando' | 'testando' }

type Sobreposicoes = Partial<Record<ProvedorId, Integracao>>
type Falhas = Partial<Record<ProvedorId, MotivoDeFalhaDasIntegracoes>>

const TOM_DO_ESTADO: Record<EstadoDoCartao, TomDoSelo> = {
  conectado: 'positivo',
  testando: 'acento',
  nao_configurado: 'neutro',
  erro: 'perigo',
  indisponivel: 'neutro',
}

/**
 * O calendário pelo OAuth do Google é caminho avançado: o padrão é o endereço
 * iCal na ficha de cada especialista. O cartão só aparece para a conta que já
 * cadastrou alguma chave dele, e sem configuração a tela não o oferece.
 */
function cartaoVisivel(integracao: Integracao): boolean {
  return integracao.provedor !== 'calendario' || algumaChaveCadastrada(integracao)
}

export function TelaDeIntegracoes({
  dentroDoAssistente = false,
}: PropsDeTelaEmbutivel) {
  const servico = useServicoDeIntegracoes()
  const whatsapp = useServicoDeWhatsapp()

  // A volta do OAuth do provedor de modelo (US-246). Chega nesta tela porque é
  // daqui que a pessoa saiu; uma rota de retorno própria seria uma tela em
  // branco que só redireciona.
  //
  // Dentro do assistente a tela não está na rota dela, e a volta do OAuth
  // nunca chega ali: o provedor devolve para `/config/integracoes`. A leitura
  // sem `from` não reclama da rota, e o que ela achar é ignorado.
  const barraDeEndereco = useSearch({ strict: false })
  const voltaDoOauth = dentroDoAssistente
    ? { code: undefined, state: undefined }
    : { code: barraDeEndereco.code, state: barraDeEndereco.state }
  const navegar = useNavigate()

  /**
   * Tira `code` e `state` da barra de endereço depois de concluir. Sem isto, o
   * código ficaria no histórico do navegador e uma recarga tentaria trocá-lo
   * de novo — ele vale uma vez só, e a segunda tentativa viria como recusa.
   */
  function limparVoltaDoOauth() {
    void navegar({
      to: '/config/integracoes',
      search: { code: undefined, state: undefined },
      replace: true,
    })
  }

  const busca = useQuery({
    queryKey: ['integracoes'],
    queryFn: () => servico.carregar(),
  })

  // O teste de um provedor devolve o estado dele, não o da conta inteira. Em
  // vez de refazer a carga toda, o resultado entra aqui e sobrepõe a linha
  // daquele cartão — os outros continuam mostrando o que já haviam mostrado.
  const [sobreposicoes, definirSobreposicoes] = useState<Sobreposicoes>({})
  const [emCurso, definirEmCurso] = useState<EmCurso | null>(null)
  const [falhas, definirFalhas] = useState<Falhas>({})
  const [salvo, definirSalvo] = useState<ProvedorId | null>(null)
  // O resultado de registrar o webhook na Z-API depois de salvar a chave do
  // WhatsApp: só esse provedor chama `whatsapp-connect`, e só ele mostra isto.
  const [conexaoWhatsapp, definirConexaoWhatsapp] = useState<ResultadoDaConexao | null>(null)

  const carga = busca.data

  function aplicar(provedor: ProvedorId, integracao: Integracao) {
    definirSobreposicoes((anteriores) => ({
      ...anteriores,
      [provedor]: integracao,
    }))
  }

  function registrarFalha(
    provedor: ProvedorId,
    motivo: MotivoDeFalhaDasIntegracoes | undefined,
  ) {
    definirFalhas((anteriores) => ({ ...anteriores, [provedor]: motivo }))
  }

  async function testar(provedor: ProvedorId) {
    definirEmCurso({ provedor, tipo: 'testando' })
    definirSalvo(null)
    registrarFalha(provedor, undefined)

    const resultado = await servico.testar(provedor)
    if (resultado.ok) {
      aplicar(provedor, resultado.integracao)
    } else {
      registrarFalha(provedor, resultado.motivo)
    }

    definirEmCurso(null)
  }

  /**
   * Grava e, com a chave nova no cofre, pergunta de novo ao provedor: salvar
   * sem testar deixaria o cartão mostrando o estado que a chave velha tinha.
   * Devolve se pode limpar o campo — chave recusada fica no formulário.
   */
  async function salvar(
    provedor: ProvedorId,
    rascunho: Record<string, string>,
  ): Promise<boolean> {
    definirEmCurso({ provedor, tipo: 'salvando' })
    definirSalvo(null)
    registrarFalha(provedor, undefined)
    if (provedor === 'whatsapp') definirConexaoWhatsapp(null)

    const gravacao = await servico.salvar(provedor, valoresParaSalvar(rascunho))
    if (!gravacao.ok) {
      registrarFalha(provedor, gravacao.motivo)
      definirEmCurso(null)
      return false
    }

    const resultado = await servico.testar(provedor)
    if (resultado.ok) {
      aplicar(provedor, resultado.integracao)
    } else {
      registrarFalha(provedor, resultado.motivo)
    }

    // O WhatsApp precisa de mais um passo depois da chave salva: registrar o
    // webhook na Z-API. Os outros provedores não chamam nada aqui — testar já
    // é a conferência inteira deles.
    if (provedor === 'whatsapp') {
      definirConexaoWhatsapp(await whatsapp.conectar())
    }

    definirSalvo(provedor)
    definirEmCurso(null)
    return true
  }

  return (
    <AreaDeTrabalho
      titulo={copy.titulo}
      lead={copy.explicacao}
      embutida={dentroDoAssistente}
    >
      {busca.isPending ? (
        <Carregando texto={copy.carregando} />
      ) : !carga?.ok ? (
        <CaixaDeErro>
          {copy.falhas[carga?.motivo ?? 'falha-de-comunicacao']}
        </CaixaDeErro>
      ) : carga.integracoes.length === 0 ? (
        <EstadoVazio
          titulo={copy.vazio.titulo}
          explicacao={copy.vazio.explicacao}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {carga.integracoes.filter(cartaoVisivel).map((item) => {
            const integracao = sobreposicoes[item.provedor] ?? item
            return (
              <CartaoDoProvedor
                key={integracao.provedor}
                integracao={integracao}
                emCurso={
                  emCurso?.provedor === integracao.provedor ? emCurso.tipo : null
                }
                falha={falhas[integracao.provedor]}
                salvo={salvo === integracao.provedor}
                conexaoWhatsapp={integracao.provedor === 'whatsapp' ? conexaoWhatsapp : null}
                aoTestar={() => void testar(integracao.provedor)}
                aoSalvar={(rascunho) => salvar(integracao.provedor, rascunho)}
              />
            )
          })}

          {/* O provedor de modelo (US-246) fica no fim, depois das credenciais
              de voz e telefonia: quem chega aqui pelo assistente vem cadastrar
              aquelas duas, que são o que bloqueia a primeira ligação. Este é o
              que faz o painel pensar depois dela. */}
          <ProvedorDeModelo
            codigoDaVolta={voltaDoOauth.code}
            estadoDaVolta={voltaDoOauth.state}
            aoConcluirVolta={limparVoltaDoOauth}
          />

          {/* A entrada de leads de fora (D-02). Fica fora do tutorial: o
              passo que embute esta tela é o das credenciais de voz e
              telefonia, e o formulário é assunto de depois da primeira
              ligação. */}
          {dentroDoAssistente ? null : <FormularioDoSite />}
        </div>
      )}
    </AreaDeTrabalho>
  )
}

type CartaoDoProvedorProps = {
  integracao: Integracao
  emCurso: EmCurso['tipo'] | null
  falha: MotivoDeFalhaDasIntegracoes | undefined
  salvo: boolean
  /** Só preenchido no cartão do WhatsApp, depois de salvar a chave. */
  conexaoWhatsapp: ResultadoDaConexao | null
  aoTestar: () => void
  aoSalvar: (rascunho: Record<string, string>) => Promise<boolean>
}

function CartaoDoProvedor({
  integracao,
  emCurso,
  falha,
  salvo,
  conexaoWhatsapp,
  aoTestar,
  aoSalvar,
}: CartaoDoProvedorProps) {
  // O valor digitado vive aqui e some daqui: nada o guarda depois da gravação,
  // e nada o traz de volta do servidor.
  const [rascunho, definirRascunho] = useState<Record<string, string>>({})

  const estado = estadoDoCartao(integracao, emCurso !== null)
  const ocupado = emCurso !== null

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (await aoSalvar(rascunho)) definirRascunho({})
  }

  return (
    <Painel
      id={integracao.provedor}
      rotulo={integracao.rotulo}
      titulo={integracao.rotulo}
      apoio={integracao.fornecedor}
      estado={<Selo tom={TOM_DO_ESTADO[estado]}>{ESTADO_EM_PORTUGUES[estado]}</Selo>}
    >
      {integracao.erro ? (
        <p
          className={
            estado === 'conectado' || estado === 'testando'
              ? 'mt-0 mb-0 text-[13px] text-texto-apoio'
              : 'mt-0 mb-0 text-[13px] text-perigo'
          }
        >
          {integracao.erro.mensagem}
        </p>
      ) : null}

      {/* Saldo e capacidade são os indicadores do cartão (KPI do design
          system): rótulo em cima, valor embaixo. Baixo e esgotado mudam o
          ladrilho para atenção, e a palavra continua escrita. */}
      {integracao.credito || integracao.cota ? (
        <div className="mt-3 grid grid-cols-2 gap-3 max-md:grid-cols-1">
          {integracao.credito ? (
            <div
              className={`rounded-controle border px-3.5 py-3 ${
                integracao.credito.baixo
                  ? 'border-atencao-borda bg-atencao-fundo'
                  : 'border-borda-suave bg-superficie-funda'
              }`}
            >
              <p className="rotulo-de-indicador m-0">{copy.cartao.credito}</p>
              <p className="mt-1.5 mb-0 text-[15px] font-bold text-texto-principal">
                <span className="val">{descreverCredito(integracao.credito)}</span>
                {integracao.credito.baixo ? (
                  <span className="text-[13px] font-semibold text-atencao">
                    {`, ${copy.cartao.creditoBaixo}`}
                  </span>
                ) : null}
              </p>
            </div>
          ) : null}

          {integracao.cota ? (
            <div
              className={`rounded-controle border px-3.5 py-3 ${
                integracao.cota.esgotada
                  ? 'border-atencao-borda bg-atencao-fundo'
                  : 'border-borda-suave bg-superficie-funda'
              }`}
            >
              <p className="rotulo-de-indicador m-0">{integracao.cota.rotulo}</p>
              <p className="mt-1.5 mb-0 text-[15px] font-bold text-texto-principal">
                <span className="val">{descreverCota(integracao.cota)}</span>
                {integracao.cota.esgotada ? (
                  <span className="text-[13px] font-semibold text-atencao">
                    {`, ${copy.cartao.cotaEsgotada}`}
                  </span>
                ) : null}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {integracao.conectado ? null : (
        <p className="mt-2 mb-0 text-[12.5px] text-texto-apoio">
          {copy.cartao.bloqueia} {integracao.bloqueia}
        </p>
      )}

      <form onSubmit={(evento) => void enviar(evento)} className="mt-5">
        <div className="flex flex-col gap-4">
          {integracao.chaves.map((chave) => (
            <CampoDeTexto
              key={chave.nome}
              rotulo={chave.rotulo}
              apoio={textoDaInstrucao(integracao.provedor, chave.nome)}
              // O valor salvo não volta do servidor; o marcador diz que há um
              // sem dizer qual, e o campo em branco significa "não mexi".
              exemplo={chave.preenchida ? copy.cartao.marcador : undefined}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={rascunho[chave.nome] ?? ''}
              disabled={ocupado}
              onChange={(evento) =>
                definirRascunho((anterior) => ({
                  ...anterior,
                  [chave.nome]: evento.target.value,
                }))
              }
            />
          ))}
        </div>

        <p className="mt-2.5 mb-0 text-[12.5px] text-texto-apoio">
          {algumaChaveCadastrada(integracao)
            ? copy.cartao.chaveCadastrada
            : copy.cartao.chaveAusente}
        </p>

        {falha ? (
          <p role="alert" className="mt-2.5 mb-0 text-[13px] text-perigo">
            {copy.falhas[falha]}
          </p>
        ) : null}

        {salvo && !falha ? (
          <p role="status" className="mt-2.5 mb-0 flex items-center gap-2 text-[13px] font-semibold text-positivo">
            <span aria-hidden="true" className="ao-vivo" />
            {copy.cartao.salva}
          </p>
        ) : null}

        {conexaoWhatsapp ? (
          <p
            role="status"
            className={`mt-2.5 mb-0 text-[13px] ${
              conexaoWhatsapp.ok && conexaoWhatsapp.estado === 'conectado'
                ? 'font-semibold text-positivo'
                : 'text-atencao'
            }`}
          >
            {conexaoWhatsapp.mensagem}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <button
            type="submit"
            disabled={ocupado || !podeSalvar(rascunho)}
            className="botao-primario"
          >
            {emCurso === 'salvando' ? copy.cartao.salvando : copy.cartao.salvar}
          </button>

          <button
            type="button"
            onClick={aoTestar}
            disabled={ocupado}
            className="botao-secundario"
          >
            {emCurso === 'testando' ? copy.cartao.testando : copy.cartao.testar}
          </button>
        </div>
      </form>
    </Painel>
  )
}

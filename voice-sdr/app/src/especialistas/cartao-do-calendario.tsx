import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { normalizarEnderecoIcal } from '@compartilhado/agenda/calendario-ical.ts'

import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { Dialogo } from '@/componentes/dialogo'
import { Painel } from '@/componentes/painel'
import { Selo, type TomDoSelo } from '@/componentes/selo'
import { especialistas as copyDosEspecialistas } from '@/copy/especialistas'
import {
  leituraDoCartao,
  type EstadoDoCartaoDoCalendario,
  type LeituraDoCartao,
} from '@/especialistas/calendario'
import { useServicoDeEspecialistas } from '@/especialistas/contexto'
import type { ConexaoDoCalendario, PreparoDaConexao } from '@/especialistas/tipos'
import { formatarRelativo } from '@/utilidades/datas'

const copy = copyDosEspecialistas.cartaoDoCalendario

// Os mesmos tons do cartão de /config/integracoes. A espera do Google é
// atenção, e não perigo: é o estado normal do passo (P-04).
const TOM: Record<EstadoDoCartaoDoCalendario, TomDoSelo> = {
  conectado: 'positivo',
  testando: 'acento',
  nao_configurado: 'neutro',
  erro: 'perigo',
  indisponivel: 'neutro',
  aguardando_google: 'atencao',
}

/**
 * O cartão do calendário na ficha do especialista (US-177, RF-507), no
 * desenho do cartão de provedor de /config/integracoes: estado, o que fica
 * bloqueado e o caminho para resolver.
 *
 * **O caminho padrão é o endereço iCal.** Quem administra cola o endereço
 * secreto que o Google Agenda, o Outlook ou o Apple publicam, com a instrução
 * de onde achar em cada um, e a rotina lê a ocupação por ele. Não depende de
 * aplicativo nosso em terceiro nenhum.
 *
 * **O OAuth do Google é o avançado, e só aparece configurado.** A tela
 * pergunta a `calendar-connect` ao abrir, sem vínculo: só a resposta
 * `autorizar` (a instalação tem o aplicativo do Google) põe o botão na tela.
 * Sem ele, nada de espera nem de aviso: o cartão é o do endereço iCal. O
 * clique pergunta de novo, porque o `state` do endereço vence em dez minutos.
 */
export function CartaoDoCalendario({
  especialistaId,
  conexao,
  podeEscrever,
  aoMudar,
}: {
  especialistaId: string
  conexao: ConexaoDoCalendario
  /** Quem não administra lê o estado, sem conectar nem desconectar. */
  podeEscrever: boolean
  /** A conexão mudou: a lista relê `specialist_calendars`. */
  aoMudar: () => void
}) {
  const servico = useServicoDeEspecialistas()
  const [agora] = useState(() => Date.now())
  const [emCurso, setEmCurso] = useState<string | null>(null)
  const [ultimo, setUltimo] = useState<PreparoDaConexao | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [endereco, setEndereco] = useState('')
  const [recusaDoEndereco, setRecusaDoEndereco] = useState<string | null>(null)

  // Quem não administra recebe da borda só "sem permissão"; perguntar seria
  // uma viagem para uma resposta que a tela já sabe.
  const sondagem = useQuery({
    queryKey: ['calendario-do-especialista', especialistaId],
    queryFn: () => servico.prepararConexaoDoCalendario(especialistaId),
    enabled: podeEscrever && conexao.estado === 'desconectado',
  })

  const provedor = conexao.estado === 'desconectado' ? null : conexao.provedor
  const doGoogle = provedor === 'google'
  const oauthDisponivel = (ultimo ?? sondagem.data)?.resultado === 'autorizar'
  const leitura = leituraDoCartao({ conexao, testando: emCurso !== null, agora })

  async function conectarPeloGoogle() {
    setEmCurso(copy.preparando)
    setErro(null)
    setAviso(null)
    const resultado = await servico.prepararConexaoDoCalendario(especialistaId)
    if (resultado.resultado === 'autorizar') {
      window.location.assign(resultado.url)
      return
    }
    setEmCurso(null)
    setUltimo(resultado)
    // A instalação perdeu o aplicativo do Google entre a abertura e o clique.
    if (resultado.resultado === 'aguardando-google') setAviso(resultado.mensagem)
  }

  async function salvarEndereco(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErro(null)
    setAviso(null)
    const normalizado = normalizarEnderecoIcal(endereco)
    if (!normalizado.ok) {
      setRecusaDoEndereco(copy.ical.recusas[normalizado.motivo])
      return
    }
    setRecusaDoEndereco(null)
    setEmCurso(copy.ical.gravando)
    const resultado = await servico.conectarCalendarioIcal(especialistaId, normalizado.endereco)
    setEmCurso(null)
    if (!resultado.ok) {
      setErro(copyDosEspecialistas.falhasDaGravacao[resultado.motivo])
      return
    }
    setEndereco('')
    setAviso(copy.ical.gravado)
    aoMudar()
  }

  async function desconectar() {
    setEmCurso(copy.desconectando)
    setErro(null)
    setAviso(null)
    const resultado = await servico.desconectarCalendario(especialistaId)
    setEmCurso(null)
    setConfirmando(false)
    if (!resultado.ok) {
      setErro(copyDosEspecialistas.falhasDaGravacao[resultado.motivo])
      return
    }
    setUltimo(null)
    setAviso(copy.desconectado)
    aoMudar()
  }

  function tentarDeNovo() {
    setErro(null)
    aoMudar()
  }

  const temVinculo = conexao.estado !== 'desconectado'
  const ocupado = emCurso !== null

  return (
    <Painel
      rotulo={copy.titulo}
      titulo={copy.titulo}
      apoio={copy.fornecedor(provedor)}
      estado={<Selo tom={TOM[leitura.estado]}>{copy.estados[leitura.estado]}</Selo>}
    >
      <div className="flex flex-col gap-2">
        <Explicacao leitura={leitura} conexao={conexao} agora={agora} />

        {ultimo?.resultado === 'recusada' ? (
          <p role="alert" className="m-0 text-[13px] text-perigo">
            {ultimo.mensagem}
          </p>
        ) : null}
        {erro ? (
          <p role="alert" className="m-0 text-[13px] text-perigo">
            {erro}
          </p>
        ) : null}
        {aviso ? (
          <p role="status" className="m-0 text-[13px] text-positivo">
            {aviso}
          </p>
        ) : null}
        {emCurso ? (
          <p role="status" className="m-0 flex items-center gap-2.5 text-[13px] text-texto-apoio">
            <span aria-hidden="true" className="giro size-4! border-2!" />
            {emCurso}
          </p>
        ) : null}

        {podeEscrever ? (
          <>
            {doGoogle ? null : (
              <form onSubmit={(evento) => void salvarEndereco(evento)} noValidate className="mt-2 flex flex-col gap-3">
                <CampoDeTexto
                  rotulo={copy.ical.rotulo}
                  exemplo={copy.ical.exemplo}
                  apoio={copy.ical.explicacao}
                  name="endereco-ical"
                  autoComplete="off"
                  spellCheck={false}
                  value={endereco}
                  disabled={ocupado}
                  erro={recusaDoEndereco ?? undefined}
                  onChange={(evento) => {
                    setEndereco(evento.target.value)
                    setRecusaDoEndereco(null)
                  }}
                />
                <details className="bloco-secundario text-[13px]">
                  <summary className="cursor-pointer font-semibold">{copy.ical.ondeAchar}</summary>
                  <ul aria-label={copy.ical.ondeAchar} className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
                    {copy.ical.provedores.map((item) => (
                      <li key={item.nome}>
                        <span className="font-semibold text-texto-principal">{item.nome}</span>
                        <span className="mt-0.5 block text-texto-apoio">{item.passos}</span>
                      </li>
                    ))}
                  </ul>
                </details>
                <div>
                  <button type="submit" className="botao-primario" disabled={ocupado}>
                    {temVinculo ? copy.ical.trocar : copy.ical.salvar}
                  </button>
                </div>
              </form>
            )}

            <div className="mt-2 flex flex-wrap gap-3">
              {provedor === null && oauthDisponivel ? (
                <button type="button" className="botao-secundario" disabled={ocupado} onClick={() => void conectarPeloGoogle()}>
                  {copy.conectar}
                </button>
              ) : null}
              {doGoogle && leitura.estado === 'erro' ? (
                <button type="button" className="botao-primario" disabled={ocupado} onClick={() => void conectarPeloGoogle()}>
                  {copy.reconectar}
                </button>
              ) : null}
              {leitura.estado === 'indisponivel' ? (
                <button type="button" className="botao-secundario" disabled={ocupado} onClick={tentarDeNovo}>
                  {copy.tentarDeNovo}
                </button>
              ) : null}
              {temVinculo && leitura.estado !== 'testando' ? (
                <button
                  type="button"
                  className="botao-secundario"
                  disabled={ocupado}
                  onClick={() => setConfirmando(true)}
                >
                  {copy.desconectar}
                </button>
              ) : null}
            </div>
            {provedor === null && oauthDisponivel ? (
              <p className="m-0 text-[12.5px] text-texto-apoio">{copy.oauthExplicacao}</p>
            ) : null}
          </>
        ) : (
          <p className="m-0 text-[12.5px] text-texto-apoio">{copy.leitura}</p>
        )}
      </div>

      {confirmando ? (
        <Dialogo
          titulo={copy.confirmacao.titulo}
          explicacao={copy.confirmacao.explicacao}
          confirmar={copy.confirmacao.confirmar}
          cancelar={copy.confirmacao.cancelar}
          tom="perigo"
          ocupado={ocupado}
          aoConfirmar={() => void desconectar()}
          aoCancelar={() => setConfirmando(false)}
        />
      ) : null}
    </Painel>
  )
}

/** O que o estado quer dizer e o que ele bloqueia, frase a frase. */
function Explicacao({
  leitura,
  conexao,
  agora,
}: {
  leitura: LeituraDoCartao
  conexao: ConexaoDoCalendario
  agora: number
}) {
  const linhas: { texto: string; classe: string }[] = []
  const apoio = 'text-texto-apoio'

  if (leitura.mensagem) {
    linhas.push({
      texto: leitura.mensagem,
      classe: leitura.estado === 'erro' ? 'text-perigo' : apoio,
    })
  }

  // A sincronização parada vem antes do resto: é o que muda o que a Sarah
  // oferece, e não pode ser lida como agenda vazia.
  if (leitura.parada) {
    linhas.push({
      texto: leitura.parada.desde
        ? copy.parou(formatarRelativo(leitura.parada.desde, agora))
        : copy.parouAntesDaPrimeira,
      classe: 'text-atencao',
    })
  } else if (conexao.estado === 'conectado') {
    linhas.push({
      texto: conexao.sincronizadoEm
        ? copy.sincronizado(formatarRelativo(conexao.sincronizadoEm, agora))
        : copy.primeiraLeitura,
      classe: apoio,
    })
  }

  if (leitura.estado === 'aguardando_google') linhas.push({ texto: copy.bloqueiaNaEspera, classe: apoio })
  if (leitura.estado === 'erro') {
    const doGoogle = conexao.estado !== 'desconectado' && conexao.provedor === 'google'
    linhas.push({ texto: doGoogle ? copy.erro : copy.erroDoIcal, classe: apoio })
  }
  if (leitura.estado === 'indisponivel' && !leitura.mensagem) {
    linhas.push({ texto: copy.indisponivel, classe: apoio })
  }
  // O risco de docs/PRD.md seção 12: sem ocupação lida, o horário oferecido
  // pode cair em cima de um compromisso.
  if (conexao.estado === 'desconectado') linhas.push({ texto: copy.semCalendario, classe: apoio })

  return (
    <>
      {linhas.map((linha) => (
        <p key={linha.texto} className={`m-0 text-[13px] ${linha.classe}`}>
          {linha.texto}
        </p>
      ))}
    </>
  )
}

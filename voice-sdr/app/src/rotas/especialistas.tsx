import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'

import {
  AreaDeTrabalho,
  type PropsDeTelaEmbutivel,
} from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeFuso } from '@/componentes/campo-de-fuso'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { LinhaDeCampos } from '@/componentes/linha-de-campos'
import { NegativaPorPapel } from '@/componentes/negativa-por-papel'
import { Painel } from '@/componentes/painel'
import { Selo } from '@/componentes/selo'
import { TabelaDensa, type ColunaDensa } from '@/componentes/tabela-densa'
import { equipe as copyDaEquipe } from '@/copy/equipe'
import { especialistas as copy } from '@/copy/especialistas'
import { nomeDoFusoNaTela } from '@/copy/fuso'
import { useServicoDeEquipe } from '@/equipe/contexto'
import { podeCadastrarEspecialistas, quemConcedeAcesso } from '@/equipe/papeis'
import { AgendaDoEspecialista } from '@/especialistas/agenda-do-especialista'
import { CartaoDoCalendario } from '@/especialistas/cartao-do-calendario'
import { useServicoDeEspecialistas } from '@/especialistas/contexto'
import {
  alternarModalidade,
  areasCadastradas,
  especialistaVazio,
  problemasDoCadastro,
  quantosAtivos,
} from '@/especialistas/regras'
import {
  MODALIDADES,
  type ConexaoDoCalendario,
  type Especialista,
  type PedidoDeEspecialista,
} from '@/especialistas/tipos'
import { formatarData, formatarInstante } from '@/utilidades/datas'

// O papel de quem olha vem da mesma carga da tela de equipe, e por isso da
// mesma chave: é o mesmo recurso, e quem já abriu a equipe não busca de novo.
const CHAVE_DA_EQUIPE = ['equipe'] as const

/**
 * `/especialistas`: quem atende a reunião que a Sarah marca (US-175, RF-501).
 *
 * Quatro decisões explicam o desenho:
 *
 * 1. **A tela abre dizendo quantos podem receber reunião hoje.** É o número
 *    que responde "a Sarah tem para quem encaminhar?", e ele é zero tanto na
 *    conta sem cadastro quanto na que desligou todo mundo — dois estados
 *    diferentes com a mesma consequência.
 * 2. **Não há excluir, e sim desligar.** O especialista aparece em reuniões
 *    passadas, e apagá-lo deixaria o histórico sem quem atendeu. Desligar tira
 *    do rodízio e mantém o registro.
 * 3. **Os problemas do cadastro aparecem todos de uma vez**, e antes de
 *    mandar. A mensagem do Postgres (`specialists_teto_util`) não é frase para
 *    ninguém ler, e descobrir um erro por tentativa é o pior formulário
 *    possível.
 * 4. **Quem não administra lê tudo, com os campos travados.** A negativa é na
 *    tela, e não na rota, como em /config/discagem: é esta tela que explica
 *    para quem a Sarah encaminha, e quem opera o funil precisa saber.
 */
export function TelaDeEspecialistas({
  dentroDoAssistente = false,
}: PropsDeTelaEmbutivel) {
  const servico = useServicoDeEspecialistas()
  const servicoDeEquipe = useServicoDeEquipe()

  const [editando, setEditando] = useState<PedidoDeEspecialista | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const consulta = useQuery({
    queryKey: ['especialistas'],
    queryFn: () => servico.carregar(),
  })

  const equipe = useQuery({
    queryKey: CHAVE_DA_EQUIPE,
    queryFn: () => servicoDeEquipe.carregar(),
  })

  const carga = consulta.data
  const lista = carga?.ok ? carga.especialistas : []

  const cargaDaEquipe = equipe.data
  // Equipe que não carregou não libera escrita: oferecer o formulário para
  // receber a recusa da política no meio do caminho trocaria uma negativa
  // explicada por um erro sem saída.
  const papel = cargaDaEquipe?.ok ? cargaDaEquipe.equipe.papelDoUsuario : null
  const podeEscrever = papel !== null && podeCadastrarEspecialistas(papel)
  const administradores = cargaDaEquipe?.ok
    ? quemConcedeAcesso(cargaDaEquipe.equipe.membros)
    : []

  async function salvar(pedido: PedidoDeEspecialista) {
    setOcupado(copy.formulario.salvando)
    setErro(null)
    setAviso(null)
    const resultado = await servico.salvar(pedido)
    setOcupado(null)
    if (!resultado.ok) {
      setErro(copy.falhasDaGravacao[resultado.motivo])
      return
    }
    setEditando(null)
    setAviso(copy.formulario.salvo)
    void consulta.refetch()
  }

  async function alternar(especialista: Especialista) {
    setOcupado(copy.formulario.salvando)
    setErro(null)
    setAviso(null)
    const resultado = await servico.alternarAtivo(especialista.id, !especialista.ativo)
    setOcupado(null)
    if (!resultado.ok) {
      setErro(copy.falhasDaGravacao[resultado.motivo])
      return
    }
    setAviso(especialista.ativo ? copy.desligado : copy.religado)
    void consulta.refetch()
  }

  function novo() {
    if (!carga?.ok) return
    // O fuso nasce com o da conta (T-21): é nele que a disponibilidade vale,
    // e adivinhar São Paulo erraria toda conta de outro fuso.
    setEditando(especialistaVazio(carga.fusoDaConta))
  }

  const carregando = consulta.isPending || equipe.isPending
  // O fuso da agenda é o gravado, e não o que o formulário está editando: a
  // faixa já gravada vale no fuso do banco até alguém salvar o novo.
  const gravado = editando?.id ? lista.find((item) => item.id === editando.id) : undefined

  return (
    <AreaDeTrabalho
      titulo={copy.titulo}
      lead={copy.apoio}
      embutida={dentroDoAssistente}
      acoes={
        carga?.ok ? (
          <Selo tom={quantosAtivos(lista) === 0 ? 'atencao' : 'positivo'}>
            {copy.ativos(quantosAtivos(lista))}
          </Selo>
        ) : null
      }
    >
      <div className="flex flex-col gap-5">
        {carregando ? <Carregando texto={copy.carregando} /> : null}

        {!carregando && papel !== null && !podeEscrever ? (
          <NegativaPorPapel aviso={copy.leitura.aviso} administradores={administradores} />
        ) : null}
        {!carregando && cargaDaEquipe && !cargaDaEquipe.ok ? (
          <CaixaDeErro>{copyDaEquipe.falhas[cargaDaEquipe.motivo]}</CaixaDeErro>
        ) : null}

        {erro ? <CaixaDeErro>{erro}</CaixaDeErro> : null}
        {aviso ? (
          <p role="status" className="bloco-secundario m-0 px-4 py-3 text-[13.5px]">
            {aviso}
          </p>
        ) : null}

        {!carregando && carga?.ok === false ? (
          <CaixaDeErro tom={carga.motivo === 'sem-permissao' ? 'atencao' : 'perigo'}>
            <p className="m-0">
              {carga.motivo === 'sem-permissao' ? copy.semPermissao : copy.falha}
            </p>
            <button
              type="button"
              className="botao-secundario mt-3"
              onClick={() => void consulta.refetch()}
            >
              {copy.tentarDeNovo}
            </button>
          </CaixaDeErro>
        ) : null}

        {carregando ? null : editando ? (
          <>
            <Formulario
              pedido={editando}
              areas={areasCadastradas(lista.filter((item) => item.id !== editando.id))}
              ocupado={ocupado}
              somenteLeitura={!podeEscrever}
              aoMudar={setEditando}
              aoSalvar={() => void salvar(editando)}
              aoCancelar={() => setEditando(null)}
            />
            {/* A agenda é da ficha de quem já existe: faixa e bloqueio
                precisam do especialista gravado para se pendurar. */}
            {gravado ? (
              <CartaoDoCalendario
                key={`calendario-${gravado.id}`}
                especialistaId={gravado.id}
                conexao={gravado.calendario}
                podeEscrever={podeEscrever}
                aoMudar={() => void consulta.refetch()}
              />
            ) : null}
            {gravado && carga?.ok ? (
              <AgendaDoEspecialista
                key={gravado.id}
                especialistaId={gravado.id}
                fuso={gravado.fuso}
                fusoDaConta={carga.fusoDaConta}
                somenteLeitura={!podeEscrever}
              />
            ) : null}
          </>
        ) : carga?.ok && podeEscrever && lista.length > 0 ? (
          <div>
            <button
              type="button"
              className="botao-secundario"
              disabled={ocupado !== null}
              onClick={novo}
            >
              {copy.novo}
            </button>
          </div>
        ) : null}

        {!carregando && carga?.ok && lista.length === 0 && !editando ? (
          <EstadoVazio
            titulo={copy.vazio.titulo}
            explicacao={copy.vazio.explicacao}
            acao={podeEscrever ? { rotulo: copy.novo, aoAcionar: novo } : undefined}
          />
        ) : null}

        {!carregando && lista.length > 0 ? (
          <TabelaDensa
            rotulo={copy.rotuloDaTabela}
            colunas={colunas({
              podeEscrever,
              ocupado,
              aoAbrir: (especialista) => setEditando(paraPedido(especialista)),
              aoAlternar: (especialista) => void alternar(especialista),
            })}
            linhas={lista}
            chaveDaLinha={(especialista) => especialista.id}
          />
        ) : null}

        {ocupado ? (
          <p role="status" className="m-0 flex items-center gap-2.5 text-[13px] text-texto-apoio">
            <span aria-hidden="true" className="giro size-4! border-2!" />
            {ocupado}
          </p>
        ) : null}
      </div>
    </AreaDeTrabalho>
  )
}

/** O cadastro gravado, na forma que o formulário edita. */
function paraPedido(especialista: Especialista): PedidoDeEspecialista {
  return {
    id: especialista.id,
    nome: especialista.nome,
    area: especialista.area,
    fuso: especialista.fuso,
    modalidades: especialista.modalidades,
    duracaoPadraoMin: especialista.duracaoPadraoMin,
    tetoDiario: especialista.tetoDiario,
    antecedenciaMinimaMin: especialista.antecedenciaMinimaMin,
    antecedenciaMaximaDias: especialista.antecedenciaMaximaDias,
    sala: especialista.sala,
    email: especialista.email,
    ativo: especialista.ativo,
  }
}

/** As colunas da tabela. Horário e número levam `.val`, pela seção 2. */
function colunas({
  podeEscrever,
  ocupado,
  aoAbrir,
  aoAlternar,
}: {
  podeEscrever: boolean
  ocupado: string | null
  aoAbrir: (especialista: Especialista) => void
  aoAlternar: (especialista: Especialista) => void
}): ColunaDensa<Especialista>[] {
  return [
    {
      titulo: copy.colunas.nome,
      conteudo: (especialista) => (
        <div className="flex flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2 font-semibold text-texto-principal">
            {especialista.nome}
            {especialista.ativo ? null : <Selo tom="atencao">{copy.inativo}</Selo>}
          </span>
          <span className="val text-[12px] text-texto-apoio">{especialista.email}</span>
          <span className="text-[12px] text-texto-desativado">
            {especialista.ultimoAtendimentoEm
              ? copy.ultimoAtendimento(formatarData(especialista.ultimoAtendimentoEm))
              : copy.nuncaAtendeu}
          </span>
        </div>
      ),
    },
    { titulo: copy.colunas.area, conteudo: (especialista) => especialista.area ?? copy.semArea },
    {
      titulo: copy.colunas.modalidades,
      conteudo: (especialista) =>
        especialista.modalidades.map((modalidade) => copy.modalidades[modalidade]).join(', '),
    },
    {
      titulo: copy.colunas.duracao,
      classe: 'val',
      conteudo: (especialista) => copy.duracao(especialista.duracaoPadraoMin),
    },
    {
      titulo: copy.colunas.teto,
      classe: 'val',
      conteudo: (especialista) => copy.teto(especialista.tetoDiario),
    },
    {
      titulo: copy.colunas.antecedencia,
      classe: 'val',
      conteudo: (especialista) =>
        copy.antecedencia(especialista.antecedenciaMinimaMin, especialista.antecedenciaMaximaDias),
    },
    { titulo: copy.colunas.fuso, conteudo: (especialista) => nomeDoFusoNaTela(especialista.fuso) },
    {
      titulo: copy.colunas.calendario,
      conteudo: (especialista) => <EstadoDoCalendario conexao={especialista.calendario} />,
    },
    {
      titulo: copy.colunas.acoes,
      conteudo: (especialista) => (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="botao-secundario"
            disabled={ocupado !== null}
            onClick={() => aoAbrir(especialista)}
          >
            {podeEscrever ? copy.acoes.editar : copy.leitura.ver}
          </button>
          {podeEscrever ? (
            <button
              type="button"
              className="botao-secundario"
              disabled={ocupado !== null}
              title={especialista.ativo ? copy.acoes.explicacaoDoDesligar : undefined}
              onClick={() => aoAlternar(especialista)}
            >
              {especialista.ativo ? copy.acoes.desligar : copy.acoes.religar}
            </button>
          ) : null}
        </div>
      ),
    },
  ]
}

function EstadoDoCalendario({ conexao }: { conexao: ConexaoDoCalendario }) {
  if (conexao.estado === 'desconectado') {
    return <Selo tom="neutro">{copy.calendario.desconectado}</Selo>
  }
  if (conexao.estado === 'com-falha') {
    return (
      <div className="flex flex-col items-start gap-1">
        <Selo tom="perigo">{copy.calendario.comFalha}</Selo>
        <span className="text-[12px] text-texto-apoio">{conexao.falha}</span>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <Selo tom="positivo">{copy.calendario.conectado}</Selo>
      <span className="val text-[12px] text-texto-apoio">
        {conexao.sincronizadoEm
          ? copy.calendario.sincronizadoEm(formatarInstante(conexao.sincronizadoEm))
          : copy.calendario.aguardandoSincronia}
      </span>
    </div>
  )
}

function Formulario({
  pedido,
  areas,
  ocupado,
  somenteLeitura,
  aoMudar,
  aoSalvar,
  aoCancelar,
}: {
  pedido: PedidoDeEspecialista
  /** As áreas dos outros especialistas ativos, sugeridas no campo (D-16). */
  areas: readonly string[]
  ocupado: string | null
  /** Quem não administra abre a ficha para ler: tudo travado, sem salvar. */
  somenteLeitura: boolean
  aoMudar: (pedido: PedidoDeEspecialista) => void
  aoSalvar: () => void
  aoCancelar: () => void
}) {
  const problemas = somenteLeitura ? [] : problemasDoCadastro(pedido)
  const travado = ocupado !== null || somenteLeitura
  const idDasAreas = useId()

  return (
    <Painel titulo={pedido.id ? copy.formulario.tituloEdicao : copy.formulario.tituloNovo}>
      <div className="flex flex-col gap-3">
        <LinhaDeCampos>
          <CampoDeTexto
            rotulo={copy.formulario.nome}
            exemplo={copy.formulario.exemploDoNome}
            value={pedido.nome}
            disabled={travado}
            onChange={(evento) => aoMudar({ ...pedido, nome: evento.target.value })}
          />
          <CampoDeTexto
            rotulo={copy.formulario.email}
            exemplo={copy.formulario.exemploDoEmail}
            value={pedido.email}
            disabled={travado}
            onChange={(evento) => aoMudar({ ...pedido, email: evento.target.value })}
          />
        </LinhaDeCampos>
        <p className="m-0 text-[12.5px] text-texto-apoio">{copy.formulario.apoioDoEmail}</p>

        <LinhaDeCampos>
          <CampoDeTexto
            rotulo={copy.formulario.area}
            exemplo={copy.formulario.exemploDaArea}
            value={pedido.area ?? ''}
            disabled={travado}
            list={areas.length > 0 ? idDasAreas : undefined}
            autoComplete="off"
            onChange={(evento) => aoMudar({ ...pedido, area: evento.target.value })}
          />
          <CampoDeFuso
            rotulo={copy.formulario.fuso}
            valor={pedido.fuso}
            disabled={travado}
            aoTrocar={(fuso) => aoMudar({ ...pedido, fuso })}
          />
        </LinhaDeCampos>
        {areas.length > 0 ? (
          <datalist id={idDasAreas}>
            {areas.map((area) => (
              <option key={area} value={area} />
            ))}
          </datalist>
        ) : null}
        <p className="m-0 text-[12.5px] text-texto-apoio">{copy.formulario.apoioDaArea}</p>
        {areas.length > 0 ? (
          <p className="m-0 text-[12.5px] text-texto-apoio">{copy.formulario.areasCadastradas(areas)}</p>
        ) : null}
        <p className="m-0 text-[12.5px] text-texto-apoio">{copy.formulario.apoioDoFuso}</p>

        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[13px] font-semibold">
            {copy.formulario.modalidades}
          </legend>
          <div className="flex flex-wrap gap-2">
            {MODALIDADES.map((modalidade) => {
              const marcada = pedido.modalidades.includes(modalidade)
              return (
                <button
                  key={modalidade}
                  type="button"
                  aria-pressed={marcada}
                  disabled={travado}
                  // A opção marcada é o selo de acento; a desmarcada, o neutro.
                  className={`selo cursor-pointer px-3 py-1.5 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-55 ${
                    marcada ? 'selo-acento' : 'selo-neutro hover:border-borda-controle hover:text-texto-principal'
                  }`}
                  onClick={() =>
                    aoMudar({
                      ...pedido,
                      modalidades: alternarModalidade(pedido.modalidades, modalidade),
                    })
                  }
                >
                  {copy.modalidades[modalidade]}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 mb-0 text-[12.5px] text-texto-apoio">
            {copy.formulario.apoioDasModalidades}
          </p>
        </fieldset>

        <CampoDeTexto
          rotulo={copy.formulario.sala}
          exemplo={copy.formulario.exemploDaSala}
          value={pedido.sala ?? ''}
          disabled={travado}
          onChange={(evento) => aoMudar({ ...pedido, sala: evento.target.value })}
        />
        <p className="m-0 text-[12.5px] text-texto-apoio">{copy.formulario.apoioDaSala}</p>

        <LinhaDeCampos>
          <CampoDeNumero
            rotulo={copy.formulario.duracao}
            valor={pedido.duracaoPadraoMin}
            desabilitado={travado}
            aoMudar={(valor) => aoMudar({ ...pedido, duracaoPadraoMin: valor })}
          />
          <CampoDeNumero
            rotulo={copy.formulario.teto}
            valor={pedido.tetoDiario}
            desabilitado={travado}
            aoMudar={(valor) => aoMudar({ ...pedido, tetoDiario: valor })}
          />
        </LinhaDeCampos>

        <LinhaDeCampos>
          <CampoDeNumero
            rotulo={copy.formulario.antecedenciaMinima}
            valor={pedido.antecedenciaMinimaMin}
            desabilitado={travado}
            aoMudar={(valor) => aoMudar({ ...pedido, antecedenciaMinimaMin: valor })}
          />
          <CampoDeNumero
            rotulo={copy.formulario.antecedenciaMaxima}
            valor={pedido.antecedenciaMaximaDias}
            desabilitado={travado}
            aoMudar={(valor) => aoMudar({ ...pedido, antecedenciaMaximaDias: valor })}
          />
        </LinhaDeCampos>

        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={pedido.ativo}
            disabled={travado}
            onChange={(evento) => aoMudar({ ...pedido, ativo: evento.target.checked })}
          />
          {copy.formulario.ativo}
        </label>

        {/* Todos de uma vez, e antes de mandar: descobrir um erro por tentativa
            é o pior formulário possível, e a mensagem do Postgres não é frase
            para ninguém ler. */}
        {problemas.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {problemas.map((problema) => (
              <li key={problema} className="text-[12.5px] text-perigo">
                {copy.problemas[problema]}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {somenteLeitura ? null : (
            <button
              type="button"
              className="botao-primario"
              disabled={problemas.length > 0 || ocupado !== null}
              onClick={aoSalvar}
            >
              {copy.formulario.salvar}
            </button>
          )}
          <button type="button" className="botao-secundario" onClick={aoCancelar}>
            {somenteLeitura ? copy.leitura.fechar : copy.formulario.cancelar}
          </button>
        </div>
      </div>
    </Painel>
  )
}

/**
 * Um número inteiro. Campo próprio porque `CampoDeTexto` devolve texto, e
 * `Number('')` é zero — o que faria apagar o campo virar zero em vez de campo
 * vazio, e o zero passaria no check de alguns limites.
 */
function CampoDeNumero({
  rotulo,
  valor,
  desabilitado,
  aoMudar,
}: {
  rotulo: string
  valor: number
  desabilitado: boolean
  aoMudar: (valor: number) => void
}) {
  return (
    <CampoDeTexto
      rotulo={rotulo}
      inputMode="numeric"
      value={String(valor)}
      disabled={desabilitado}
      onChange={(evento) => {
        const limpo = evento.target.value.replace(/\D/g, '')
        // Campo vazio vira NaN, que `problemasDoCadastro` recusa por não ser
        // inteiro — e é isso que faz o problema aparecer em vez de virar zero.
        aoMudar(limpo === '' ? Number.NaN : Number(limpo))
      }}
    />
  )
}

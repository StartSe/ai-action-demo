import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { AreaDeTrabalho } from '@/componentes/area-de-trabalho'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeFuso } from '@/componentes/campo-de-fuso'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { LinhaDeCampos } from '@/componentes/linha-de-campos'
import { Painel } from '@/componentes/painel'
import { Seletor } from '@/componentes/seletor'
import { cadastroDeLead as copy, RECUSA_DO_TELEFONE } from '@/copy/leads'
import { useServicoDeEquipe } from '@/equipe/contexto'
import { podeOperarLeads, quemConcedeAcesso } from '@/equipe/papeis'
import type { Membro } from '@/equipe/tipos'
import {
  CADASTRO_EM_BRANCO,
  lerTelefone,
  localidadeAVista,
  localidadeVeioDoDdd,
  montarNovoLead,
  podeGravar,
  recusaAVista,
  type CamposDoCadastro,
} from '@/leads/cadastro'
import { BUSCA_LIMPA } from '@/leads/consulta'
import { useServicoDeLeads } from '@/leads/contexto'
import type {
  EtapaDoFunil,
  LeadExistente,
  MotivoDoCadastro,
  RespostaDaProcura,
} from '@/leads/tipos'

/** A mesma chave de `/leads`: quem já abriu a equipe não busca de novo. */
const CHAVE_DA_EQUIPE = ['equipe'] as const

/** As etapas do funil padrão. Chave própria, porque a lista traz leads junto. */
const CHAVE_DO_FUNIL = ['funil-padrao'] as const

/**
 * `/leads/novo`: o cadastro manual de um lead que chegou por fora (RF-106).
 *
 * Duas decisões explicam o desenho:
 *
 * 1. **O telefone manda na tela.** Ele é o único campo obrigatório porque é o
 *    único sem o qual o produto não faz nada, e é dele que saem cidade, estado
 *    e fuso (RF-109) e a procura pelo lead que já existe. Enquanto ele não for
 *    um número, não há o que gravar, e o botão diz isso estando desabilitado.
 * 2. **Duplicata se mostra, não se recusa.** Quem digita um telefone que já
 *    está na conta está procurando aquele lead sem saber; a tela o apresenta e
 *    oferece o caminho até ele, em vez de gravar para receber a recusa do
 *    índice único e devolver um erro no lugar da resposta.
 */
export function TelaDeCadastroDeLead() {
  const servico = useServicoDeLeads()
  const servicoDeEquipe = useServicoDeEquipe()
  const navegar = useNavigate()

  const [campos, definirCampos] = useState<CamposDoCadastro>(CADASTRO_EM_BRANCO)
  const [gravando, definirGravando] = useState(false)
  const [falha, definirFalha] = useState<MotivoDoCadastro>()

  const leitura = lerTelefone(campos.telefone)
  const e164 = leitura.e164

  const funil = useQuery({
    queryKey: CHAVE_DO_FUNIL,
    queryFn: () => servico.carregarEtapas(),
  })

  const equipe = useQuery({
    queryKey: CHAVE_DA_EQUIPE,
    queryFn: () => servicoDeEquipe.carregar(),
  })

  // A procura sai a cada E.164 novo, e só quando há um: a chave é o próprio
  // número, então digitar os dígitos que faltam para o número ficar válido não
  // dispara consulta nenhuma até ele ficar.
  const procura = useQuery({
    queryKey: ['lead-por-telefone', e164],
    queryFn: (): Promise<RespostaDaProcura> =>
      e164 === null
        ? Promise.resolve({ ok: true, lead: null })
        : servico.procurarPorTelefone(e164),
    enabled: e164 !== null,
  })

  const cargaDaEquipe = equipe.data
  // Equipe que não carregou não libera escrita, como em `/leads`: a política é
  // quem decide de verdade, e oferecer o botão para descobrir que ela nega
  // trocaria uma negativa explicada por uma recusa no meio do caminho. Os dois
  // casos de travamento são distinguidos na tela: papel de leitura manda pedir
  // acesso, papel que não deu para conferir manda tentar de novo.
  const papel = cargaDaEquipe?.ok ? cargaDaEquipe.equipe.papelDoUsuario : null
  const podeEscrever = papel !== null && podeOperarLeads(papel)
  const administradores = cargaDaEquipe?.ok
    ? quemConcedeAcesso(cargaDaEquipe.equipe.membros)
    : []

  const etapas = funil.data?.ok ? funil.data.etapas : []
  const existente = procura.data?.ok ? procura.data.lead : null
  const recusa = recusaAVista(campos.telefone, leitura)
  const localidade = localidadeAVista(campos, leitura.local)

  function mudar(mudanca: Partial<CamposDoCadastro>) {
    definirCampos((atual) => ({ ...atual, ...mudanca }))
  }

  async function gravar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (e164 === null) return

    definirGravando(true)
    definirFalha(undefined)
    const resultado = await servico.cadastrar(
      montarNovoLead(campos, e164, leitura.local),
    )
    definirGravando(false)

    if (!resultado.ok) {
      definirFalha(resultado.motivo)
      // Duplicado gravado por outra pessoa entre a procura e o clique: refazer
      // a procura é o que faz o cartão do lead existente aparecer embaixo da
      // frase que acabou de dizer que ele existe.
      if (resultado.motivo === 'duplicado') await procura.refetch()
      return
    }

    // A lista filtrada pelo telefone é para onde o cadastro leva: o lead
    // recém-criado é a única linha, e o link fica colável. A ficha do lead é
    // rota da F4 e ainda não existe.
    void navegar({ to: '/leads', search: { ...BUSCA_LIMPA, termo: e164 } })
  }

  return (
    <AreaDeTrabalho titulo={copy.titulo} lead={copy.explicacao}>
      {papel !== null && !podeEscrever ? (
        <NegativaDeLeitura administradores={administradores} />
      ) : null}

      {cargaDaEquipe && !cargaDaEquipe.ok ? (
        <div className="mb-6">
          <CaixaDeErro>{copy.equipeIndisponivel}</CaixaDeErro>
        </div>
      ) : null}

      <form onSubmit={gravar} noValidate className="flex flex-col gap-6">
        <Painel titulo={copy.secoes.telefone} apoio={copy.campos.telefoneExplicacao}>
          <CampoDeTexto
            rotulo={copy.campos.telefone}
            exemplo={copy.campos.telefoneExemplo}
            type="tel"
            name="telefone"
            autoComplete="off"
            value={campos.telefone}
            erro={recusa ? RECUSA_DO_TELEFONE[recusa] : undefined}
            disabled={!podeEscrever}
            onChange={(evento) => mudar({ telefone: evento.target.value })}
          />

          {e164 ? (
            <p className="mt-2.5 mb-0 flex flex-wrap items-center gap-2 text-[12.5px] text-texto-apoio">
              {copy.campos.numeroGravado}{' '}
              <span className="val rounded-selo border border-positivo-borda bg-positivo-fundo px-2.5 py-0.5 font-semibold text-positivo">
                {e164}
              </span>
            </p>
          ) : null}

          {existente ? <Duplicado lead={existente} /> : null}
        </Painel>

        <Painel titulo={copy.secoes.localidade}>
          {localidadeVeioDoDdd(campos, leitura.local) ? (
            <p className="mt-0 mb-4 text-[12.5px] text-texto-apoio">
              {copy.localidade.doDdd(leitura.ddd ?? '')}
            </p>
          ) : null}

          <div className="flex flex-col gap-4">
            <LinhaDeCampos>
              <CampoDeTexto
                rotulo={copy.localidade.cidade}
                name="cidade"
                autoComplete="off"
                value={localidade.cidade}
                disabled={!podeEscrever}
                onChange={(evento) => mudar({ cidade: evento.target.value })}
              />
              <CampoDeTexto
                rotulo={copy.localidade.estado}
                name="estado"
                autoComplete="off"
                maxLength={2}
                value={localidade.estado}
                disabled={!podeEscrever}
                onChange={(evento) => mudar({ estado: evento.target.value })}
              />
            </LinhaDeCampos>

            <CampoDeFuso
              rotulo={copy.localidade.fuso}
              valor={localidade.fuso}
              disabled={!podeEscrever}
              aoTrocar={(fuso) => mudar({ fuso })}
            />
            <p className="m-0 text-[12.5px] text-texto-apoio">{copy.localidade.fusoExplicacao}</p>
          </div>
        </Painel>

        <Painel titulo={copy.secoes.identificacao}>
          <div className="flex flex-col gap-4">
            <LinhaDeCampos>
              <CampoDeTexto
                rotulo={copy.campos.nome}
                name="nome"
                autoComplete="off"
                value={campos.nome}
                disabled={!podeEscrever}
                onChange={(evento) => mudar({ nome: evento.target.value })}
              />
              <CampoDeTexto
                rotulo={copy.campos.email}
                type="email"
                name="email"
                autoComplete="off"
                value={campos.email}
                disabled={!podeEscrever}
                onChange={(evento) => mudar({ email: evento.target.value })}
              />
            </LinhaDeCampos>

            <LinhaDeCampos>
              <CampoDeTexto
                rotulo={copy.campos.empresa}
                name="empresa"
                autoComplete="off"
                value={campos.empresa}
                disabled={!podeEscrever}
                onChange={(evento) => mudar({ empresa: evento.target.value })}
              />
              <CampoDeTexto
                rotulo={copy.campos.origem}
                exemplo={copy.campos.origemExemplo}
                name="origem"
                autoComplete="off"
                value={campos.origem}
                disabled={!podeEscrever}
                onChange={(evento) => mudar({ origem: evento.target.value })}
              />
            </LinhaDeCampos>

            <SeletorDeEtapa
              etapas={etapas}
              valor={campos.etapa}
              aoTrocar={(etapa) => mudar({ etapa })}
            />
          </div>
        </Painel>

        {falha ? <CaixaDeErro>{copy.falhas[falha]}</CaixaDeErro> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={
              !podeGravar({
                e164,
                duplicado: existente !== null,
                gravando,
                podeEscrever,
              })
            }
            className="botao-primario"
          >
            {gravando ? copy.gravando : copy.gravar}
          </button>
          <Link to="/leads" search={BUSCA_LIMPA} className="botao-link">
            {copy.voltar}
          </Link>
        </div>
      </form>
    </AreaDeTrabalho>
  )
}

/**
 * O seletor da etapa. "Sem etapa" é a primeira opção e o padrão: `stage_id` é
 * nulo na tabela, e escolher uma etapa por conta de quem cadastra colocaria o
 * lead no funil sem ninguém ter decidido isso.
 */
function SeletorDeEtapa({
  etapas,
  valor,
  aoTrocar,
}: {
  etapas: readonly EtapaDoFunil[]
  valor: string
  aoTrocar: (valor: string) => void
}) {
  return (
    <Seletor rotulo={copy.campos.etapa} valor={valor} aoTrocar={aoTrocar}>
      <option value="">{copy.campos.semEtapa}</option>
      {etapas.map((etapa) => (
        <option key={etapa.chave} value={etapa.chave}>
          {etapa.rotulo}
        </option>
      ))}
    </Seletor>
  )
}

/** O lead que já responde por este telefone, com o caminho até ele. */
function Duplicado({ lead }: { lead: LeadExistente }) {
  return (
    <div className="bloco-secundario mt-4 border-atencao-borda bg-atencao-fundo text-[13.5px]">
      <p className="m-0 font-semibold text-atencao">
        {copy.duplicado.titulo}
      </p>
      <p className="mt-1.5 mb-3 text-texto-apoio">{copy.duplicado.explicacao}</p>
      <p className="m-0 text-texto-secundario">
        {lead.nome || copy.duplicado.semNome}
        {lead.empresa ? ` · ${lead.empresa}` : ''}{' '}
        <span className="val text-[12.5px] text-texto-apoio">
          {lead.telefone}
        </span>
      </p>
      <Link
        to="/leads"
        search={{ ...BUSCA_LIMPA, termo: lead.telefone }}
        className="botao-link mt-2 inline-block"
      >
        {copy.duplicado.abrir}
      </Link>
    </div>
  )
}

/** Quem acompanha a conta em leitura abre a tela e lê por que não pode gravar. */
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

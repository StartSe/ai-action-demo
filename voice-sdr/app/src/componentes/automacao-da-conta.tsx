import { useQuery } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'

import {
  FAIXA_DO_RECUO,
  FAIXAS_DA_AUTOMACAO,
  mudancasDaAutomacao,
  rascunhoDaAutomacao,
  validarAutomacao,
  type CampoDaAutomacao,
  type ErrosDaAutomacao,
  type RascunhoDaAutomacao,
} from '@/automacao/regras'
import type { AutomacaoDaConta, MotivoDeFalhaDaAutomacao, ServicoDeAutomacao } from '@/automacao/tipos'
import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { Carregando } from '@/componentes/carregando'
import { EstadoVazio } from '@/componentes/estado-vazio'
import { LinhaDeCampos } from '@/componentes/linha-de-campos'
import { Painel } from '@/componentes/painel'
import { automacao as copy } from '@/copy/automacao'
import { useServicoDeDiscagem } from '@/discagem/contexto'

const CHAVE_DA_AUTOMACAO = ['automacao-da-conta'] as const

/**
 * A seção de automação de /config/discagem (US-190), nos quatro estados:
 * carregando, falha, vazio e o formulário. Quem a desenha é a tela da política,
 * no ramo de quem administra: o operador recebe a negativa explícita da tela
 * inteira, antes de chegar aqui.
 */
/**
 * A seção como /config/discagem a monta: o serviço vem do de discagem
 * (`automacao`), e sem ele a seção não aparece.
 */
export function AutomacaoDaDiscagem() {
  const servico = useServicoDeDiscagem().automacao
  return servico ? <AutomacaoDaConta servico={servico} /> : null
}

export function AutomacaoDaConta({ servico }: { servico: ServicoDeAutomacao }) {
  const consulta = useQuery({ queryKey: CHAVE_DA_AUTOMACAO, queryFn: () => servico.carregar() })

  return (
    <section aria-label={copy.titulo} className="mt-8 flex flex-col gap-4">
      <div>
        <h2 className="titulo-de-secao m-0">{copy.titulo}</h2>
        <p className="mt-1 mb-0 text-[13px] text-texto-apoio">{copy.explicacao}</p>
      </div>
      {consulta.isPending ? (
        <Carregando texto={copy.carregando} />
      ) : !consulta.data?.ok ? (
        <CaixaDeErro>{copy.falhas[consulta.data?.motivo ?? 'falha-de-comunicacao']}</CaixaDeErro>
      ) : !consulta.data.automacao ? (
        <EstadoVazio titulo={copy.vazio.titulo} explicacao={copy.vazio.explicacao} />
      ) : (
        <Formulario servico={servico} automacao={consulta.data.automacao} />
      )}
    </section>
  )
}

function mensagem(campo: CampoDaAutomacao, erros: ErrosDaAutomacao): string | undefined {
  const motivo = erros[campo]
  if (!motivo) return undefined
  if (motivo !== 'fora-da-faixa') return copy.errosDoCampo[motivo]
  const faixa =
    campo === 'retentativaRecuosMinutos'
      ? FAIXA_DO_RECUO
      : campo === 'turnos'
        ? null
        : FAIXAS_DA_AUTOMACAO[campo]
  return faixa ? `${copy.errosDoCampo[motivo]} ${copy.faixa(faixa.minimo, faixa.maximo)}` : copy.errosDoCampo[motivo]
}

function Formulario({ servico, automacao }: { servico: ServicoDeAutomacao; automacao: AutomacaoDaConta }) {
  const [base, definirBase] = useState(automacao)
  const [rascunho, definirRascunho] = useState<RascunhoDaAutomacao>(() => rascunhoDaAutomacao(automacao))
  const [erros, definirErros] = useState<ErrosDaAutomacao>({})
  const [motivo, definirMotivo] = useState('')
  const [motivoFaltando, definirMotivoFaltando] = useState(false)
  const [aviso, definirAviso] = useState<'campos' | 'nada-mudou' | 'salva' | null>(null)
  const [falha, definirFalha] = useState<MotivoDeFalhaDaAutomacao | null>(null)
  const [salvando, definirSalvando] = useState(false)
  const idDosTurnos = useId()

  function alterar(campo: CampoDaAutomacao, valor: string) {
    definirRascunho((atual) => ({ ...atual, [campo]: valor }))
  }

  async function gravar(evento: FormEvent) {
    evento.preventDefault()
    definirAviso(null)
    definirFalha(null)
    const validacao = validarAutomacao(rascunho)
    if (!validacao.ok) {
      definirErros(validacao.erros)
      definirAviso('campos')
      return
    }
    definirErros({})
    const mudancas = mudancasDaAutomacao(base, validacao.automacao)
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
    definirBase(resultado.automacao)
    definirRascunho(rascunhoDaAutomacao(resultado.automacao))
    definirMotivo('')
    definirAviso('salva')
  }

  const campo = (nome: Exclude<CampoDaAutomacao, 'turnos'>) => (
    <CampoDeTexto
      rotulo={copy.campos[nome].rotulo}
      exemplo={copy.campos[nome].unidade}
      apoio={copy.campos[nome].consequencia}
      inputMode={nome === 'retentativaRecuosMinutos' ? 'text' : 'numeric'}
      value={rascunho[nome]}
      erro={mensagem(nome, erros)}
      onChange={(evento) => alterar(nome, evento.target.value)}
    />
  )

  return (
    <form onSubmit={gravar} noValidate aria-label={copy.titulo} className="flex flex-col gap-6">
      <Painel titulo={copy.grupos.lembrete}>
        <LinhaDeCampos>
          {campo('lembreteFimMinutos')}
          {campo('lembreteInicioMinutos')}
        </LinhaDeCampos>
      </Painel>

      <Painel titulo={copy.grupos.retentativa}>
        <div className="flex flex-col gap-5">
          <LinhaDeCampos>
            {campo('retentativaTeto')}
            {campo('retentativaOcupadoMinutos')}
          </LinhaDeCampos>
          {campo('retentativaRecuosMinutos')}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={idDosTurnos} className="text-[13px] font-semibold">
                {copy.campos.turnos.rotulo}
              </label>
              <span className="val text-[11.5px] text-texto-desativado">{copy.campos.turnos.unidade}</span>
            </div>
            <textarea
              id={idDosTurnos}
              rows={4}
              className={`val ${erros.turnos ? 'campo-recusado' : 'campo'}`}
              aria-invalid={erros.turnos ? true : undefined}
              value={rascunho.turnos}
              onChange={(evento) => alterar('turnos', evento.target.value)}
            />
            {erros.turnos ? <p className="m-0 text-[12.5px] text-perigo">{mensagem('turnos', erros)}</p> : null}
            <p className="m-0 text-[12.5px] text-texto-apoio">{copy.campos.turnos.consequencia}</p>
          </div>
        </div>
      </Painel>

      <Painel titulo={copy.grupos.resgate}>
        <LinhaDeCampos>
          {campo('resgateTeto')}
          {campo('resgateRecuoMinutos')}
        </LinhaDeCampos>
      </Painel>

      <div className="flex flex-col gap-3">
        <CampoDeTexto
          rotulo={copy.motivo.rotulo}
          exemplo={copy.motivo.exemplo}
          value={motivo}
          erro={motivoFaltando ? copy.motivo.faltando : undefined}
          onChange={(evento) => definirMotivo(evento.target.value)}
        />
        {aviso === 'campos' ? <CaixaDeErro tom="atencao">{copy.camposComErro}</CaixaDeErro> : null}
        {aviso === 'nada-mudou' ? <CaixaDeErro tom="atencao">{copy.nadaMudou}</CaixaDeErro> : null}
        {aviso === 'salva' ? (
          <p role="status" className="m-0 text-[12.5px] font-semibold text-positivo">
            {copy.salva}
          </p>
        ) : null}
        {falha ? <CaixaDeErro>{copy.falhas[falha]}</CaixaDeErro> : null}
        <div>
          <button type="submit" className="botao-primario" disabled={salvando}>
            {salvando ? copy.salvando : copy.salvar}
          </button>
        </div>
      </div>
    </form>
  )
}

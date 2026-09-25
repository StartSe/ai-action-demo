// O cartão de diagnóstico na ficha da chamada.
//
// O que se prova: o botão, a espera, os achados com a severidade em selo, a
// explicação do modelo, cada proposta com o antes e o depois, a confirmação
// antes de aplicar ou descartar, e o botão de publicar só depois de aplicar —
// pelo playbook quando a proposta é de roteiro, republicando a Sarah no resto.
//
// A análise passa por `atenderDiagnostico` de verdade (o dublê usa a porta em
// memória da borda sobre as fixtures da ElevenLabs): os achados que a tela
// mostra são os que a regra concluiria.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ERRO_DO_MODELO, CONVERSA_DE_EXEMPLO } from '@diagnostico/conversas-de-exemplo.ts'
import { caminhoDaConversa } from '@diagnostico/formato-do-provedor.ts'
import { provedorDeExemplo } from '@diagnostico/porta-em-memoria.ts'
import { REGRAS } from '@diagnostico/regras.ts'

import { diagnostico as copy } from '@/copy/diagnostico'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  CHAMADA_ENCERRADA,
  criarServicoDeChamadasDublado,
  fichaDeExemplo,
} from '@/testes/servico-de-chamadas-dublado'
import { criarServicoDaSarahDublado, type ServicoDaSarahDublado } from '@/testes/servico-da-sarah-dublado'
import {
  criarServicoDeDiagnosticoDublado,
  type RespostasDoDiagnostico,
  type ServicoDeDiagnosticoDublado,
} from '@/testes/servico-de-diagnostico-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

const regra = (codigo: string) => REGRAS.find((item) => item.codigo === codigo)!

async function abrir(
  respostas: RespostasDoDiagnostico = {},
): Promise<{ diagnostico: ServicoDeDiagnosticoDublado; sarah: ServicoDaSarahDublado }> {
  const diagnostico = criarServicoDeDiagnosticoDublado(respostas)
  const sarah = criarServicoDaSarahDublado()
  const chamadas = criarServicoDeChamadasDublado({
    fichas: { [CHAMADA_ENCERRADA]: { ok: true, ficha: fichaDeExemplo() } },
  })
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    `/chamadas/${CHAMADA_ENCERRADA}`,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    sarah,
    undefined,
    chamadas,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    diagnostico,
  )
  return { diagnostico, sarah }
}

async function cartao(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: copy.titulo })
}

async function analisar() {
  const regiao = await cartao()
  fireEvent.click(await within(regiao).findByRole('button', { name: copy.analisar }))
  await within(regiao).findByRole('heading', { name: copy.achados.titulo })
  return regiao
}

function confirmarDialogo(nome: string) {
  const dialogo = screen.getByRole('dialog')
  fireEvent.click(within(dialogo).getByRole('button', { name: nome }))
}

afterEach(cleanup)

describe('/chamadas/:id — o diagnóstico', () => {
  it('abre só com o botão, e a análise mostra a espera', async () => {
    await abrir({ analisePendente: true })
    const regiao = await cartao()
    expect(within(regiao).queryByRole('heading', { name: copy.achados.titulo })).toBeNull()
    fireEvent.click(await within(regiao).findByRole('button', { name: copy.analisar }))
    expect(await within(regiao).findByText(copy.analisando)).toBeTruthy()
    expect((within(regiao).getByRole('button', { name: copy.analisar }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('a ligação do "pode sim": achado com selo de erro, a causa e a proposta com antes e depois', async () => {
    const { diagnostico } = await abrir()
    const regiao = await analisar()
    expect(diagnostico.analises).toEqual([CHAMADA_ENCERRADA])

    const achados = within(regiao).getByRole('list', { name: copy.achados.titulo })
    const doEndCall = within(achados).getByText(regra('encerrada_por_end_call_cedo').titulo).closest('li')!
    expect(within(doEndCall).getByText(copy.severidade.erro)).toBeTruthy()
    expect(doEndCall.textContent).toContain('Pode sim.')

    expect(within(regiao).getByText(copy.leitura.causa)).toBeTruthy()
    expect(within(regiao).getByText(/tratou o "pode sim" como aceite final/)).toBeTruthy()

    const proposta = within(regiao).getByRole('listitem', { name: 'Não encerrar quando o lead só autoriza a conversa' })
    expect(proposta.textContent).toContain('3. Encerre quando o lead aceitar.')
    expect(proposta.textContent).toContain('faça a primeira pergunta')
    expect(within(proposta).getByText('Roteiro de Descoberta')).toBeTruthy()
    // Publicar só aparece depois de aplicar.
    expect(within(proposta).queryByRole('button', { name: copy.publicar.botao })).toBeNull()

    // A proposta de alvo inventado não virou proposta: virou achado de informação.
    expect(within(achados).getByText(/Uma sugestão do modelo ficou de fora: Alvo inventado/)).toBeTruthy()
  })

  it('aplicar pede confirmação, e publicar o roteiro vai pelo playbook com a nota da chamada', async () => {
    const { diagnostico, sarah } = await abrir()
    const regiao = await analisar()
    const proposta = within(regiao).getByRole('listitem', { name: 'Não encerrar quando o lead só autoriza a conversa' })

    fireEvent.click(within(proposta).getByRole('button', { name: copy.propostas.aplicar }))
    expect(screen.getByRole('dialog').textContent).toContain('versão nova em rascunho')
    expect(diagnostico.aplicadas).toEqual([])
    confirmarDialogo(copy.confirmar.confirmar)

    await waitFor(() => expect(diagnostico.aplicadas).toHaveLength(1))
    const aplicada = await within(regiao).findByRole('listitem', { name: 'Não encerrar quando o lead só autoriza a conversa' })
    expect(within(aplicada).getByText(copy.propostas.aplicada)).toBeTruthy()
    expect(sarah.publicacoesDeVersao).toEqual([])
    expect(sarah.chamadasAoAgentPublish()).toBe(0)

    fireEvent.click(within(aplicada).getByRole('button', { name: copy.publicar.botao }))
    confirmarDialogo(copy.publicar.confirmar)
    await waitFor(() =>
      expect(sarah.publicacoesDeVersao).toEqual([
        { proposito: 'discovery', versaoId: 'v-diagnostico-1', nota: copy.publicar.nota(CHAMADA_ENCERRADA) },
      ]),
    )
  })

  it('sem modelo, os achados aparecem com o aviso e a proposta de republicar, que publica a assistente', async () => {
    const { diagnostico, sarah } = await abrir({
      borda: {
        modelo: 'sem_credencial',
        provedor: provedorDeExemplo({ [caminhoDaConversa(CONVERSA_DE_EXEMPLO)]: ERRO_DO_MODELO }),
      },
    })
    const regiao = await analisar()
    expect(within(regiao).getByText(/conecte um provedor de modelo em Integrações/)).toBeTruthy()
    expect(within(regiao).getByRole('link', { name: copy.irParaIntegracoes }).getAttribute('href')).toBe(
      '/config/integracoes',
    )
    expect(within(regiao).getByText(regra('encerrada_por_erro_do_modelo').titulo)).toBeTruthy()

    const proposta = within(regiao).getByRole('listitem', { name: 'Publicar a assistente de novo' })
    fireEvent.click(within(proposta).getByRole('button', { name: copy.propostas.aplicar }))
    expect(screen.getByRole('dialog').textContent).toContain(copy.confirmar.explicacaoDaPublicacao)
    confirmarDialogo(copy.confirmar.confirmar)
    await waitFor(() => expect(diagnostico.aplicadas).toHaveLength(1))

    fireEvent.click(await within(regiao).findByRole('button', { name: copy.publicar.botao }))
    confirmarDialogo(copy.publicar.confirmar)
    await waitFor(() => expect(sarah.chamadasAoAgentPublish()).toBe(1))
    expect(sarah.publicacoesDeVersao).toEqual([])
  })

  it('descartar pede confirmação e tira os botões da proposta', async () => {
    const { diagnostico } = await abrir()
    const regiao = await analisar()
    const proposta = within(regiao).getByRole('listitem', { name: 'Não encerrar quando o lead só autoriza a conversa' })
    fireEvent.click(within(proposta).getByRole('button', { name: copy.propostas.descartar }))
    confirmarDialogo(copy.confirmar.descartar)

    await waitFor(() => expect(diagnostico.descartadas).toHaveLength(1))
    const descartada = await within(regiao).findByRole('listitem', { name: 'Não encerrar quando o lead só autoriza a conversa' })
    await within(descartada).findByText(copy.propostas.descartada)
    expect(within(descartada).queryByRole('button')).toBeNull()
  })

  it('cancelar a confirmação não aplica nada', async () => {
    const { diagnostico } = await abrir()
    const regiao = await analisar()
    const proposta = within(regiao).getByRole('listitem', { name: 'Não encerrar quando o lead só autoriza a conversa' })
    fireEvent.click(within(proposta).getByRole('button', { name: copy.propostas.aplicar }))
    confirmarDialogo(copy.confirmar.cancelar)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(diagnostico.aplicadas).toEqual([])
  })

  it('o valor que mudou desde a análise vira a frase da recusa, e a proposta continua pendente', async () => {
    await abrir({ recusaAoAplicar: 'SD001' })
    const regiao = await analisar()
    const proposta = within(regiao).getByRole('listitem', { name: 'Não encerrar quando o lead só autoriza a conversa' })
    fireEvent.click(within(proposta).getByRole('button', { name: copy.propostas.aplicar }))
    confirmarDialogo(copy.confirmar.confirmar)

    expect((await within(proposta).findByRole('alert')).textContent).toBe(copy.recusas.SD001)
    expect(within(proposta).getByText(copy.propostas.pendente)).toBeTruthy()
  })

  it('a análise gravada aparece ao abrir, com o botão de analisar de novo', async () => {
    const primeiro = criarServicoDeDiagnosticoDublado()
    const analise = await primeiro.analisar(CHAMADA_ENCERRADA)
    if (!analise.ok) throw new Error('a análise do dublê falhou')

    await abrir({ existente: analise.diagnostico })
    const regiao = await cartao()
    expect(await within(regiao).findByRole('button', { name: copy.analisarDeNovo })).toBeTruthy()
    expect(within(regiao).getByText(regra('encerrada_por_end_call_cedo').titulo)).toBeTruthy()
  })

  it('carga que falha vira caixa de erro, e o botão continua', async () => {
    await abrir({ cargaFalha: true })
    const regiao = await cartao()
    expect((await within(regiao).findByRole('alert')).textContent).toBe(copy.falhaDaCarga)
    expect(within(regiao).getByRole('button', { name: copy.analisar })).toBeTruthy()
  })
})

// A conta das jornadas por persona (docs/personas.md): os dublês de sempre,
// ligados entre si para que o que uma tela grava resolva o passo que o banco
// mediria. Nos testes de tela cada dublê responde sozinho; numa jornada a
// pessoa atravessa o tutorial inteiro, e o assistente precisa ver a conta
// mudar enquanto ela anda.
//
// O que se liga aqui, e só isto:
//
// - o modelo passa a conectado quando a volta do OAuth conclui;
// - `credenciais` resolve com a voz e a telefonia conectadas;
// - `agente` resolve com a identidade gravada com empresa;
// - `roteiro` resolve quando o roteiro de descoberta é publicado;
// - `numero` resolve quando uma linha é cadastrada e registrada.
//
// O resto (especialista, agenda, leads, equipe) fica pendente como numa conta
// que acabou de nascer.

import { PROPOSITOS } from '@compartilhado/playbook/camada-um.ts'

import type { EstadoDoModelo } from '@/sarah/tipos'
import type { PassoMedido } from '@/configuracao-inicial/tipos'
import { criarServicoDeChamadasDublado, type RespostasDeChamadas } from '@/testes/servico-de-chamadas-dublado'
import {
  criarServicoDeConfiguracaoDublado,
  passosDeExemplo,
} from '@/testes/servico-de-configuracao-dublado'
import { criarServicoDeDiscagemDublado } from '@/testes/servico-de-discagem-dublado'
import {
  criarServicoDeIntegracoesDublado,
  integracoesDeExemplo,
} from '@/testes/servico-de-integracoes-dublado'
import { criarServicoDeNumerosDublado } from '@/testes/servico-de-numeros-dublado'
import {
  catalogoDeExemplo,
  criarServicoDaSarahDublado,
  type ServicoDaSarahDublado,
} from '@/testes/servico-da-sarah-dublado'

/** Uma conta recém-fundada: nada conectado, nada gravado, nada no ar. */
function passosDaContaNova(): PassoMedido[] {
  return passosDeExemplo().map((passo) => ({
    ...passo,
    pendente: true,
    marcado: false,
    estado: 'pendente' as const,
  }))
}

/** Os provedores de uma conta nova: nenhum com chave. */
function integracoesSemChave() {
  return integracoesDeExemplo().map((item) => ({
    ...item,
    estado: 'nao_configurado' as const,
    configurado: false,
    conectado: false,
    erro: null,
    credito: null,
    cota: null,
    chaves: item.chaves.map((chave) => ({ ...chave, preenchida: false })),
  }))
}

const MODELO_DA_PLATAFORMA: EstadoDoModelo = {
  porta: 'platform',
  conectadoEm: null,
  finalDaChave: null,
  escolhas: { draft: null, classify: null, review: null, imagem: null, audio: null },
}

const MODELO_DA_CONTA: EstadoDoModelo = {
  porta: 'openrouter',
  conectadoEm: '2026-09-25T10:00:00.000Z',
  finalDaChave: 'k9x2',
  escolhas: { draft: null, classify: null, review: null, imagem: null, audio: null },
}

export interface OpcoesDaContaDaJornada {
  /** O que a telefonia do dublê de chamadas responde (janela, relógio, freio). */
  chamadas?: RespostasDeChamadas
}

/**
 * Os serviços de uma conta que acabou de ser fundada, ligados entre si. Os
 * dublês continuam sendo os de `src/testes/`: aqui só se embrulham os
 * métodos cuja escrita o banco mediria.
 */
export function criarContaDaJornada(opcoes: OpcoesDaContaDaJornada = {}) {
  let modelo: EstadoDoModelo = MODELO_DA_PLATAFORMA
  let identidadeComEmpresa = false
  let roteiroPublicado = false
  let numeroRegistrado = false

  const integracoes = criarServicoDeIntegracoesDublado({ integracoes: integracoesSemChave() })
  const conectados = new Set<string>()
  const salvarChave = integracoes.salvar.bind(integracoes)
  integracoes.salvar = async (provedor, valores) => {
    const resultado = await salvarChave(provedor, valores)
    if (resultado.ok) conectados.add(provedor)
    return resultado
  }

  const base = criarServicoDaSarahDublado({
    sarah: { identidade: null, publicacao: 'rascunho' },
    voz: {
      temIdentidade: false,
      vozEscolhida: null,
      ajustes: {},
      catalogo: catalogoDeExemplo(),
      publicacao: 'rascunho',
    },
    playbooks: {
      playbooks: PROPOSITOS.map((proposito) => ({ proposito, versoes: [] })),
      publicacao: 'rascunho',
      foraDaPlataforma: [],
    },
  })
  const sarah: ServicoDaSarahDublado = {
    ...base,
    async carregarModelo() {
      return { ok: true, estado: modelo }
    },
    async concluirConexaoDoModelo(codigo, estado) {
      const resultado = await base.concluirConexaoDoModelo(codigo, estado)
      if (resultado.ok) modelo = MODELO_DA_CONTA
      return resultado
    },
    async salvarIdentidade(identidade) {
      const resultado = await base.salvarIdentidade(identidade)
      if (resultado.ok && identidade.empresa.trim() !== '') identidadeComEmpresa = true
      return resultado
    },
    async publicarPlaybook(pedido) {
      const resultado = await base.publicarPlaybook(pedido)
      if (resultado.ok && pedido.proposito === 'discovery' && resultado.relatorio.recusa === null) {
        roteiroPublicado = true
      }
      return resultado
    },
  }

  const numeros = criarServicoDeNumerosDublado({ registro: { estado: 'registrada' } })
  const cadastrarLinha = numeros.cadastrar.bind(numeros)
  numeros.cadastrar = async (dados) => {
    const resultado = await cadastrarLinha(dados)
    if (resultado.ok && resultado.registro.estado === 'registrada') numeroRegistrado = true
    return resultado
  }

  const configuracao = criarServicoDeConfiguracaoDublado({
    passos: passosDaContaNova(),
    medir: () => ({
      credenciais: !(conectados.has('voz') && conectados.has('telefonia')),
      agente: !identidadeComEmpresa,
      roteiro: !roteiroPublicado,
      numero: !numeroRegistrado,
    }),
  })

  const chamadas = criarServicoDeChamadasDublado(opcoes.chamadas)
  const discagem = criarServicoDeDiscagemDublado({ numerosDeTeste: [] })

  return { integracoes, sarah, numeros, configuracao, chamadas, discagem, base }
}

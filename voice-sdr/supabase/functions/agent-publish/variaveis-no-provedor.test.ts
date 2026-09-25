// A varredura das variáveis: nenhum texto que vai ao provedor de voz leva
// marcador cru, e nenhuma variável fica sem valor.
//
// O defeito que ela segura: o compilador deixava `{nome_do_lead}` no prompt,
// e o provedor só interpola `{{nome}}` — o marcador ficava no prompt como
// texto, para sempre, e a Sarah podia chamar o lead de "nome_do_lead". A
// varredura compila os quatro propósitos com textos da conta que citam todo
// tipo de marcador (da conta, da chamada, desconhecido e na forma dupla),
// traduz para o corpo do provedor e percorre **toda** string do corpo:
//
// 1. nenhuma `{chave}` de chave simples;
// 2. toda `{{chave}}` é do sistema do provedor ou tem valor inicial declarado;
// 3. com o lead vazio e com o lead preenchido, a conversa que a abertura
//    monta traz todas as variáveis citadas, nenhum valor é o nome da própria
//    variável, e o prompt interpolado como o provedor o faria não tem chave
//    nenhuma nem nome de variável.

import { describe, expect, test } from 'vitest'

import { montarAbertura, type LeadDaAbertura } from '../_shared/agente/abertura-da-chamada.ts'
import {
  VARIAVEIS_DA_CHAMADA,
  compilarPublicacao,
  type PedidoDeCompilacao,
} from '../_shared/agente/compilador.ts'
import { PROPOSITOS, type Proposito } from '../_shared/playbook/camada-um.ts'
import { corpoDoProvedor, type CorpoDoProvedor } from './formato-do-provedor.ts'

const TODO_TIPO_DE_MARCADOR =
  'Fale com {nome_do_lead}, da {empresa_do_lead}, em {cidade_do_lead}. ' +
  'O especialista é {nome_do_especialista}. A {empresa} oferece {oferta}. ' +
  'Pergunte o {cargo} e trate {{nome_do_lead}} por você. {{variavel_inventada}} {Nome_Do_Lead}.'

function pedido(proposito: Proposito, gravacaoLigada: boolean): PedidoDeCompilacao {
  return {
    proposito,
    identidade: {
      nome: 'Sarah',
      empresa: 'Empresa Fictícia',
      oferta: null,
      nuncaAfirmar: [],
      vozId: 'voz-1',
      ajustesDeVoz: {},
      primeiraFala: 'Oi, {nome_do_lead}, da {empresa_do_lead}? Aqui é a {nome_do_agente}, da {empresa}. {cargo}',
    },
    playbookPublicado: {
      playbookVersionId: '11111111-1111-4111-8111-111111111111',
      versao: 1,
      camadaDois: TODO_TIPO_DE_MARCADOR,
      camadaTres: TODO_TIPO_DE_MARCADOR,
    },
    politica: {
      duracaoMaximaSegundos: 600,
      gravacaoLigada,
      avisoDeGravacao: gravacaoLigada ? 'Oi, {nome_do_lead}. A {empresa} grava esta ligação.' : null,
      retencaoDias: 30,
    },
  }
}

async function corpo(proposito: Proposito, gravacaoLigada = true): Promise<CorpoDoProvedor> {
  const { configuracao } = await compilarPublicacao(pedido(proposito, gravacaoLigada))
  return corpoDoProvedor(configuracao, {
    enderecoDasFerramentas: 'https://exemplo.invalid/functions/v1',
    segredoDeFerramenta: 'segredo',
  })
}

/** Toda string do corpo, com o caminho dela, para a falha dizer onde. */
function textos(valor: unknown, caminho = ''): { caminho: string; texto: string }[] {
  if (typeof valor === 'string') return [{ caminho, texto: valor }]
  if (Array.isArray(valor)) return valor.flatMap((item, i) => textos(item, `${caminho}[${i}]`))
  if (valor !== null && typeof valor === 'object') {
    return Object.entries(valor).flatMap(([chave, item]) => textos(item, `${caminho}.${chave}`))
  }
  return []
}

const CHAVE_SIMPLES = /(?<!\{)\{([A-Za-z0-9_]+)\}(?!\})/g
const CHAVE_DUPLA = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g

const LEADS: Readonly<Record<string, LeadDaAbertura | null>> = {
  vazio: null,
  'sem nome': { nome: '  ', empresa: null, cidade: null },
  preenchido: { nome: 'Pessoa Fictícia', empresa: 'Negócio Fictício', cidade: 'Cidade Fictícia' },
}

describe('nenhum marcador cru chega ao provedor', () => {
  for (const proposito of PROPOSITOS) {
    test(`${proposito}: nenhuma chave simples em texto nenhum do corpo`, async () => {
      for (const gravacao of [true, false]) {
        const cruas = textos(await corpo(proposito, gravacao)).flatMap(({ caminho, texto }) =>
          [...texto.matchAll(CHAVE_SIMPLES)].map((casamento) => `${caminho}: ${casamento[0]}`),
        )
        expect(cruas).toEqual([])
      }
    })

    test(`${proposito}: toda variável citada é do sistema ou tem valor inicial`, async () => {
      const publicado = await corpo(proposito)
      const iniciais = publicado.conversation_config.agent.dynamic_variables.dynamic_variable_placeholders
      const semValor = textos(publicado).flatMap(({ caminho, texto }) =>
        [...texto.matchAll(CHAVE_DUPLA)]
          .map((casamento) => casamento[1] ?? '')
          .filter((chave) => !chave.startsWith('system__') && !(chave in iniciais))
          .map((chave) => `${caminho}: {{${chave}}}`),
      )
      expect(semValor).toEqual([])
      // E o prompt cita de fato o nome do lead na forma do provedor.
      expect(publicado.conversation_config.agent.prompt.prompt).toContain('{{nome_do_lead}}')
    })

    test(`${proposito}: a primeira fala publicada não leva dado de chamada nem vaga`, async () => {
      const fala = (await corpo(proposito)).conversation_config.agent.first_message
      expect(fala).toBe('Oi? Aqui é a Sarah, da Empresa Fictícia.')
    })
  }
})

describe('a conversa traz toda variável que o prompt cita', () => {
  for (const [rotulo, lead] of Object.entries(LEADS)) {
    test(`lead ${rotulo}: nenhuma ausente, nenhum valor é o nome da variável`, async () => {
      const abertura = montarAbertura({
        identidade: { nome: 'Sarah', empresa: 'Empresa Fictícia', primeiraFala: null },
        politica: { gravacaoLigada: true, avisoDeGravacao: null },
        lead,
      })

      for (const variavel of VARIAVEIS_DA_CHAMADA) {
        expect(Object.keys(abertura.variaveis)).toContain(variavel)
      }
      for (const [chave, valor] of Object.entries(abertura.variaveis)) {
        expect(valor).not.toContain(chave)
        expect(valor).not.toMatch(/[{}]/)
      }
      expect(abertura.primeiraFala).not.toMatch(/[{}]|nome_do_lead|, \?/)

      for (const proposito of PROPOSITOS) {
        const publicado = await corpo(proposito)
        const valores = {
          ...publicado.conversation_config.agent.dynamic_variables.dynamic_variable_placeholders,
          ...abertura.variaveis,
        }
        // A interpolação do provedor, do jeito que a documentação a descreve.
        const falado = publicado.conversation_config.agent.prompt.prompt.replace(
          CHAVE_DUPLA,
          (original, chave: string) => valores[chave] ?? original,
        )
        expect(falado).not.toMatch(/\{\{|\}\}/)
        for (const variavel of VARIAVEIS_DA_CHAMADA) expect(falado).not.toContain(variavel)
        if (lead?.nome?.trim()) expect(falado).toContain(lead.nome)
      }
    })
  }
})

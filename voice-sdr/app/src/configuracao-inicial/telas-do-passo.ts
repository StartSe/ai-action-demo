/**
 * Que tela cada passo do assistente embute, e como o assistente fica sabendo
 * que ela gravou. Os dois ficam fora do componente: o mapa se testa sozinho
 * (nenhum passo do catálogo sem tela), e o embrulho do serviço se prova
 * contando chamadas.
 *
 * O passo não copia formulário nenhum. Ele monta o componente da tela com
 * `dentroDoAssistente`, e a tela grava pelo serviço do contexto de sempre.
 */

import type { PassoId } from '@/configuracao-inicial/tipos'
import type { ServicoDeDiscagem } from '@/discagem/tipos'
import type { ServicoDeEquipe } from '@/equipe/tipos'
import type { ServicoDeEspecialistas } from '@/especialistas/tipos'
import type { ServicoDeIntegracoes } from '@/integracoes/tipos'
import type { ServicoDeLeads } from '@/leads/tipos'
import type { ServicoDeNumeros } from '@/numeros/tipos'
import type { ServicoDePrivacidade } from '@/privacidade/tipos'
import type { ServicoDaSarah } from '@/sarah/tipos'

/** As telas que um passo pode embutir. */
export type TelaEmbutida =
  | 'integracoes'
  | 'identidade'
  | 'voz'
  | 'playbooks'
  | 'numeros'
  | 'especialistas'
  | 'importacao'
  | 'equipe'
  | 'discagem'
  | 'privacidade'

/**
 * Os passos do assistente: os do catálogo do banco e o fecho, que só existe
 * na interface e não embute nada.
 */
export type PassoDoAssistente = PassoId | 'concluida'

const TELAS_DO_PASSO: Record<PassoDoAssistente, readonly TelaEmbutida[]> = {
  credenciais: ['integracoes'],
  agente: ['identidade', 'voz'],
  // A privacidade muda o que a Sarah diz no começo da ligação, e a discagem é
  // a política da linha: as duas vêm com o passo que já está ali (US-253).
  roteiro: ['playbooks', 'privacidade'],
  numero: ['numeros', 'discagem'],
  especialista: ['especialistas'],
  agenda: ['especialistas'],
  leads: ['importacao'],
  equipe: ['equipe'],
  concluida: [],
}

export function telasDoPasso(passo: PassoDoAssistente): readonly TelaEmbutida[] {
  return TELAS_DO_PASSO[passo]
}

/** A rota de cada tela, para o atalho de abrir em tela cheia. */
export const CAMINHO_DA_TELA: Record<TelaEmbutida, string> = {
  integracoes: '/config/integracoes',
  identidade: '/sarah/identidade',
  voz: '/sarah/voz',
  playbooks: '/sarah/playbooks',
  numeros: '/numeros',
  especialistas: '/especialistas',
  importacao: '/leads/importar',
  equipe: '/config/equipe',
  discagem: '/config/discagem',
  privacidade: '/config/privacidade',
}

/** Os métodos de um serviço que só leem. */
export type LeiturasDe<S> = readonly Extract<keyof S, string>[]

/**
 * Devolve o mesmo serviço, com `aoGravar` chamado depois de toda operação que
 * não está em `leituras`, dizendo se ela foi aceita. É assim que o assistente pede a medição de novo
 * quando a tela embutida grava, sem que nenhuma tela saiba que está dentro
 * dele.
 *
 * A lista é das leituras, e não das escritas, de propósito: método novo que
 * ninguém classificou medirá de novo à toa, que é barato; uma escrita
 * esquecida deixaria o passo pendente depois de resolvido.
 *
 * O embrulho é `Proxy` sobre o próprio serviço, nunca cópia espalhada: o
 * `this` de cada método continua sendo o original.
 */
export function remedirDepoisDeGravar<S extends object>(
  servico: S,
  leituras: LeiturasDe<S>,
  aoGravar: (aceita: boolean) => void,
): S {
  const soLeem = new Set<PropertyKey>(leituras)

  return new Proxy(servico, {
    get(alvo, nome) {
      const valor: unknown = Reflect.get(alvo, nome, alvo)
      if (typeof valor !== 'function' || soLeem.has(nome)) return valor

      return (...argumentos: unknown[]) => {
        const resposta: unknown = Reflect.apply(valor, alvo, argumentos)
        if (resposta instanceof Promise) {
          return resposta.then(
            (valor: unknown) => {
              aoGravar(gravacaoAceita(valor))
              return valor
            },
            (erro: unknown) => {
              aoGravar(false)
              throw erro
            },
          )
        }
        aoGravar(gravacaoAceita(resposta))
        return resposta
      }
    },
  })
}

/**
 * Se a escrita foi aceita. Os serviços devolvem `{ ok: false, motivo }` na
 * recusa, e é só essa forma que conta como recusa: o que não traz `ok` foi
 * gravado. Com a gravação aceita, a alteração da tela deixa de estar pendente.
 */
export function gravacaoAceita(resultado: unknown): boolean {
  if (typeof resultado !== 'object' || resultado === null) return true
  return !('ok' in resultado) || resultado.ok !== false
}

/**
 * As leituras dos serviços que as telas embutidas usam. Testar a chave e
 * ouvir a amostra de voz entram aqui porque não mudam dado nenhum que o
 * catálogo mede.
 */
export const LEITURAS = {
  integracoes: ['carregar', 'testar', 'carregarEntradaDeLeads'] satisfies LeiturasDe<ServicoDeIntegracoes>,
  sarah: [
    'carregarIdentidade',
    'carregarVoz',
    'ouvirAmostra',
    'carregarModelo',
    'carregarCatalogoDeModelos',
    'carregarPlaybooks',
    'gerarRascunho',
    'carregarConhecimento',
  ] satisfies LeiturasDe<ServicoDaSarah>,
  numeros: ['carregar'] satisfies LeiturasDe<ServicoDeNumeros>,
  especialistas: [
    'carregar',
    'carregarAgenda',
    'prepararConexaoDoCalendario',
  ] satisfies LeiturasDe<ServicoDeEspecialistas>,
  leads: [
    'listar',
    'carregarEtapas',
    'carregarFunil',
    'carregarConfiguracaoDasEtapas',
    'carregarFichaDoLead',
    'procurarPorTelefone',
    'exportar',
    'preverImportacao',
  ] satisfies LeiturasDe<ServicoDeLeads>,
  equipe: ['carregar', 'lerConvite'] satisfies LeiturasDe<ServicoDeEquipe>,
  discagem: ['carregar', 'numerosDeTeste', 'portao', 'ligacaoAoLeadNovo'] satisfies LeiturasDe<ServicoDeDiscagem>,
  privacidade: ['carregar', 'contarForaDoPrazo'] satisfies LeiturasDe<ServicoDePrivacidade>,
} as const

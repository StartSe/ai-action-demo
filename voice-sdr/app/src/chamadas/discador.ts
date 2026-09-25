// As decisões do discador manual que não dependem de React (RF-401, RF-011).
//
// Quem recusa de verdade é o servidor: `call-place` chama `guard_dial`, e o
// freio, o portão, o bloqueio e a janela são todos passos de lá. O que este
// módulo decide é o que a tela **oferece** e quando ela nem chega a chamar o
// servidor — e as duas coisas se escrevem pela mesma regra do servidor, para a
// tela não oferecer o que ele vai recusar.

import { podeDiscarPara } from '@/chamadas/portao'
import type { Discador, FreioPuxado } from '@/chamadas/tipos'
import { podeDiscar } from '@/equipe/papeis'
import type { Papel } from '@/equipe/tipos'

/** Um número que o discador oferece, com de onde ele veio. */
export interface Destino {
  /** Estável entre desenhos: é o valor da opção no seletor. */
  chave: string
  rotulo: string
  /** Em E.164. */
  telefone: string
  leadId: string | null
  deTeste: boolean
}

/**
 * O que o discador oferece: a lista de teste primeiro, depois os leads, e só o
 * que `podeDiscarPara` libera. Com o portão fechado a lista de leads cai
 * inteira, a não ser o lead cujo telefone está na lista de teste.
 *
 * Sem repetição pelo telefone normalizado: o lead que tem o número de teste
 * apareceria duas vezes, e as duas opções discariam para o mesmo aparelho.
 */
export function destinosDoDiscador(discador: Discador): Destino[] {
  const vistos = new Set<string>()
  const destinos: Destino[] = []

  const candidatos: Destino[] = [
    ...discador.numerosDeTeste.map((numero) => ({
      chave: `teste:${numero.telefone}`,
      rotulo: numero.rotulo,
      telefone: numero.telefone,
      leadId: null,
      deTeste: true,
    })),
    ...discador.leads.map((lead) => ({
      chave: `lead:${lead.id}`,
      rotulo: lead.nome,
      telefone: lead.telefone,
      leadId: lead.id,
      deTeste: false,
    })),
  ]

  for (const candidato of candidatos) {
    const decisao = podeDiscarPara(candidato.telefone, discador.portao)
    if (!decisao.ok || vistos.has(decisao.telefone)) continue
    vistos.add(decisao.telefone)
    destinos.push({ ...candidato, telefone: decisao.telefone })
  }

  return destinos
}

/**
 * O destino de um lead fixo, como o discador da ficha do lead o recebe. A
 * regra é a mesma da lista: portão fechado e número fora da lista de teste não
 * viram destino, e a tela diz por quê em vez de oferecer o botão.
 */
export function destinoDoLead(
  lead: { id: string; nome: string; telefone: string },
  discador: Discador,
): Destino | null {
  const decisao = podeDiscarPara(lead.telefone, discador.portao)
  if (!decisao.ok) return null
  return {
    chave: `lead:${lead.id}`,
    rotulo: lead.nome,
    telefone: decisao.telefone,
    leadId: lead.id,
    deTeste: decisao.porque === 'numero_de_teste',
  }
}

/**
 * Por que a tela não chama o servidor. O freio vem antes do papel: com a conta
 * parada ninguém liga, e dizer ao operador que ele pode discar seria mentira.
 */
export type BloqueioDaTela = 'freio_puxado' | 'papel_sem_discagem'

export function bloqueioAntesDeDiscar(
  freio: FreioPuxado | null,
  papel: Papel | null,
): BloqueioDaTela | null {
  if (freio) return 'freio_puxado'
  if (papel === null || !podeDiscar(papel)) return 'papel_sem_discagem'
  return null
}

/** Segundos inteiros de `inicio` até `agora`. Nunca negativo. */
export function segundosDesde(inicio: string, agora: number): number {
  const comeco = Date.parse(inicio)
  if (Number.isNaN(comeco)) return 0
  return Math.max(0, Math.floor((agora - comeco) / 1000))
}

/** A duração como o relógio a mostra: `4:07`, `1:02:09`. */
export function formatarDuracao(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos))
  const horas = Math.floor(total / 3600)
  const minutos = Math.floor((total % 3600) / 60)
  const resto = total % 60
  const ss = String(resto).padStart(2, '0')
  if (horas === 0) return `${minutos}:${ss}`
  return `${horas}:${String(minutos).padStart(2, '0')}:${ss}`
}

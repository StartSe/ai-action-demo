import { inicioDoPeriodo } from '@/auditoria/consulta'
import {
  AUTOR_SISTEMA,
  type CargaDaAuditoria,
  type ConsultaDeAuditoria,
  type OpcaoDeAutor,
  type RegistroDeAuditoria,
  type ServicoDeAuditoria,
} from '@/auditoria/tipos'

export interface RespostasDeAuditoria {
  /** Quando presente, o dublê devolve isto e ignora os registros. */
  consultar?: CargaDaAuditoria
  registros?: RegistroDeAuditoria[]
  autores?: OpcaoDeAutor[]
  truncada?: boolean
}

export interface ServicoDeAuditoriaDublado extends ServicoDeAuditoria {
  /** Toda consulta pedida, na ordem, para o teste medir o filtro. */
  readonly consultas: ConsultaDeAuditoria[]
}

export const AUTORES_DE_EXEMPLO: OpcaoDeAutor[] = [
  { id: 'u-1', nome: 'Renata Alves' },
  { id: 'u-2', nome: 'Caio Moreira' },
]

const HORA = 60 * 60 * 1000

/**
 * Três mudanças recentes: troca de papel, convite revogado e credencial
 * apagada. Os instantes são relativos ao relógio porque o filtro de período
 * também é: datas fixas fariam o teste do recorte depender do dia em que roda.
 */
export function registrosDeExemplo(
  agora: () => number = Date.now,
): RegistroDeAuditoria[] {
  const base = agora()

  return [
    {
      id: 'a-1',
      instante: new Date(base - 2 * HORA).toISOString(),
      autor: { tipo: 'user', id: 'u-1', nome: 'Renata Alves' },
      acao: 'update',
      alvoTipo: 'account_members',
      alvoId: 'm-2',
      origem: 'trigger',
      motivo: null,
      campos: ['role'],
    },
    {
      id: 'a-2',
      instante: new Date(base - 3 * 24 * HORA).toISOString(),
      autor: { tipo: 'user', id: 'u-2', nome: 'Caio Moreira' },
      acao: 'update',
      alvoTipo: 'invitations',
      alvoId: 'i-1',
      origem: 'trigger',
      motivo: 'Convite cancelado pela equipe',
      campos: ['revoked_at'],
    },
    {
      id: 'a-3',
      instante: new Date(base - 20 * 24 * HORA).toISOString(),
      autor: { tipo: 'system', id: null, nome: '' },
      acao: 'delete',
      alvoTipo: 'account_secrets',
      alvoId: 's-1',
      origem: 'edge:limpeza',
      motivo: null,
      campos: [],
    },
  ]
}

/**
 * Dublê do serviço de auditoria para os testes de componente. Filtra em
 * memória com as mesmas regras do serviço real, para o teste poder provar que
 * a tela pediu o recorte certo e que a lista encolhe.
 */
export function criarServicoDeAuditoriaDublado(
  respostas: RespostasDeAuditoria = {},
): ServicoDeAuditoriaDublado {
  const consultas: ConsultaDeAuditoria[] = []
  const todos = respostas.registros ?? registrosDeExemplo()

  return {
    consultas,

    consultar(consulta) {
      consultas.push(consulta)
      if (respostas.consultar) return Promise.resolve(respostas.consultar)

      const desde = inicioDoPeriodo(consulta.periodo)
      const registros = todos.filter((registro) => {
        if (consulta.acao && registro.acao !== consulta.acao) return false
        if (consulta.autor === AUTOR_SISTEMA && registro.autor.tipo !== 'system') {
          return false
        }
        if (
          consulta.autor &&
          consulta.autor !== AUTOR_SISTEMA &&
          registro.autor.id !== consulta.autor
        ) {
          return false
        }
        return !desde || registro.instante >= desde
      })

      return Promise.resolve({
        ok: true,
        pagina: {
          registros,
          autores: respostas.autores ?? AUTORES_DE_EXEMPLO,
          truncada: respostas.truncada ?? false,
        },
      })
    },
  }
}

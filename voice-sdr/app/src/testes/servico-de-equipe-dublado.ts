import type {
  AcaoDaEquipe,
  CargaDaEquipe,
  ConviteCriado,
  Equipe,
  LeituraDoConvite,
  Papel,
  RespostaDoAceite,
  ServicoDeEquipe,
} from '@/equipe/tipos'

export interface RespostasDeEquipe {
  carregar?: CargaDaEquipe
  convidar?: ConviteCriado
  trocarPapel?: AcaoDaEquipe
  remover?: AcaoDaEquipe
  revogarConvite?: AcaoDaEquipe
  lerConvite?: LeituraDoConvite
  aceitarConvite?: RespostaDoAceite
}

export interface ServicoDeEquipeDublado extends ServicoDeEquipe {
  readonly convidados: { email: string; papel: Papel }[]
  readonly papeisTrocados: { usuarioId: string; papel: Papel }[]
  readonly removidos: string[]
  readonly convitesRevogados: string[]
  readonly tokensLidos: string[]
  readonly tokensAceitos: string[]
}

/** Equipe de duas pessoas e um convite pendente. O caso comum da tela. */
export function equipeDeExemplo(papelDoUsuario: Papel = 'admin'): Equipe {
  return {
    conta: { id: 'c-1', nome: 'Aurora Educação' },
    papelDoUsuario,
    membros: [
      {
        usuarioId: 'u-1',
        nome: 'Renata Alves',
        email: 'renata@aurora.com.br',
        papel: papelDoUsuario,
        ultimoAcesso: '2026-09-20T13:40:00.000Z',
      },
      {
        usuarioId: 'u-2',
        nome: 'Caio Moreira',
        email: 'caio@aurora.com.br',
        papel: 'operator',
        ultimoAcesso: null,
      },
    ],
    convites: [
      {
        id: 'i-1',
        email: 'bruna@aurora.com.br',
        papel: 'viewer',
        expiraEm: '2026-09-28T13:40:00.000Z',
      },
    ],
  }
}

/**
 * Dublê do serviço de equipe para os testes de componente. Atende ao mesmo
 * contrato, em memória, sem rede e sem Supabase.
 */
export function criarServicoDeEquipeDublado(
  respostas: RespostasDeEquipe = {},
): ServicoDeEquipeDublado {
  const convidados: { email: string; papel: Papel }[] = []
  const papeisTrocados: { usuarioId: string; papel: Papel }[] = []
  const removidos: string[] = []
  const convitesRevogados: string[] = []
  const tokensLidos: string[] = []
  const tokensAceitos: string[] = []

  return {
    convidados,
    papeisTrocados,
    removidos,
    convitesRevogados,
    tokensLidos,
    tokensAceitos,

    carregar: () =>
      Promise.resolve(
        respostas.carregar ?? { ok: true, equipe: equipeDeExemplo() },
      ),

    convidar(dados) {
      convidados.push(dados)
      return Promise.resolve(
        respostas.convidar ?? {
          ok: true,
          link: 'http://localhost:5173/convite/token-de-teste',
        },
      )
    },

    trocarPapel(usuarioId, papel) {
      papeisTrocados.push({ usuarioId, papel })
      return Promise.resolve(respostas.trocarPapel ?? { ok: true })
    },

    remover(usuarioId) {
      removidos.push(usuarioId)
      return Promise.resolve(respostas.remover ?? { ok: true })
    },

    revogarConvite(conviteId) {
      convitesRevogados.push(conviteId)
      return Promise.resolve(respostas.revogarConvite ?? { ok: true })
    },

    lerConvite(token) {
      tokensLidos.push(token)
      return Promise.resolve(
        respostas.lerConvite ?? {
          ok: true,
          previa: {
            situacao: 'valido',
            contaNome: 'Aurora Educação',
            papel: 'operator',
            email: 'bruna@aurora.com.br',
            convidadoPor: 'Renata Alves',
            expiraEm: '2026-09-28T13:40:00.000Z',
          },
        },
      )
    },

    aceitarConvite(token) {
      tokensAceitos.push(token)
      return Promise.resolve(
        respostas.aceitarConvite ?? {
          ok: true,
          mensagem: 'Convite aceito. Você já faz parte da equipe.',
          contaNome: 'Aurora Educação',
        },
      )
    },
  }
}

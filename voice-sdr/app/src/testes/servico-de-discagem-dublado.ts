import type { ServicoDeAutomacao } from '@/automacao/tipos'
import { FAIXAS } from '@/discagem/politica'
import type {
  CargaDaLigacaoAoLeadNovo,
  CargaDaPolitica,
  GravacaoDaLigacaoAoLeadNovo,
  LigacaoAoLeadNovo,
  CargaDoPortao,
  GravacaoDaPolitica,
  GravacaoDoNumeroDeTeste,
  NumeroDeTeste,
  PoliticaDeDiscagem,
  RemocaoDoNumeroDeTeste,
  ServicoDeDiscagem,
} from '@/discagem/tipos'

export interface GravacaoDaPoliticaDublada {
  mudancas: Partial<PoliticaDeDiscagem>
  motivo: string
}

export interface RespostasDeDiscagem {
  /**
   * Quando presente, o dublê devolve isto e ignora a política em memória. A
   * forma de função existe para o teste do estado de carregamento, que precisa
   * de uma promessa que nunca resolve.
   */
  carregar?: CargaDaPolitica | (() => Promise<CargaDaPolitica>)
  politica?: PoliticaDeDiscagem
  fusoDaConta?: string
  /** Recusa a gravação, para provar a frase de cada motivo. */
  salvar?: GravacaoDaPolitica | (() => Promise<GravacaoDaPolitica>)
  /**
   * O que o servidor diz do portão. O padrão é o de uma conta recém-chegada à
   * F3: a fase liberou, e falta a ligação de teste.
   */
  portao?: CargaDoPortao | (() => Promise<CargaDoPortao>)
  /** A lista inicial de números de teste. */
  numerosDeTeste?: NumeroDeTeste[]
  /** Recusa o cadastro, para provar a frase de cada motivo. */
  cadastrarNumeroDeTeste?: GravacaoDoNumeroDeTeste
  removerNumeroDeTeste?: RemocaoDoNumeroDeTeste
  /** A seção de automação (US-190). Ausente, a seção não aparece na tela. */
  automacao?: ServicoDeAutomacao
  /** A ligação ao lead novo. Padrão: desligada, prazo de 5 minutos, como a coluna. */
  ligacaoAoLeadNovo?: LigacaoAoLeadNovo
  /** Recusa a gravação da ligação ao lead novo. */
  salvarLigacaoAoLeadNovo?: Extract<GravacaoDaLigacaoAoLeadNovo, { ok: false }>
}

export interface GravacaoDaLigacaoAoLeadNovoDublada {
  configuracao: LigacaoAoLeadNovo
  motivo: string
}

export interface ServicoDeDiscagemDublado extends ServicoDeDiscagem {
  /** Toda gravação pedida, na ordem: é o que prova o que foi ao RPC. */
  readonly gravacoes: GravacaoDaPoliticaDublada[]
  /** Os números de teste como estão agora, depois das escritas do teste. */
  readonly numerosCadastrados: NumeroDeTeste[]
  /** Toda gravação da ligação ao lead novo, na ordem. */
  readonly gravacoesDaLigacaoAoLeadNovo: GravacaoDaLigacaoAoLeadNovoDublada[]
}

/** Os padrões das colunas de `account_settings`. */
export function politicaDeExemplo(): PoliticaDeDiscagem {
  const faixa = { start: '09:00', end: '18:00' }
  return {
    janela: { '1': faixa, '2': faixa, '3': faixa, '4': faixa, '5': faixa },
    intervaloMinimoMinutos: 60,
    tentativasPorNumero: 3,
    tetoDiarioDeLigacoes: 200,
    tetoDeGastoCentavos: null,
    duracaoMaximaSegundos: 600,
    simultaneidade: 5,
  }
}

/**
 * Dublê da política de discagem. Guarda a política em memória e aplica só o
 * que veio na gravação, como o RPC. Recusa o que o check da coluna recusaria,
 * pelas mesmas faixas que a tela espelha: o dublê substitui a rede, não a
 * decisão do banco.
 */
export function criarServicoDeDiscagemDublado(
  respostas: RespostasDeDiscagem = {},
): ServicoDeDiscagemDublado {
  const gravacoes: GravacaoDaPoliticaDublada[] = []
  const numerosCadastrados: NumeroDeTeste[] = [...(respostas.numerosDeTeste ?? [])]
  let proximoId = numerosCadastrados.length + 1
  let politica = respostas.politica ?? politicaDeExemplo()
  const fusoDaConta = respostas.fusoDaConta ?? 'America/Sao_Paulo'
  const gravacoesDaLigacaoAoLeadNovo: GravacaoDaLigacaoAoLeadNovoDublada[] = []
  let ligacaoAoLeadNovo: LigacaoAoLeadNovo = respostas.ligacaoAoLeadNovo ?? {
    ligada: false,
    prazoMinutos: 5,
  }

  return {
    ...(respostas.automacao ? { automacao: respostas.automacao } : {}),
    gravacoes,
    numerosCadastrados,
    gravacoesDaLigacaoAoLeadNovo,

    ligacaoAoLeadNovo(): Promise<CargaDaLigacaoAoLeadNovo> {
      return Promise.resolve({ ok: true, configuracao: ligacaoAoLeadNovo })
    },

    salvarLigacaoAoLeadNovo(configuracao, motivo): Promise<GravacaoDaLigacaoAoLeadNovo> {
      gravacoesDaLigacaoAoLeadNovo.push({ configuracao, motivo })
      if (respostas.salvarLigacaoAoLeadNovo) return Promise.resolve(respostas.salvarLigacaoAoLeadNovo)
      // As mesmas recusas do RPC: motivo em branco e prazo fora do check.
      if (!motivo.trim()) return Promise.resolve({ ok: false, motivo: 'valor-recusado' })
      if (configuracao.prazoMinutos < 1 || configuracao.prazoMinutos > 1440) {
        return Promise.resolve({ ok: false, motivo: 'valor-recusado' })
      }
      ligacaoAoLeadNovo = configuracao
      return Promise.resolve({ ok: true, configuracao })
    },

    portao(): Promise<CargaDoPortao> {
      if (typeof respostas.portao === 'function') return respostas.portao()
      return Promise.resolve(
        respostas.portao ?? {
          ok: true,
          portao: { falta: ['primeira_chamada_de_teste'], primeiraChamadaDeTesteEm: null },
        },
      )
    },

    numerosDeTeste() {
      return Promise.resolve([...numerosCadastrados])
    },

    cadastrarNumeroDeTeste(numero, rotulo) {
      if (respostas.cadastrarNumeroDeTeste) {
        return Promise.resolve(respostas.cadastrarNumeroDeTeste)
      }
      if (!rotulo.trim()) {
        return Promise.resolve({ ok: false, motivo: 'rotulo-obrigatorio' } as const)
      }
      // O dublê substitui a rede, não a decisão: a régua do E.164 é a mesma
      // que o check da coluna aplica.
      const digitos = numero.replace(/[^0-9+]/g, '')
      if (!/^\+[1-9][0-9]{7,14}$/.test(digitos)) {
        return Promise.resolve({ ok: false, motivo: 'numero-invalido' } as const)
      }
      if (numerosCadastrados.some((n) => n.e164 === digitos)) {
        return Promise.resolve({ ok: false, motivo: 'ja-cadastrado' } as const)
      }
      const criado = { id: `t-${proximoId++}`, e164: digitos, rotulo: rotulo.trim() }
      numerosCadastrados.push(criado)
      return Promise.resolve({ ok: true, numero: criado } as const)
    },

    removerNumeroDeTeste(id) {
      if (respostas.removerNumeroDeTeste) {
        return Promise.resolve(respostas.removerNumeroDeTeste)
      }
      const posicao = numerosCadastrados.findIndex((n) => n.id === id)
      if (posicao < 0) {
        return Promise.resolve({ ok: false, motivo: 'sem-permissao' } as const)
      }
      numerosCadastrados.splice(posicao, 1)
      return Promise.resolve({ ok: true } as const)
    },

    carregar(): Promise<CargaDaPolitica> {
      if (typeof respostas.carregar === 'function') return respostas.carregar()
      if (respostas.carregar) return Promise.resolve(respostas.carregar)
      return Promise.resolve({ ok: true, politica, fusoDaConta })
    },

    salvar(mudancas, motivo): Promise<GravacaoDaPolitica> {
      gravacoes.push({ mudancas, motivo })
      if (typeof respostas.salvar === 'function') return respostas.salvar()
      if (respostas.salvar) return Promise.resolve(respostas.salvar)
      if (!motivo.trim()) return Promise.resolve({ ok: false, motivo: 'valor-recusado' })

      const proxima = { ...politica, ...mudancas }
      for (const [campo, faixa] of Object.entries(FAIXAS)) {
        const valor = proxima[campo as keyof typeof FAIXAS]
        if (valor < faixa.minimo || valor > faixa.maximo) {
          return Promise.resolve({ ok: false, motivo: 'valor-recusado' })
        }
      }

      politica = proxima
      return Promise.resolve({ ok: true, politica })
    },
  }
}

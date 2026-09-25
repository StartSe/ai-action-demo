import type {
  ResultadoDaExclusao,
  CargaDeNumeros,
  DadosDoCadastro,
  LinhaTelefonica,
  MudancaDaLinha,
  ResultadoDaMudanca,
  ResultadoDoCadastro,
  ResultadoDoRegistro,
  ServicoDeNumeros,
} from '@/numeros/tipos'

export interface RespostasDeNumeros {
  /** Recusa a exclusão, para provar a frase de cada motivo. */
  excluir?: ResultadoDaExclusao
  /** Quando presente, o dublê devolve isto e ignora `linhas`. */
  carregar?: CargaDeNumeros
  linhas?: LinhaTelefonica[]
  /** O que `phone-register` responde. O padrão é a espera da operadora. */
  registro?: ResultadoDoRegistro
  /** Recusa o cadastro antes de gravar, para provar a frase da falha. */
  cadastrar?: Extract<ResultadoDoCadastro, { ok: false }>
  /** Recusa a mudança, para provar a frase da falha. */
  alterar?: Extract<ResultadoDaMudanca, { ok: false }>
}

export interface ServicoDeNumerosDublado extends ServicoDeNumeros {
  /** Todo cadastro recebido, na ordem. É o que prova o que o formulário manda. */
  readonly cadastros: DadosDoCadastro[]
  readonly mudancas: { linhaId: string; mudanca: MudancaDaLinha }[]
  readonly registros: string[]
  /** Toda exclusão pedida, na ordem. */
  readonly exclusoes: string[]
}

/** A linha já registrada, no rodízio, sem histórico de saúde. */
export function linhaDeExemplo(
  mudanca: Partial<LinhaTelefonica> = {},
): LinhaTelefonica {
  return {
    id: 'l-1',
    e164: '+551140001234',
    rotulo: 'Linha comercial',
    provedor: 'twilio',
    comportamento: 'agent',
    encaminharPara: null,
    saidaLigada: true,
    noRodizio: true,
    tetoDiario: 100,
    saude: {},
    registradaNoProvedor: true,
    ligada: true,
    ...mudanca,
  }
}

/**
 * Dublê do serviço de números. Guarda as linhas em memória e aplica cadastro
 * e mudança como o banco aplicaria, para a recarga depois da escrita mostrar
 * o que foi gravado. O registro no provedor não roda: `phone-register` é da
 * frente de borda (US-065), e o que a tela precisa provar é o que faz com
 * cada resposta dele.
 *
 * O padrão é a conta sem número nenhum, em silêncio: nenhuma outra tela
 * desenha linhas, então o padrão não acrescenta nada a teste alheio.
 */
export function criarServicoDeNumerosDublado(
  respostas: RespostasDeNumeros = {},
): ServicoDeNumerosDublado {
  const linhas = [...(respostas.linhas ?? [])]
  const cadastros: DadosDoCadastro[] = []
  const mudancas: { linhaId: string; mudanca: MudancaDaLinha }[] = []
  const registros: string[] = []
  const exclusoes: string[] = []
  const registro: ResultadoDoRegistro = respostas.registro ?? {
    estado: 'aguardando_operadora',
  }

  return {
    cadastros,
    mudancas,
    registros,
    exclusoes,

    async carregar() {
      if (respostas.carregar) return respostas.carregar
      return { ok: true, linhas: linhas.map((linha) => ({ ...linha })) }
    },

    async cadastrar(dados) {
      cadastros.push(dados)
      if (respostas.cadastrar) return respostas.cadastrar

      const linha: LinhaTelefonica = linhaDeExemplo({
        id: `l-${linhas.length + 1}`,
        e164: dados.e164,
        rotulo: dados.rotulo,
        comportamento: dados.comportamento,
        encaminharPara: dados.encaminharPara,
        registradaNoProvedor: registro.estado === 'registrada',
      })
      linhas.push(linha)
      registros.push(linha.id)
      return { ok: true, linha, registro }
    },

    async alterar(linhaId, mudanca) {
      mudancas.push({ linhaId, mudanca })
      if (respostas.alterar) return respostas.alterar

      const indice = linhas.findIndex((linha) => linha.id === linhaId)
      const atual = linhas[indice]
      if (!atual) return { ok: false, motivo: 'sem-permissao' }

      const nova = { ...atual, ...mudanca }
      linhas[indice] = nova
      return { ok: true, linha: nova }
    },

    async registrarDeNovo(linhaId) {
      registros.push(linhaId)
      const indice = linhas.findIndex((linha) => linha.id === linhaId)
      const atual = linhas[indice]
      if (atual && registro.estado === 'registrada') {
        linhas[indice] = { ...atual, registradaNoProvedor: true }
      }
      return registro
    },

    excluir(linhaId): Promise<ResultadoDaExclusao> {
      exclusoes.push(linhaId)
      if (respostas.excluir) return Promise.resolve(respostas.excluir)

      const posicao = linhas.findIndex((l) => l.id === linhaId)
      if (posicao < 0) {
        return Promise.resolve({ ok: false, motivo: 'sem-permissao' } as const)
      }
      const [removida] = linhas.splice(posicao, 1)
      return Promise.resolve({
        ok: true,
        aindaNoProvedor: Boolean(removida?.registradaNoProvedor),
      } as const)
    },

  }
}

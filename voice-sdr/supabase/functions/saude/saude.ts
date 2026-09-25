// A saúde da instalação: o que a conferência do instalador e a interface
// perguntam ao projeto.
//
// Três respostas numa chamada só, e cada uma tem quem a use:
//
// - **`ok`**: o banco respondeu com o esquema desta solução, pela chave de
//   serviço. É a prova do passo `conferencia` do roteiro (`instalacao.json`).
// - **`chave`**: a chave publicável do projeto, que é pública por natureza (a
//   interface a carrega de qualquer jeito). É o que deixa a tela "Conectar ao
//   seu Supabase" pedir só o endereço do projeto, e o que o instalador do
//   painel pode devolver no link para a cópia do app.
// - **`versao`**: a do banco (o registro do último passo do roteiro) e a das
//   funções publicadas (a constante gerada junto do pacote). A interface
//   compara com a que ela própria espera.
//
// E um efeito, de propósito: **grava `rotinas.url_base` quando falta.** O SQL
// da instalação não conhece o endereço do projeto, e toda função conhece. Como
// a conferência chama esta função logo depois do deploy, as rotinas agendadas
// passam a ter para onde ir sem ninguém gravar nada à mão. Valor que já existe
// não é tocado (`registrar_url_base_das_rotinas`).
//
// Nada daqui é segredo: dois rótulos de versão e uma chave publicável. Por isso
// a função é aberta (`verify_jwt = false`) e responde a qualquer origem.
//
// Módulo portável: sem Deno, sem rede. O adaptador é `index.ts`.

export interface VersaoRegistrada {
  readonly migracao: string | null
  readonly funcoes: string | null
}

export interface PortaDaSaude {
  /** Verdadeiro quando gravou agora, falso quando já havia endereço. */
  registrarUrlBase(url: string): Promise<boolean>
  versaoDoBanco(): Promise<VersaoRegistrada>
}

export interface AmbienteDaSaude {
  /** `SUPABASE_URL`. */
  readonly urlDoProjeto: string
  /** `SUPABASE_ANON_KEY`: a chave publicável, nunca a de serviço. */
  readonly chavePublicavel: string
  /** A versão com que estas funções foram geradas. */
  readonly versaoDasFuncoes: VersaoRegistrada
}

export type EstadoDasRotinas = 'registrada' | 'ja_registrada' | 'sem_endereco' | 'falhou'

export interface CorpoDaSaude {
  readonly ok: boolean
  readonly chave: string | null
  readonly rotinas: EstadoDasRotinas
  readonly versao: {
    readonly banco: VersaoRegistrada | null
    readonly funcoes: VersaoRegistrada
  }
}

export interface RespostaDaSaude {
  readonly status: number
  readonly corpo: CorpoDaSaude | { readonly ok: false; readonly erro: 'metodo_invalido' }
}

/** O endereço base das funções, a partir do endereço do projeto. */
export function enderecoDasFuncoes(urlDoProjeto: string): string | null {
  const limpo = urlDoProjeto.trim().replace(/\/+$/, '')
  if (!/^https?:\/\/[^\s/]+(:\d+)?$/.test(limpo)) return null
  return `${limpo}/functions/v1`
}

export async function atenderSaude(
  pedido: { readonly metodo: string },
  porta: PortaDaSaude,
  ambiente: AmbienteDaSaude,
): Promise<RespostaDaSaude> {
  if (pedido.metodo !== 'GET') {
    return { status: 405, corpo: { ok: false, erro: 'metodo_invalido' } }
  }

  let banco: VersaoRegistrada | null
  try {
    banco = await porta.versaoDoBanco()
  } catch {
    banco = null
  }

  let rotinas: EstadoDasRotinas = 'sem_endereco'
  const endereco = enderecoDasFuncoes(ambiente.urlDoProjeto)
  if (endereco) {
    try {
      rotinas = (await porta.registrarUrlBase(endereco)) ? 'registrada' : 'ja_registrada'
    } catch {
      rotinas = 'falhou'
    }
  }

  const ok = banco !== null && (rotinas === 'registrada' || rotinas === 'ja_registrada')
  const chave = ambiente.chavePublicavel.trim()

  return {
    status: ok ? 200 : 503,
    corpo: {
      ok,
      chave: chave === '' ? null : chave,
      rotinas,
      versao: { banco, funcoes: ambiente.versaoDasFuncoes },
    },
  }
}

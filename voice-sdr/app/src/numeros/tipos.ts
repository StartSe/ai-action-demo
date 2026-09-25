/**
 * O que a tela de números conhece: as linhas telefônicas da conta (RF-409,
 * RF-709). Espelha `phone_lines`
 * (supabase/migrations/20260922020000_linhas_telefonicas.sql), mas é declarado
 * aqui porque o contrato de tela não deve depender do formato de linha do
 * banco.
 *
 * Três escolhas atravessam o arquivo:
 *
 * 1. **`saude` chega crua.** A coluna é retrato de `cron-line-health`, que só
 *    nasce na F7, e o formato dela ainda não foi fixado por ninguém. Quem a lê
 *    é `leituraDaSaude`, em `linhas.ts`, que sabe dizer "ainda sem histórico"
 *    para tudo que não reconhece. Tipar a coluna aqui seria inventar o formato.
 * 2. **Registrada no provedor é fato da linha, não da resposta.** A espera da
 *    operadora dura dias (P-04), então a tela reabre muitas vezes antes de ela
 *    acabar: o estado sai de `provider_number_id`, que `phone-register` grava
 *    quando o número passa a existir lá fora, e não de uma resposta que só a
 *    aba que cadastrou chegou a ver.
 * 3. **O contrato de `phone-register` é o desta tela.** A função é a US-065 e
 *    mora na frente de borda (ralph/f2-borda); a forma da resposta que a tela
 *    lê está em `RespostaDoRegistro` e precisa ser honrada lá no merge.
 */

/** O que fazer com a ligação recebida (T-14, RF-409). */
export type ComportamentoDeEntrada = 'agent' | 'forward' | 'voicemail'

export const COMPORTAMENTOS: readonly ComportamentoDeEntrada[] = [
  'agent',
  'forward',
  'voicemail',
]

export interface LinhaTelefonica {
  id: string
  /** E.164, como está em `phone_lines.e164`. */
  e164: string
  rotulo: string
  /** Provedor de telefonia, em minúsculas (`twilio`). */
  provedor: string
  comportamento: ComportamentoDeEntrada
  /** Destino do encaminhamento, em E.164. Só existe com `forward`. */
  encaminharPara: string | null
  /** `outbound_enabled`: a linha serve de origem para discagem. */
  saidaLigada: boolean
  /** `in_rotation`: a linha entra no sorteio do passo 8 da guarda. */
  noRodizio: boolean
  tetoDiario: number
  /** `health`, cru. Quem interpreta é `leituraDaSaude`. */
  saude: unknown
  /** `provider_number_id` preenchido: o número existe no provedor. */
  registradaNoProvedor: boolean
  /** `enabled`. */
  ligada: boolean
}

export type MotivoDeFalhaDeNumeros =
  | 'sem-permissao'
  | 'sem-conta'
  | 'numero-repetido'
  | 'falha-de-comunicacao'

export type CargaDeNumeros =
  | { ok: true; linhas: LinhaTelefonica[] }
  | { ok: false; motivo: MotivoDeFalhaDeNumeros }

/** O que o formulário manda, já normalizado por `validarCadastro`. */
export interface DadosDoCadastro {
  e164: string
  rotulo: string
  comportamento: ComportamentoDeEntrada
  /** Obrigatório com `forward`, nulo nos outros dois. */
  encaminharPara: string | null
}

/**
 * O que `phone-register` responde. Os três valores de `estado` são os de
 * `phone-register/respostas.ts` (`EstadoDoRegistro`): `registrado` e
 * `inalterado` terminaram no provedor, e só `aguardando_aprovacao` é a espera
 * normal do pacote regulatório (P-04), que leva dias e não impede o resto da
 * configuração. A recusa traz a frase em português, como as outras bordas.
 */
export type RespostaDoRegistro =
  | { ok: true; estado: 'registrado' | 'inalterado' | 'aguardando_aprovacao' }
  | { ok: false; mensagem: string }

/**
 * O que a tela recebe do registro. `nao_registrada` é a linha que ficou só na
 * configuração porque o provedor recusou ou não respondeu: ela existe e pode
 * ser registrada de novo pelo cartão.
 */
export type ResultadoDoRegistro =
  | { estado: 'registrada' }
  | { estado: 'aguardando_operadora' }
  | { estado: 'nao_registrada'; mensagem: string | null }

export type ResultadoDoCadastro =
  | { ok: true; linha: LinhaTelefonica; registro: ResultadoDoRegistro }
  | { ok: false; motivo: MotivoDeFalhaDeNumeros }

/** O que o cartão muda sem passar pelo provedor. */
export interface MudancaDaLinha {
  saidaLigada?: boolean
  noRodizio?: boolean
}

export type ResultadoDaExclusao =
  | { ok: true; aindaNoProvedor: boolean }
  | { ok: false; motivo: MotivoDeFalhaDeNumeros }

export type ResultadoDaMudanca =
  | { ok: true; linha: LinhaTelefonica }
  | { ok: false; motivo: MotivoDeFalhaDeNumeros }

/**
 * O contrato que a interface conhece. Implementação sobre o Supabase em
 * `servico-supabase.ts`; dublê de teste em `app/src/testes/`.
 */
export interface ServicoDeNumeros {
  carregar(): Promise<CargaDeNumeros>
  /** Grava a linha e chama `phone-register` para ela, nessa ordem. */
  cadastrar(dados: DadosDoCadastro): Promise<ResultadoDoCadastro>
  /** Liga ou desliga a saída e o rodízio. Não toca no provedor. */
  alterar(linhaId: string, mudanca: MudancaDaLinha): Promise<ResultadoDaMudanca>
  /** Chama `phone-register` de novo; o registro é idempotente (US-065). */
  registrarDeNovo(linhaId: string): Promise<ResultadoDoRegistro>
  /**
   * Tira a linha desta instalação. A conta deixa de discar por ela na hora, e
   * ligação recebida nela deixa de ser atendida.
   *
   * `aindaNoProvedor` é verdadeiro quando a linha estava registrada: o número
   * continua apontando para cá do lado da telefonia, e desfazer isso é passo
   * do painel do provedor. Devolver o fato em vez de escondê-lo é o que
   * permite à tela dizer o que falta — apagar aqui e calar deixaria um número
   * apontando para uma linha que não existe mais.
   */
  excluir(linhaId: string): Promise<ResultadoDaExclusao>
}

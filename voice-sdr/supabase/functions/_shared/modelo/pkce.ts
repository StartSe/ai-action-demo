// O PKCE do OAuth de modelo (US-246), na parte que independe de plataforma.
//
// PKCE existe porque o cliente deste fluxo é uma tela de navegador, e tela de
// navegador não guarda segredo: qualquer um lê o que ela carrega. Em vez de um
// segredo fixo, cada ida inventa um segredo novo (`code_verifier`), manda só o
// resumo dele (`code_challenge`) para o provedor, e prova a posse do original
// na hora de trocar o código por chave. Quem interceptar o código de volta não
// consegue trocá-lo sem o verifier, que nunca passou pela barra de endereço.
//
// **O VERIFIER NÃO VIAJA PELO NAVEGADOR.** Quem o inventa é a borda, quem o
// guarda é `model_auth_states`, e quem o usa é a borda de novo. A tela recebe
// só o endereço para onde ir. Um verifier que passasse pela tela seria um
// segredo no `localStorage` de quem o fluxo existe para proteger.
//
// **S256, e não `plain`.** O provedor aceita os dois; `plain` manda o verifier
// em claro na URL de autorização, o que devolve exatamente o problema que o
// PKCE resolve.
//
// Módulo portável: sem `Deno`, sem import de rede. Usa `crypto` global, que
// existe no Deno, no Node 18+ e no navegador.

/** O método de resumo. `plain` não entra aqui: ver o cabeçalho. */
export const METODO_DO_DESAFIO = 'S256'

/**
 * O tamanho do verifier em bytes antes da codificação. 32 bytes viram 43
 * caracteres em base64url, que é o mínimo que a especificação do PKCE aceita.
 */
export const BYTES_DO_VERIFIER = 32

/** O tamanho do `state` em bytes. Mesma razão de ser aleatório: amarrar a volta. */
export const BYTES_DO_ESTADO = 24

/**
 * base64url sem preenchimento, que é o que o PKCE pede. O `btoa` da plataforma
 * produz base64 comum; a troca dos três caracteres é o que o torna seguro para
 * URL, e o `=` sai porque a especificação o proíbe.
 */
export function base64url(bytes: Uint8Array): string {
  let binario = ''
  for (const byte of bytes) binario += String.fromCharCode(byte)
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Bytes aleatórios do gerador da plataforma, nunca de `Math.random`. */
export function bytesAleatorios(quantidade: number): Uint8Array {
  const bytes = new Uint8Array(quantidade)
  crypto.getRandomValues(bytes)
  return bytes
}

/** Um `code_verifier` novo: 43 caracteres em base64url. */
export function criarVerifier(): string {
  return base64url(bytesAleatorios(BYTES_DO_VERIFIER))
}

/** Um `state` novo, que amarra a volta do provedor à ida que a pediu. */
export function criarEstado(): string {
  return base64url(bytesAleatorios(BYTES_DO_ESTADO))
}

/** O `code_challenge` de um verifier: SHA-256 em base64url. */
export async function desafioDoVerifier(verifier: string): Promise<string> {
  const resumo = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(resumo))
}

export interface ParDePkce {
  readonly verifier: string
  readonly desafio: string
  readonly estado: string
}

/** Um par novo, pronto para a ida: o que fica no banco e o que vai na URL. */
export async function criarPar(): Promise<ParDePkce> {
  const verifier = criarVerifier()
  return { verifier, desafio: await desafioDoVerifier(verifier), estado: criarEstado() }
}

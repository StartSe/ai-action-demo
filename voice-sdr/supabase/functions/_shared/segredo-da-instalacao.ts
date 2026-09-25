// Segredo interno da instalação, derivado quando ninguém o definiu.
//
// Algumas chaves não são de terceiro nenhum: existem só para uma função da
// instalação reconhecer outra (`SARAH_TOOL_SERVER_KEY`, que `agent-publish`
// usa para assinar o `x-tool-secret` e `tool-*` usam para conferir). Pedir que
// alguém sorteie e cadastre esse valor é um passo de instalação que ninguém
// precisa dar: toda função da borda já recebe `SUPABASE_SERVICE_ROLE_KEY`, que é
// segredo, é da instalação e é o mesmo em todas as funções. O valor derivado é
// `HMAC-SHA256(chave_de_servico, rotulo)` em hexadecimal, com um rótulo por uso,
// para dois usos nunca compartilharem o mesmo segredo.
//
// **A variável definida continua vencendo.** Quem já cadastrou o segredo não
// vê mudança nenhuma, e a rotação de dois segredos (R-07) segue pelas
// variáveis `_ANTERIOR`.
//
// **O risco é a rotação da chave de serviço.** Trocar
// `SUPABASE_SERVICE_ROLE_KEY` troca o segredo derivado na mesma hora, sem
// janela de dois segredos. Para `SARAH_TOOL_SERVER_KEY` isso quer dizer que os
// agentes publicados param de passar pelas ferramentas até a republicação. Quem
// for rodar a chave de serviço define antes `SARAH_TOOL_SERVER_KEY` com o valor
// derivado atual (ou republica os agentes logo depois).
//
// **Não vale para `SARAH_INTERNAL_SECRET`.** Quem o manda é o `pg_cron`, que o
// lê do Vault, e o banco não conhece a chave de serviço para derivar o mesmo
// valor. Ver `supabase/CLAUDE.md`, seção de funções de servidor.
//
// Módulo portável: `crypto.subtle` é Web Crypto, sem Deno e sem rede.

/** O rótulo da chave do servidor das ferramentas. Trocar o rótulo troca a chave. */
export const ROTULO_DA_CHAVE_DE_FERRAMENTAS = 'sarah/tool-server-key/v1'

export interface PedidoDoSegredo {
  /** O valor da variável de ambiente, quando alguém a definiu. */
  readonly definido: string | null | undefined
  /** `SUPABASE_SERVICE_ROLE_KEY`. Vazia, não há de onde derivar. */
  readonly chaveDeServico: string | null | undefined
  readonly rotulo: string
}

/**
 * O segredo definido, senão o derivado da chave de serviço, senão vazio.
 *
 * Vazio é o que a função já trata como "falta configuração" e recusa: derivar
 * de uma chave de serviço em branco daria o mesmo segredo em toda instalação
 * que também a perdesse.
 */
export async function segredoDaInstalacao(pedido: PedidoDoSegredo): Promise<string> {
  const definido = pedido.definido?.trim() ?? ''
  if (definido !== '') return definido

  const base = pedido.chaveDeServico?.trim() ?? ''
  const rotulo = pedido.rotulo.trim()
  if (base === '' || rotulo === '') return ''

  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(base),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const assinatura = await crypto.subtle.sign('HMAC', material, new TextEncoder().encode(rotulo))
  return [...new Uint8Array(assinatura)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

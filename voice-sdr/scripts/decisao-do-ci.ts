// Quando o degrau 3 roda. A esteira tem dois degraus baratos que rodam sempre
// e um caro — Supabase em container, migrações do zero, Postgres real e
// navegador — que só faz sentido em dois momentos: quando a mudança toca o
// banco ou as funções de servidor, e quando ela vai para a branch principal.
//
// A regra mora aqui, e não num `if:` do YAML, porque `if:` não enxerga a lista
// de arquivos tocados e porque regra que ninguém testa se perde na primeira
// mudança. Referência: docs/PRD-implementacao.md seção 9.1.

export const BRANCH_PRINCIPAL = 'main'

/** Prefixo que obriga o degrau 3: é o código que só o Postgres de verdade prova. */
export const PASTA_DO_BANCO = 'supabase/'

export interface EnvioDoCI {
  /** `push`, `pull_request` ou o que mais a esteira vier a escutar. */
  evento: string
  /** Branch de onde veio o envio. */
  branch: string
  /** Branch de destino. Só existe em pull request. */
  branchDestino: string | null
  /** Arquivos tocados. `null` quando o CI não conseguiu montar o diff. */
  arquivos: string[] | null
}

export interface Decisao {
  roda: boolean
  motivo: string
}

export function decidirDegrau3(envio: EnvioDoCI): Decisao {
  if (envio.arquivos === null) {
    // Sem diff não dá para afirmar que o banco ficou de fora. Na dúvida, o
    // degrau caro roda: perder dez minutos de esteira é mais barato do que
    // deixar uma migração quebrada passar para a branch principal.
    return { roda: true, motivo: 'o diff não veio; na dúvida, o degrau 3 roda' }
  }

  const tocados = envio.arquivos.filter((arquivo) => arquivo.startsWith(PASTA_DO_BANCO))
  if (tocados.length > 0) {
    return { roda: true, motivo: `o envio toca ${PASTA_DO_BANCO} (${tocados.length} arquivo(s))` }
  }

  if (envio.evento === 'pull_request') {
    return envio.branchDestino === BRANCH_PRINCIPAL
      ? { roda: true, motivo: `o destino é ${BRANCH_PRINCIPAL}` }
      : { roda: false, motivo: `o destino é ${envio.branchDestino ?? 'desconhecido'}, não ${BRANCH_PRINCIPAL}` }
  }

  if (envio.branch === BRANCH_PRINCIPAL) {
    return { roda: true, motivo: `o envio é para ${BRANCH_PRINCIPAL}` }
  }

  return {
    roda: false,
    motivo: `nada em ${PASTA_DO_BANCO} e o envio fica em ${envio.branch}`,
  }
}

/**
 * Lê o envio do ambiente do GitHub Actions.
 * `arquivos` vem de fora porque montá-lo é `git diff`, não leitura de variável.
 */
export function lerEnvio(
  ambiente: Record<string, string | undefined>,
  arquivos: string[] | null,
): EnvioDoCI {
  const destino = ambiente['GITHUB_BASE_REF']
  return {
    evento: ambiente['GITHUB_EVENT_NAME'] ?? 'push',
    branch: ambiente['GITHUB_REF_NAME'] ?? '',
    branchDestino: destino ? destino : null,
    arquivos,
  }
}

// Entrada da esteira: decide se o degrau 3 roda e escreve `completo=true|false`
// em $GITHUB_OUTPUT. O `git diff` fica no YAML, à vista; aqui só entra a cola
// entre o arquivo de saída do diff e a regra de `decisao-do-ci.ts`.
//
// Uso: node scripts/decidir-degrau-3.ts <arquivo-com-a-lista>
// A lista é um caminho por linha. A linha `?` sozinha significa que o diff não
// pôde ser montado, e aí o degrau 3 roda por precaução.

import { appendFile, readFile } from 'node:fs/promises'

import { decidirDegrau3, lerEnvio } from './decisao-do-ci.ts'

const DIFF_INDISPONIVEL = '?'

async function lerArquivos(caminho: string | undefined): Promise<string[] | null> {
  if (!caminho) return null

  let conteudo: string
  try {
    conteudo = await readFile(caminho, 'utf8')
  } catch {
    return null
  }

  const linhas = conteudo
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0)

  return linhas.includes(DIFF_INDISPONIVEL) ? null : linhas
}

const arquivos = await lerArquivos(process.argv[2])
const envio = lerEnvio(process.env, arquivos)
const decisao = decidirDegrau3(envio)

console.log(
  `degrau 3: ${decisao.roda ? 'roda' : 'fica de fora'} — ${decisao.motivo}` +
    ` (evento ${envio.evento}, branch ${envio.branch || 'sem nome'})`,
)

const saida = process.env['GITHUB_OUTPUT']
if (saida) await appendFile(saida, `completo=${decisao.roda}\n`)

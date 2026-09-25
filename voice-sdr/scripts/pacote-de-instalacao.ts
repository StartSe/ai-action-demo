// O pacote que o instalador do painel (StartSe/ai-hub) aplica no projeto
// Supabase de quem instala: `instalacao.json` na raiz e a pasta `instalacao/`.
//
//   npm run pacote              regera tudo a partir de supabase/
//   npm run pacote -- --conferir  sai com 1 se o que está no disco envelheceu
//
// O roteiro segue o contrato do painel (docs/contrato-instalacao.md do ai-hub,
// §6, família `destino: "supabase"`) e é GERADO do disco: migrações, funções e
// `supabase/config.toml`. Escrito à mão, ele envelheceria na primeira função
// nova. `testes/estatica/pacote-de-instalacao.test.ts` regera em memória e
// compara com o que está commitado, então função nova sem passo reprova.
//
// Por que existe uma pasta `instalacao/` em vez de o roteiro apontar direto
// para `supabase/`: são dois limites do painel, medidos no código dele.
//
// 1. **O passo `funcao` lê só a pasta da função, sem subpastas, e só `.ts`**
//    (`lerPasta` do ai-hub filtra `type === 'file'` e manda cada arquivo pelo
//    nome solto no multipart do deploy). Quase toda função daqui importa de
//    `../_shared/` e algumas de outras funções; publicada pela pasta, ela
//    subiria sem os módulos de que depende. Cada função vira **um arquivo só**,
//    empacotado pelo rolldown com o import `npm:` de fora, em
//    `instalacao/funcoes/<nome>/index.ts`. Um arquivo por função é também uma
//    leitura do GitHub por função em vez das ~950 que a cópia achatada pediria.
// 2. **O passo `sql` roda a pasta inteira numa requisição só**, um arquivo por
//    chamada à Management API. Com ~100 migrações, é uma requisição de minutos
//    no servidor do painel. As migrações vão em partes de
//    `MIGRACOES_POR_PARTE`, cópias byte a byte em `instalacao/migracoes/`, cada
//    parte um passo com o seu `quantos`.
//
// Antes das migrações vem o preparo (as extensões que elas conferem e não
// criam), e depois delas o registro da versão, que `versao_da_instalacao()`
// lê. Por último, a conferência chama a função `saude`, que também grava o
// endereço das rotinas.
//
// Sem passo `admin`: a interface cria o dono pela fundação no primeiro acesso,
// então o instalador não precisa ler a chave secreta do projeto (escopo
// Secrets). Ver docs/instalacao.md.

import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rolldown } from 'rolldown'

export const RAIZ = fileURLToPath(new URL('..', import.meta.url))

/** A versão do contrato de instalação que este roteiro declara. */
export const CONTRATO = 2

export const ROTEIRO = 'instalacao.json'
export const PASTA_DO_PACOTE = 'instalacao'
export const MIGRACOES_POR_PARTE = 20

const PASTA_DE_MIGRACOES = 'supabase/migrations'
const PASTA_DE_FUNCOES = 'supabase/functions'
const CONFIG = 'supabase/config.toml'
export const ARQUIVO_DA_VERSAO = 'supabase/functions/_shared/versao-da-instalacao.ts'

/** A função que a conferência chama. Tem que ser publicada antes. */
export const FUNCAO_DA_CONFERENCIA = 'saude'

export interface PassoSql {
  readonly tipo: 'sql'
  readonly rotulo: string
  readonly pasta: string
  readonly quantos: number
}

export interface PassoFuncao {
  readonly tipo: 'funcao'
  readonly rotulo: string
  readonly nome: string
  readonly pasta: string
  readonly entrada: string
  readonly verificarJwt: boolean
  readonly motivoSemJwt?: string
}

export interface PassoConferencia {
  readonly tipo: 'conferencia'
  readonly rotulo: string
  readonly funcao: string
  readonly caminho: string
  readonly metodo: 'GET'
  readonly aceita: readonly number[]
  readonly prova: { readonly campo: string; readonly igual: boolean }
  readonly nivel: 'prova'
  /**
   * Ainda não é do contrato 2 para esta família: o painel ignora o campo hoje.
   * É o que ele precisa para devolver a cópia do app com o projeto conectado
   * (docs/instalacao.md, "O que o painel precisa").
   */
  readonly revelar: { readonly campo: string; readonly rotulo: string }
}

export type Passo = PassoSql | PassoFuncao | PassoConferencia

export interface Roteiro {
  readonly contrato: number
  readonly destino: 'supabase'
  readonly entradas: readonly never[]
  readonly passos: readonly Passo[]
}

export interface Pacote {
  readonly roteiro: Roteiro
  /** Caminho relativo à raiz do repositório → conteúdo. */
  readonly arquivos: ReadonlyMap<string, string>
}

export interface BlocoDaFuncao {
  readonly nome: string
  readonly verificarJwt: boolean
  readonly motivo: string
}

const CABECALHO_DE_FUNCAO = /^\[functions\.([a-z0-9-]+)\]$/

/**
 * Os blocos `[functions.*]` de config.toml, com o comentário que os precede.
 * Mesma leitura de `testes/estatica/portas-das-funcoes.test.ts`: o motivo é o
 * comentário, e um parser de TOML o descartaria.
 */
export function lerBlocosDasFuncoes(config: string): Map<string, BlocoDaFuncao> {
  const linhas = config.split('\n')
  const blocos = new Map<string, BlocoDaFuncao>()
  for (const [indice, linha] of linhas.entries()) {
    const nome = CABECALHO_DE_FUNCAO.exec(linha.trim())?.[1]
    if (nome === undefined) continue

    const motivo: string[] = []
    for (let acima = indice - 1; acima >= 0; acima -= 1) {
      const anterior = (linhas[acima] ?? '').trim()
      if (!anterior.startsWith('#')) break
      motivo.unshift(anterior.slice(1).trim())
    }

    let verificarJwt = true
    for (let abaixo = indice + 1; abaixo < linhas.length; abaixo += 1) {
      const dentro = (linhas[abaixo] ?? '').trim()
      if (dentro.startsWith('[')) break
      if (/^verify_jwt\s*=\s*false$/.test(dentro)) verificarJwt = false
    }

    blocos.set(nome, { nome, verificarJwt, motivo: motivo.join(' ').replace(/\s+/g, ' ').trim() })
  }
  return blocos
}

async function arquivosTs(pasta: string): Promise<string[]> {
  const entradas = await readdir(pasta, { withFileTypes: true, recursive: true })
  return entradas
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts'))
    .map((e) => join(e.parentPath, e.name))
    .sort()
}

/**
 * O resumo do código das funções: sha-256 dos caminhos e conteúdos, sem os
 * testes e sem o próprio arquivo da versão (que o carrega).
 */
export async function resumoDasFuncoes(raiz: string = RAIZ): Promise<string> {
  const hash = createHash('sha256')
  for (const caminho of await arquivosTs(join(raiz, PASTA_DE_FUNCOES))) {
    const relativo = relative(raiz, caminho).split('\\').join('/')
    if (relativo === ARQUIVO_DA_VERSAO) continue
    hash.update(relativo).update('\0').update(await readFile(caminho)).update('\0')
  }
  return hash.digest('hex').slice(0, 16)
}

export function conteudoDaVersao(migracao: string, funcoes: string): string {
  return `// Gerado por scripts/pacote-de-instalacao.ts. Não edite à mão: rode
// \`npm run pacote\` e commite o resultado.
//
// A versão que este código espera do banco e publica como a das funções.
// \`migracao\` é a última migração do pacote; \`funcoes\` é o resumo do código das
// funções. A interface compara com o que \`saude\` devolve.

export const VERSAO_DA_INSTALACAO = {
  migracao: '${migracao}',
  funcoes: '${funcoes}',
} as const
`
}

const PREPARO = `-- Gerado por scripts/pacote-de-instalacao.ts. Não edite à mão.
--
-- O preparo do projeto antes das migrações. pg_cron e pg_net são extensões do
-- Supabase que vêm desligadas num projeto novo, e a migração das rotinas
-- (20260923130000) as confere em vez de criá-las. Instalado pelo painel, não há
-- quem as ligue no painel do Supabase: este arquivo liga, e só quando faltam.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
`

function registroDaVersao(migracao: string, funcoes: string): string {
  return `-- Gerado por scripts/pacote-de-instalacao.ts. Não edite à mão.
--
-- O último passo \`sql\` da instalação: a versão que acabou de ser aplicada.
-- \`versao_da_instalacao()\` lê estas duas linhas, e a interface compara com a
-- versão que ela própria espera.
insert into public.app_config (key, value, description)
values
  ('instalacao.migracao', '${migracao}', 'Última migração aplicada pelo instalador.'),
  ('instalacao.funcoes', '${funcoes}', 'Versão das funções publicadas pelo instalador.')
on conflict (key) do update
  set value = excluded.value,
      description = excluded.description;
`
}

function cabecalhoDoEmpacotado(nome: string): string {
  return `// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/${nome}/index.ts. Não edite à mão: rode \`npm run pacote\`.
//
// É o que o instalador do painel publica: a função com os módulos de que ela
// depende num arquivo só, porque o deploy dele manda a pasta da função sem
// subpastas. O código de verdade, testado, está em supabase/functions/.
`
}

/** Empacota uma função num arquivo só. `versao` substitui o arquivo da versão em memória. */
async function empacotar(raiz: string, nome: string, versao: string): Promise<string> {
  const alvoDaVersao = join(raiz, ARQUIVO_DA_VERSAO)
  const construcao = await rolldown({
    cwd: raiz,
    input: join(raiz, PASTA_DE_FUNCOES, nome, 'index.ts'),
    platform: 'neutral',
    external: [/^(npm|jsr|node|https?):/],
    logLevel: 'silent',
    plugins: [
      {
        name: 'versao-em-memoria',
        load(id) {
          return id === alvoDaVersao ? versao : null
        },
      },
    ],
  })
  try {
    const { output } = await construcao.generate({ format: 'esm', comments: false })
    if (output.length !== 1) throw new Error(`${nome}: o empacotamento gerou ${output.length} arquivos`)
    const primeiro = output[0]
    if (!primeiro || primeiro.type !== 'chunk') throw new Error(`${nome}: saída inesperada`)
    return cabecalhoDoEmpacotado(nome) + primeiro.code
  } finally {
    await construcao.close()
  }
}

function numero(n: number): string {
  return String(n).padStart(2, '0')
}

/** Monta o pacote inteiro em memória, a partir do que está em supabase/. */
export async function montarPacote(raiz: string = RAIZ): Promise<Pacote> {
  const arquivos = new Map<string, string>()

  const migracoes = (await readdir(join(raiz, PASTA_DE_MIGRACOES))).filter((n) => n.endsWith('.sql')).sort()
  if (migracoes.length === 0) throw new Error('nenhuma migração em supabase/migrations')
  const ultima = (migracoes.at(-1) ?? '').split('_')[0] ?? ''

  const resumo = await resumoDasFuncoes(raiz)
  const versao = conteudoDaVersao(ultima, resumo)
  arquivos.set(ARQUIVO_DA_VERSAO, versao)

  const passos: Passo[] = []

  arquivos.set(`${PASTA_DO_PACOTE}/preparo/00_extensoes.sql`, PREPARO)
  passos.push({
    tipo: 'sql',
    rotulo: 'Ligar o agendador e as chamadas de saída do banco',
    pasta: `${PASTA_DO_PACOTE}/preparo`,
    quantos: 1,
  })

  const partes = Math.ceil(migracoes.length / MIGRACOES_POR_PARTE)
  for (let parte = 0; parte < partes; parte += 1) {
    const lote = migracoes.slice(parte * MIGRACOES_POR_PARTE, (parte + 1) * MIGRACOES_POR_PARTE)
    const pasta = `${PASTA_DO_PACOTE}/migracoes/parte-${numero(parte + 1)}`
    for (const nome of lote) {
      arquivos.set(`${pasta}/${nome}`, await readFile(join(raiz, PASTA_DE_MIGRACOES, nome), 'utf8'))
    }
    passos.push({
      tipo: 'sql',
      rotulo: `Criar o banco, parte ${parte + 1} de ${partes}`,
      pasta,
      quantos: lote.length,
    })
  }

  arquivos.set(`${PASTA_DO_PACOTE}/registro/versao.sql`, registroDaVersao(ultima, resumo))
  passos.push({
    tipo: 'sql',
    rotulo: 'Registrar a versão instalada',
    pasta: `${PASTA_DO_PACOTE}/registro`,
    quantos: 1,
  })

  const blocos = lerBlocosDasFuncoes(await readFile(join(raiz, CONFIG), 'utf8'))
  const pastas = await readdir(join(raiz, PASTA_DE_FUNCOES), { withFileTypes: true })
  const funcoes: string[] = []
  for (const pasta of pastas) {
    if (!pasta.isDirectory() || pasta.name.startsWith('_')) continue
    const temEntrada = (await readdir(join(raiz, PASTA_DE_FUNCOES, pasta.name))).includes('index.ts')
    if (temEntrada) funcoes.push(pasta.name)
  }
  funcoes.sort()

  for (const nome of funcoes) {
    const bloco = blocos.get(nome)
    const verificarJwt = bloco?.verificarJwt ?? true
    if (!verificarJwt && !bloco?.motivo) {
      throw new Error(`${nome}: verify_jwt = false em config.toml sem o comentário que diz por quê`)
    }
    const pasta = `${PASTA_DO_PACOTE}/funcoes/${nome}`
    arquivos.set(`${pasta}/index.ts`, await empacotar(raiz, nome, versao))
    passos.push({
      tipo: 'funcao',
      rotulo: `Publicar a função ${nome}`,
      nome,
      pasta,
      entrada: 'index.ts',
      verificarJwt,
      ...(verificarJwt ? {} : { motivoSemJwt: bloco?.motivo ?? '' }),
    })
  }

  if (!funcoes.includes(FUNCAO_DA_CONFERENCIA)) {
    throw new Error(`a conferência chama ${FUNCAO_DA_CONFERENCIA}, e essa função não existe`)
  }
  passos.push({
    tipo: 'conferencia',
    rotulo: 'Conferir que a instalação responde',
    funcao: FUNCAO_DA_CONFERENCIA,
    caminho: '/',
    metodo: 'GET',
    aceita: [200],
    prova: { campo: 'ok', igual: true },
    nivel: 'prova',
    revelar: { campo: 'chave', rotulo: 'Chave publicável do projeto' },
  })

  const roteiro: Roteiro = { contrato: CONTRATO, destino: 'supabase', entradas: [], passos }
  arquivos.set(ROTEIRO, `${JSON.stringify(roteiro, null, 2)}\n`)
  return { roteiro, arquivos }
}

/** Os arquivos que estão hoje em `instalacao/`, relativos à raiz. */
export async function arquivosNoDisco(raiz: string = RAIZ): Promise<string[]> {
  try {
    const entradas = await readdir(join(raiz, PASTA_DO_PACOTE), { withFileTypes: true, recursive: true })
    return entradas
      .filter((e) => e.isFile())
      .map((e) => relative(raiz, join(e.parentPath, e.name)).split('\\').join('/'))
      .sort()
  } catch {
    return []
  }
}

/** O que difere entre o pacote e o disco: arquivos a criar, mudar ou apagar. */
export async function divergencias(pacote: Pacote, raiz: string = RAIZ): Promise<string[]> {
  const achados: string[] = []
  for (const [caminho, conteudo] of pacote.arquivos) {
    let noDisco: string | null
    try {
      noDisco = await readFile(join(raiz, caminho), 'utf8')
    } catch {
      noDisco = null
    }
    if (noDisco === null) achados.push(`falta ${caminho}`)
    else if (noDisco !== conteudo) achados.push(`envelheceu ${caminho}`)
  }
  for (const caminho of await arquivosNoDisco(raiz)) {
    if (!pacote.arquivos.has(caminho)) achados.push(`sobra ${caminho}`)
  }
  return achados
}

async function gravar(pacote: Pacote, raiz: string): Promise<void> {
  await rm(join(raiz, PASTA_DO_PACOTE), { recursive: true, force: true })
  for (const [caminho, conteudo] of pacote.arquivos) {
    const destino = join(raiz, caminho)
    await mkdir(dirname(destino), { recursive: true })
    await writeFile(destino, conteudo)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const conferir = process.argv.includes('--conferir')
  // Uma passada basta: o resumo das funções não inclui o arquivo da versão, e
  // o empacotamento lê a versão nova em memória, não a do disco.
  const pacote = await montarPacote()
  if (conferir) {
    const achados = await divergencias(pacote)
    if (achados.length > 0) {
      console.error(achados.join('\n'))
      console.error('\npacote: o pacote de instalação envelheceu. Rode `npm run pacote` e commite.')
      process.exit(1)
    }
    console.log(`pacote: ${pacote.roteiro.passos.length} passo(s) em dia.`)
  } else {
    await gravar(pacote, RAIZ)
    console.log(`pacote: ${pacote.arquivos.size} arquivo(s), ${pacote.roteiro.passos.length} passo(s).`)
  }
}

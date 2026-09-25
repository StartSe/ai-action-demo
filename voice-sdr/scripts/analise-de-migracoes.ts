// Validação estática das migrações: as regras de isolamento que dá para provar
// lendo o arquivo, sem subir banco nenhum.
//
// Pega em segundos a maior parte dos erros que só apareceriam num `db reset`:
// tabela sem RLS, tabela de negócio sem account_id, is_member fora da forma que
// o planejador consegue otimizar, segredo literal commitado.
// Referência: docs/PRD-implementacao.md seção 9.1.

export interface Migracao {
  nome: string
  sql: string
}

export interface Achado {
  migracao: string
  regra: 'sintaxe' | 'rls' | 'account_id' | 'is_member' | 'segredo'
  mensagem: string
}

/**
 * Tabelas que não carregam account_id, e por quê.
 * `accounts` é a raiz do isolamento: o id dela é o account_id.
 * `profiles` espelha auth.users e o mesmo usuário serve várias contas.
 * `app_config` é da instalação, não da conta: o endereço base das funções e o
 * nome do segredo no Vault que os jobs do pg_cron leem (T-26) são os mesmos
 * para todas as contas e variam só por ambiente.
 */
export const SEM_ACCOUNT_ID: ReadonlySet<string> = new Set([
  'accounts',
  'profiles',
  'app_config',
])

const SEGREDOS: { nome: string; padrao: RegExp }[] = [
  { nome: 'token JWT', padrao: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { nome: 'chave de API', padrao: /\b(?:sk|rk|pk)[-_](?:live|test)?[-_]?[A-Za-z0-9]{16,}/ },
  { nome: 'chave da AWS', padrao: /\bAKIA[0-9A-Z]{16}\b/ },
  { nome: 'token do Slack', padrao: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { nome: 'chave privada', padrao: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { nome: 'cadeia de conexão', padrao: /\bpostgres(?:ql)?:\/\//i },
  { nome: 'URL literal', padrao: /\bhttps?:\/\//i },
]

interface Lexico {
  /** SQL sem comentários, com literais e corpos de função esvaziados. */
  estrutura: string
  /** Conteúdo de cada literal de texto e de cada corpo de função. */
  conteudos: string[]
  erro?: string
}

/**
 * Separa o que é estrutura do que é conteúdo. Comentário some, literal de texto
 * e corpo de função viram vazio na estrutura e vão para `conteudos`.
 * Assim uma regra sobre políticas não tropeça no corpo de uma função, e a caça
 * a segredo olha só onde segredo cabe.
 */
export function analisarLexico(sql: string): Lexico {
  let estrutura = ''
  const conteudos: string[] = []
  let i = 0

  while (i < sql.length) {
    const resto = sql.slice(i)

    if (resto.startsWith('--')) {
      const fim = sql.indexOf('\n', i)
      i = fim === -1 ? sql.length : fim
      continue
    }

    if (resto.startsWith('/*')) {
      let profundidade = 0
      let j = i
      while (j < sql.length) {
        if (sql.startsWith('/*', j)) {
          profundidade += 1
          j += 2
        } else if (sql.startsWith('*/', j)) {
          profundidade -= 1
          j += 2
          if (profundidade === 0) break
        } else {
          j += 1
        }
      }
      if (profundidade !== 0) {
        return { estrutura, conteudos, erro: 'comentário de bloco não fechado' }
      }
      estrutura += ' '
      i = j
      continue
    }

    if (resto.startsWith("'")) {
      let j = i + 1
      let fechou = false
      while (j < sql.length) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2
            continue
          }
          fechou = true
          j += 1
          break
        }
        j += 1
      }
      if (!fechou) {
        return { estrutura, conteudos, erro: 'literal de texto não fechado' }
      }
      conteudos.push(sql.slice(i + 1, j - 1))
      estrutura += "''"
      i = j
      continue
    }

    if (resto.startsWith('"')) {
      const fim = sql.indexOf('"', i + 1)
      if (fim === -1) {
        return { estrutura, conteudos, erro: 'identificador entre aspas não fechado' }
      }
      estrutura += sql.slice(i, fim + 1)
      i = fim + 1
      continue
    }

    const abertura = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(resto)
    if (abertura) {
      const marca = abertura[0]
      const fim = sql.indexOf(marca, i + marca.length)
      if (fim === -1) {
        return {
          estrutura,
          conteudos,
          erro: `corpo delimitado por ${marca} não fechado`,
        }
      }
      conteudos.push(sql.slice(i + marca.length, fim))
      estrutura += `${marca}${marca}`
      i = fim + marca.length
      continue
    }

    estrutura += sql[i]
    i += 1
  }

  return { estrutura, conteudos }
}

/** Parênteses balanceados sobre a estrutura, e ao menos um comando terminado. */
function verificarSintaxe(migracao: Migracao, lexico: Lexico): Achado[] {
  if (lexico.erro) {
    return [{ migracao: migracao.nome, regra: 'sintaxe', mensagem: lexico.erro }]
  }

  let abertos = 0
  for (const caractere of lexico.estrutura) {
    if (caractere === '(') abertos += 1
    if (caractere === ')') {
      abertos -= 1
      if (abertos < 0) {
        return [
          {
            migracao: migracao.nome,
            regra: 'sintaxe',
            mensagem: 'parêntese fechado sem abertura correspondente',
          },
        ]
      }
    }
  }
  if (abertos > 0) {
    return [
      {
        migracao: migracao.nome,
        regra: 'sintaxe',
        mensagem: `${abertos} parêntese(s) sem fechamento`,
      },
    ]
  }

  if (!lexico.estrutura.includes(';')) {
    return [
      {
        migracao: migracao.nome,
        regra: 'sintaxe',
        mensagem: 'nenhum comando terminado por ponto e vírgula',
      },
    ]
  }

  return []
}

const CRIACAO_DE_TABELA =
  /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(\w+)\.)?"?(\w+)"?\s*\(/gi
const RLS_HABILITADA =
  /alter\s+table\s+(?:(\w+)\.)?"?(\w+)"?\s+enable\s+row\s+level\s+security/gi

interface TabelaCriada {
  nome: string
  migracao: string
  corpo: string
}

/** Tabelas criadas em `public`, com o corpo da definição entre parênteses. */
function tabelasCriadas(migracao: Migracao, estrutura: string): TabelaCriada[] {
  const encontradas: TabelaCriada[] = []

  for (const achado of estrutura.matchAll(CRIACAO_DE_TABELA)) {
    const schema = achado[1]?.toLowerCase() ?? 'public'
    const nome = achado[2]?.toLowerCase()
    if (!nome || schema !== 'public') continue

    const inicio = achado.index + achado[0].length
    let profundidade = 1
    let fim = inicio
    while (fim < estrutura.length && profundidade > 0) {
      if (estrutura[fim] === '(') profundidade += 1
      if (estrutura[fim] === ')') profundidade -= 1
      fim += 1
    }

    encontradas.push({
      nome,
      migracao: migracao.nome,
      corpo: estrutura.slice(inicio, fim - 1),
    })
  }

  return encontradas
}

/** Tabelas de `public` que habilitaram RLS, em qualquer migração. */
function tabelasComRls(estrutura: string): Set<string> {
  const nomes = new Set<string>()
  for (const achado of estrutura.matchAll(RLS_HABILITADA)) {
    const schema = achado[1]?.toLowerCase() ?? 'public'
    const nome = achado[2]?.toLowerCase()
    if (nome && schema === 'public') nomes.add(nome)
  }
  return nomes
}

const CHAMADA_DE_IS_MEMBER = /(?:(\w+)\.)?\bis_member\s*\(/gi

/**
 * `is_member` precisa aparecer como `(select is_member(...))`. Envolvida em
 * subconsulta, o planejador avalia uma vez por comando em vez de uma vez por
 * linha, que é a diferença entre a política custar nada e custar a consulta
 * inteira. Definição, grant, revoke e comment não são chamada.
 */
function verificarFormaDeIsMember(migracao: Migracao, estrutura: string): Achado[] {
  const achados: Achado[] = []

  for (const ocorrencia of estrutura.matchAll(CHAMADA_DE_IS_MEMBER)) {
    const antes = estrutura.slice(0, ocorrencia.index)
    const declaracao = /\b(?:function|procedure)\s+(?:\w+\.)?$/i.test(antes)
    if (declaracao) continue

    if (/\(\s*select\s+$/i.test(antes)) continue

    achados.push({
      migracao: migracao.nome,
      regra: 'is_member',
      mensagem:
        'is_member chamada fora da forma (select is_member(...)), que o planejador não consegue avaliar uma vez por comando',
    })
  }

  return achados
}

function verificarSegredos(migracao: Migracao, lexico: Lexico): Achado[] {
  const achados: Achado[] = []

  for (const conteudo of lexico.conteudos) {
    for (const segredo of SEGREDOS) {
      if (segredo.padrao.test(conteudo)) {
        achados.push({
          migracao: migracao.nome,
          regra: 'segredo',
          mensagem: `${segredo.nome} literal na migração; credencial vive no cofre da conta, não no versionamento`,
        })
      }
    }
  }

  return achados
}

/** Roda todas as regras sobre o conjunto de migrações. */
export function verificarMigracoes(migracoes: Migracao[]): Achado[] {
  const achados: Achado[] = []
  const criadas: TabelaCriada[] = []
  const comRls = new Set<string>()

  for (const migracao of migracoes) {
    const lexico = analisarLexico(migracao.sql)
    const problemasDeSintaxe = verificarSintaxe(migracao, lexico)
    achados.push(...problemasDeSintaxe)
    if (problemasDeSintaxe.length > 0) continue

    achados.push(...verificarSegredos(migracao, lexico))
    achados.push(...verificarFormaDeIsMember(migracao, lexico.estrutura))

    criadas.push(...tabelasCriadas(migracao, lexico.estrutura))
    for (const nome of tabelasComRls(lexico.estrutura)) comRls.add(nome)
  }

  // RLS e account_id se avaliam sobre o conjunto: a tabela nasce numa migração
  // e pode ganhar a política em outra.
  for (const tabela of criadas) {
    if (!comRls.has(tabela.nome)) {
      achados.push({
        migracao: tabela.migracao,
        regra: 'rls',
        mensagem: `public.${tabela.nome} não habilita row level security em nenhuma migração`,
      })
    }

    if (!SEM_ACCOUNT_ID.has(tabela.nome) && !/\baccount_id\b/i.test(tabela.corpo)) {
      achados.push({
        migracao: tabela.migracao,
        regra: 'account_id',
        mensagem: `public.${tabela.nome} é tabela de negócio e não tem coluna account_id`,
      })
    }
  }

  return achados
}

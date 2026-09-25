// O mesmo contrato de BancoDeTeste, agora sobre um Postgres de verdade.
//
// Serve ao degrau de cima da escada de validação: depois de `supabase db reset`,
// o CI reexecuta os testes de travessia contra o banco real, onde as migrações
// foram aplicadas pelo próprio Supabase e o `auth` é o de verdade, não o recorte
// do preâmbulo. Nada aqui roda no laço local — subir o Supabase é proibido
// (docs/PRD-implementacao.md seção 9.1) e este módulo só é carregado quando
// SUPABASE_DB_URL está definida.
//
// Duas coisas fazem isto funcionar sem adaptação do teste:
// - o `auth.uid()` do Supabase lê `request.jwt.claim.sub` antes de olhar o JWT
//   inteiro, então `comoUsuario` continua sendo um set_config;
// - `set role authenticated` existe no banco real com o mesmo nome.

import { Client } from 'pg'

import {
  PARAMETRO_DE_USUARIO,
  UUID,
  type BancoDeTeste,
} from './banco-de-teste.ts'

/**
 * Conecta ao Postgres apontado por `url` e devolve o mesmo contrato do banco em
 * memória. As migrações já têm que estar aplicadas: aqui não se migra nada.
 */
export async function criarBancoPostgresReal(
  url: string,
): Promise<BancoDeTeste> {
  const cliente = new Client({ connectionString: url })
  await cliente.connect()

  const migracoesAplicadas = await lerMigracoesAplicadas(cliente)

  const definirUsuario = async (usuarioId: string | null) => {
    await cliente.query('select set_config($1, $2, false)', [
      PARAMETRO_DE_USUARIO,
      usuarioId ?? '',
    ])
  }

  return {
    sql: {
      // `pg` tipa as linhas como QueryResultRow, que é mais estreito do que o
      // T livre do contrato. O elenco fica aqui, uma vez, em vez de em cada
      // chamada dos testes.
      async query<T = Record<string, unknown>>(
        sql: string,
        params?: unknown[],
      ) {
        const resultado = await cliente.query(sql, params)
        return { rows: resultado.rows as T[] }
      },
      async exec(sql: string) {
        return cliente.query(sql)
      },
    },
    // Banco compartilhado: o teste não derruba política aqui.
    efemero: false,
    migracoesAplicadas,

    // Aqui quem migra é o `supabase db reset` do CI, então não há o que
    // retomar: o banco já chega com tudo aplicado. Parar antes de uma migração
    // para ver o estado anterior é manobra de banco efêmero, e o teste que
    // precisar dela cria o seu próprio com `criarBancoDeTeste`.
    async retomarMigracoes() {
      return []
    },

    async comoUsuario(usuarioId) {
      if (!UUID.test(usuarioId)) {
        throw new Error(`comoUsuario espera um uuid, recebeu ${usuarioId}`)
      }
      await cliente.query('reset role')
      await definirUsuario(usuarioId)
      await cliente.query('set role authenticated')
    },

    async comoAnonimo() {
      await cliente.query('reset role')
      await definirUsuario(null)
      await cliente.query('set role anon')
    },

    async comoServico() {
      await cliente.query('reset role')
      await definirUsuario(null)
    },

    async criarUsuario(email, nomeExibido) {
      await cliente.query('reset role')
      // auth.users do Supabase não tem default no id, ao contrário do recorte
      // do preâmbulo: o uuid vem explícito para valer nos dois bancos.
      const { rows } = await cliente.query<{ id: string }>(
        `insert into auth.users (id, email, raw_user_meta_data)
         values (gen_random_uuid(), $1, jsonb_build_object('display_name', $2::text))
         returning id`,
        [email, nomeExibido ?? email],
      )
      const linha = rows[0]
      if (!linha) throw new Error(`Não foi possível criar o usuário ${email}`)
      return linha.id
    },

    async encerrar() {
      await cliente.end()
    },
  }
}

/**
 * Nomes das migrações que o Supabase registrou. A tabela é do CLI; se ela não
 * existir, o banco não foi preparado por `supabase db reset` e a lista fica
 * vazia em vez de derrubar a conexão.
 */
async function lerMigracoesAplicadas(cliente: Client): Promise<string[]> {
  try {
    const { rows } = await cliente.query<{ version: string; name: string }>(
      'select version, name from supabase_migrations.schema_migrations order by version',
    )
    return rows.map((linha) => `${linha.version}_${linha.name}.sql`)
  } catch {
    return []
  }
}

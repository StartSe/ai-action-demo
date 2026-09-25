// Entrada de `npm run check:sql`. Lê as migrações, aplica as regras estáticas
// e sai com código 1 no primeiro achado. Não abre banco, não abre porta.

import { verificarMigracoes } from './analise-de-migracoes.ts'
import { PASTA_DE_MIGRACOES, lerMigracoes } from './migracoes.ts'

const migracoes = await lerMigracoes()

if (migracoes.length === 0) {
  console.log(`check:sql: nenhuma migração em ${PASTA_DE_MIGRACOES}`)
  process.exit(0)
}

const achados = verificarMigracoes(migracoes)

if (achados.length === 0) {
  console.log(
    `check:sql: ${migracoes.length} migração(ões) sem achado (rls, account_id, is_member, segredo).`,
  )
  process.exit(0)
}

for (const achado of achados) {
  console.error(`${achado.migracao} [${achado.regra}] ${achado.mensagem}`)
}
console.error(`\ncheck:sql: ${achados.length} achado(s).`)
process.exit(1)

// O ponto de checagem da F0: cada critério de aceite da fase, em docs/PRD.md,
// precisa apontar para a prova que o fecha, e a prova precisa existir e ser
// alcançada por `npm run check`. Conferência escrita em prosa envelhece calada
// — critério novo no PRD sem prova declarada derruba este teste, e prova
// apagada também.
//
// A leitura do PRD e o casamento critério ↔ prova moram em
// `testes/auxiliares/ponto-de-checagem.ts`, compartilhados com a F1. Aqui fica
// só o que é da F0: a tabela.

import {
  lerCriteriosDaFase,
  verificarPontoDeChecagem,
  type Prova,
} from '../auxiliares/ponto-de-checagem.ts'

const PROVAS: readonly Prova[] = [
  {
    criterio: 'zero linhas ao consultar qualquer tabela da conta B',
    arquivos: [
      'testes/banco/travessia-entre-contas.test.ts',
      'testes/banco/matriz-de-isolamento.test.ts',
    ],
    faltaNoCi:
      'A varredura roda em PGlite no laço e contra o Postgres do Supabase no degrau 3, por SUPABASE_DB_URL depois do db reset. O que só o Postgres real tem (papéis do PostgREST concedidos pelo próprio Supabase) fica para lá.',
  },
  {
    criterio: 'não pode ser lida de volta por nenhuma chamada feita pelo navegador',
    arquivos: [
      'testes/banco/cofre-de-credenciais.test.ts',
      'supabase/functions/_shared/secrets.test.ts',
    ],
    faltaNoCi:
      'O Vault é do Supabase e não existe em PGlite: o preâmbulo do auxiliar recria o recorte usado. O Vault de verdade, com a chave de criptografia, só se exercita no degrau 3.',
  },
  {
    criterio: 'Convidar, aceitar convite, trocar papel e remover membro',
    arquivos: [
      'testes/banco/convites.test.ts',
      'testes/banco/previa-do-convite.test.ts',
      'supabase/functions/invite-accept/aceite.test.ts',
      'app/src/rotas/config-equipe.test.tsx',
      'app/src/rotas/convite.test.tsx',
    ],
    faltaNoCi:
      'Ponta a ponta em processo é a soma das três camadas com a vizinha dublada. O trajeto único — navegador, função de borda no Deno e Postgres real — é do degrau 3, quando houver suíte de navegador.',
  },
  {
    criterio: 'Papel Operador recebe negativa explícita',
    arquivos: [
      'app/src/rotas/config-discagem.test.tsx',
      'app/src/equipe/papeis.test.ts',
    ],
    faltaNoCi: null,
  },
]

verificarPontoDeChecagem({
  fase: 'F0',
  arquivo: 'testes/estatica/ponto-de-checagem-f0.test.ts',
  criterios: await lerCriteriosDaFase('F0'),
  provas: PROVAS,
})

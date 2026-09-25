/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** O painel da StartSe, quando não é o de produção. Ver `conexao/instalador.ts`. */
  readonly VITE_PAINEL_DA_STARTSE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

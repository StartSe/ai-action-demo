/**
 * O que o gatilho `registrar_auditoria` grava como operação. São os três
 * verbos do Postgres, em minúscula, como `lower(tg_op)` os escreve.
 */
export type AcaoRegistrada = 'insert' | 'update' | 'delete'

/** Quem agiu, na coluna `actor` de `audit_log`. */
export type TipoDeAutor = 'user' | 'agent' | 'system'

export interface AutorDoRegistro {
  tipo: TipoDeAutor
  /** Null para `system`, que age sem sessão. */
  id: string | null
  /** Nome de exibição já resolvido pelo serviço; vazio quando não há. */
  nome: string
}

export interface RegistroDeAuditoria {
  id: string
  /** ISO 8601. É o `created_at` da linha. */
  instante: string
  autor: AutorDoRegistro
  acao: AcaoRegistrada
  /** Nome da tabela tocada, como o gatilho o grava. */
  alvoTipo: string
  alvoId: string | null
  /** Porta por onde a mudança entrou: `trigger`, `rpc:<nome>`, `edge:<fn>`. */
  origem: string
  motivo: string | null
  /** Colunas que mudaram, quando a ação foi `update`. */
  campos: string[]
}

/** Uma pessoa que pode aparecer como autor, para o filtro. */
export interface OpcaoDeAutor {
  id: string
  nome: string
}

/**
 * Janela de tempo do filtro. O valor é o recorte que a tela oferece, e não
 * uma data: quem converte para instante é o serviço, no momento da consulta.
 */
export type Periodo = 'tudo' | '24h' | '7d' | '30d'

export interface ConsultaDeAuditoria {
  /** Identificador do usuário, ou `sistema` para o que rodou sem sessão. */
  autor?: string
  acao?: AcaoRegistrada
  periodo?: Periodo
}

/** Valor de `ConsultaDeAuditoria.autor` que casa com `actor = 'system'`. */
export const AUTOR_SISTEMA = 'sistema'

export interface PaginaDeAuditoria {
  registros: RegistroDeAuditoria[]
  /** Quem pode ser escolhido no filtro de autor: os membros da conta. */
  autores: OpcaoDeAutor[]
  /** A consulta bateu no teto e há registros mais antigos atrás dele. */
  truncada: boolean
}

export type MotivoDeFalhaDaAuditoria =
  | 'sem-permissao'
  | 'sem-conta'
  | 'falha-de-comunicacao'

export type CargaDaAuditoria =
  | { ok: true; pagina: PaginaDeAuditoria }
  | { ok: false; motivo: MotivoDeFalhaDaAuditoria }

/**
 * O contrato que a interface conhece. A implementação sobre o Supabase está
 * em `servico-supabase.ts`; o teste de componente passa um dublê que atende a
 * esta mesma interface, sem rede.
 */
export interface ServicoDeAuditoria {
  /** Trilha da conta, filtrada, da mais recente para a mais antiga. */
  consultar(consulta: ConsultaDeAuditoria): Promise<CargaDaAuditoria>
}

// Esquema e migração das sete tabelas do Precificador.
//
// Por que um arquivo só, em vez de um `abrir()` privado em cada módulo (como lib/historico.ts e
// lib/formularios.ts, que são infraestrutura e não mudam):
//
//  1. **Uma conexão.** Mudar uma linha de custo fixo recalcula a carteira inteira na mesma
//     requisição. Cada `new DatabaseSync(...)` é mais uma conexão disputando o mesmo arquivo; a
//     conexão de lib/store.ts, via `abrirBanco()`, serializa as escritas e tira o SQLITE_BUSY da mesa.
//  2. **Sete tabelas que se referenciam.** Negócio ← Item → Linha de insumo, Negócio → Canal →
//     Preço por canal → Versão do preço. Espalhar os `CREATE TABLE` faria a ordem de criação
//     depender de qual módulo foi importado primeiro.
//
// O comportamento de cada entidade fica no módulo dela (lib/negocio.ts, lib/canais.ts,
// lib/itens.ts, lib/precos.ts): aqui só moram o formato e a migração.
import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { abrirBanco } from "./store";

let preparado = false;

/** Conexão pronta (tabelas criadas). Todo módulo de domínio entra por aqui; nenhum abre o SQLite. */
export function banco(): DatabaseSync {
  const d = abrirBanco();
  if (preparado) return d;
  preparado = true;
  criarTabelas(d);
  return d;
}

/** Id de registro: mesmo gerador do resto do app (lib/historico.ts). */
export function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

export function agora(): string {
  return new Date().toISOString();
}

/**
 * Aceita um id gerado pelo cliente, ou devolve um novo.
 *
 * A tela cria a linha de insumo com um id próprio para ela sobreviver enquanto ainda não tem nome
 * (ver `linhaNova` em components/FichaItem.tsx). O id chega pela rede, então passa por um filtro de
 * formato antes de virar chave primária.
 */
export function idDoCliente(valor: unknown): string {
  return typeof valor === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(valor) ? valor : gerarId();
}

function criarTabelas(d: DatabaseSync): void {
  d.exec(`CREATE TABLE IF NOT EXISTS negocios (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL DEFAULT '',
    regime TEXT NOT NULL DEFAULT 'simples',
    imposto_produto_pct REAL NOT NULL DEFAULT 0,
    imposto_servico_pct REAL NOT NULL DEFAULT 0,
    modo_capacidade TEXT NOT NULL DEFAULT 'unidades',
    volume_mensal_unidades REAL NOT NULL DEFAULT 0,
    horas_produtivas_mes REAL NOT NULL DEFAULT 0,
    pro_labore_mensal REAL NOT NULL DEFAULT 0,
    margem_alvo_padrao_pct REAL NOT NULL DEFAULT 0.2,
    proporcao_produto_pct REAL NOT NULL DEFAULT 0.5,
    criado_em TEXT NOT NULL
  )`);

  d.exec(`CREATE TABLE IF NOT EXISTS linhas_custo_fixo (
    id TEXT PRIMARY KEY,
    negocio_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    valor_mensal REAL NOT NULL DEFAULT 0,
    balde TEXT NOT NULL DEFAULT 'ambos',
    ordem INTEGER NOT NULL DEFAULT 0
  )`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_fixos_negocio ON linhas_custo_fixo (negocio_id)`);

  d.exec(`CREATE TABLE IF NOT EXISTS canais_venda (
    id TEXT PRIMARY KEY,
    negocio_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    taxa_pct REAL NOT NULL DEFAULT 0,
    taxa_fixa REAL NOT NULL DEFAULT 0,
    padrao INTEGER NOT NULL DEFAULT 0,
    ordem INTEGER NOT NULL DEFAULT 0
  )`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_canais_negocio ON canais_venda (negocio_id)`);

  d.exec(`CREATE TABLE IF NOT EXISTS itens (
    id TEXT PRIMARY KEY,
    negocio_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'produto',
    margem_alvo_pct REAL,
    tempo_minutos REAL NOT NULL DEFAULT 0,
    perda_pct REAL NOT NULL DEFAULT 0,
    custo_direto_manual REAL,
    preco_valor_teto REAL,
    precos_concorrentes TEXT NOT NULL DEFAULT '[]',
    exemplo INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL
  )`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_itens_negocio ON itens (negocio_id)`);

  d.exec(`CREATE TABLE IF NOT EXISTS linhas_insumo (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    qtd_usada REAL NOT NULL DEFAULT 0,
    unidade_uso TEXT NOT NULL DEFAULT 'un',
    qtd_compra REAL NOT NULL DEFAULT 1,
    custo_compra REAL NOT NULL DEFAULT 0,
    unidade_compra TEXT NOT NULL DEFAULT 'un',
    ordem INTEGER NOT NULL DEFAULT 0
  )`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_insumos_item ON linhas_insumo (item_id)`);

  d.exec(`CREATE TABLE IF NOT EXISTS precos_canal (
    item_id TEXT NOT NULL,
    canal_id TEXT NOT NULL,
    preco_escolhido REAL NOT NULL DEFAULT 0,
    atualizado_em TEXT NOT NULL,
    PRIMARY KEY (item_id, canal_id)
  )`);

  // Histórico de preço: responde "quanto eu cobrava antes do insumo subir". Guarda o custo-base da
  // época junto, senão a resposta fica pela metade.
  d.exec(`CREATE TABLE IF NOT EXISTS versoes_preco (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    canal_id TEXT NOT NULL,
    preco REAL NOT NULL,
    custo_base REAL NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL
  )`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_versoes_item_canal ON versoes_preco (item_id, canal_id)`);
}

/** Apaga tudo o que é domínio (não mexe em configuração, conta nem histórico). Usado por
 * "apagar os dados de exemplo" e pela exportação/reimportação. */
export function limparDominio(): void {
  const d = banco();
  for (const tabela of ["versoes_preco", "precos_canal", "linhas_insumo", "itens", "canais_venda", "linhas_custo_fixo", "negocios"]) {
    d.exec(`DELETE FROM ${tabela}`);
  }
}

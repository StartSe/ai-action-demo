/**
 * Respostas rápidas: as frases de sempre, guardadas com um atalho para não serem digitadas dez vezes
 * por dia. Tabela própria no mesmo `app.sqlite` de lib/store.ts, no padrão de lib/anexos.ts e
 * lib/memoria.ts (`CREATE TABLE IF NOT EXISTS` na primeira chamada).
 *
 * Este arquivo é o dono de `respostas_rapidas` e não conhece conversa nenhuma: ele não consulta
 * `conversas` nem `mensagens`, e a troca de `{nome}`/`{atendente}` acontece na TELA, na hora de
 * inserir (lib/atalhos.ts), porque a mesma frase serve para todos os contatos.
 *
 * As três respostas de demonstração nascem e morrem com as conversas de exemplo, como as anotações dos
 * contatos: quem chama `sincronizarExemplos` só diz se ainda existe exemplo — a rota é que sabe disso.
 */
import { erroDeAtalho, erroDeTextoRapido, normalizarAtalho } from "./atalhos";
import { respostasRapidasExemplo } from "./demo";
import { abrirBanco, getConfig, setConfig } from "./store";
import type { RespostaRapida } from "./types";

type Linha = {
  id: number;
  atalho: string;
  texto: string;
  criado_em: string;
  exemplo: number;
};

let criada = false;

function banco() {
  const d = abrirBanco();
  if (!criada) {
    d.exec(`CREATE TABLE IF NOT EXISTS respostas_rapidas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      atalho TEXT NOT NULL,
      texto TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      exemplo INTEGER NOT NULL DEFAULT 0
    )`);
    d.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_respostas_rapidas_atalho ON respostas_rapidas (atalho)`);
    criada = true;
  }
  return d;
}

function daLinha(l: Linha): RespostaRapida {
  return {
    id: l.id,
    atalho: l.atalho,
    texto: l.texto,
    criadoEm: new Date(`${l.criado_em.replace(" ", "T")}Z`).toISOString(),
    exemplo: l.exemplo === 1,
  };
}

/** Todas as respostas rápidas, em ordem alfabética de atalho (é assim que a pessoa procura). */
export function listarRespostasRapidas(): RespostaRapida[] {
  const linhas = banco().prepare(`SELECT id, atalho, texto, criado_em, exemplo FROM respostas_rapidas ORDER BY atalho`).all() as Linha[];
  return linhas.map(daLinha);
}

export function obterRespostaRapida(id: number): RespostaRapida | null {
  const l = banco().prepare(`SELECT id, atalho, texto, criado_em, exemplo FROM respostas_rapidas WHERE id = ?`).get(id) as Linha | undefined;
  return l ? daLinha(l) : null;
}

/**
 * O que impede esta resposta de ser gravada, em uma frase de negócio — ou `null` quando ela pode. O
 * atalho repetido é conferido aqui (e não só pelo índice único) para a rota responder com a mesma
 * linguagem dos outros erros, em vez de deixar o banco estourar.
 */
export function erroDeRespostaRapida({ atalho, texto, exceto }: { atalho: string; texto: string; exceto?: number }): string | null {
  const doAtalho = erroDeAtalho(atalho);
  if (doAtalho) return doAtalho;
  const doTexto = erroDeTextoRapido(texto);
  if (doTexto) return doTexto;
  const repetido = banco().prepare(`SELECT id FROM respostas_rapidas WHERE atalho = ? AND id <> ?`).get(atalho, exceto ?? -1) as { id: number } | undefined;
  if (repetido) return `Já existe uma resposta rápida com o atalho "${atalho}". Escolha outro.`;
  return null;
}

/** Grava uma resposta rápida nova. Quem chama já validou por `erroDeRespostaRapida`. */
export function criarRespostaRapida({ atalho, texto, exemplo = false }: { atalho: string; texto: string; exemplo?: boolean }): RespostaRapida {
  const d = banco();
  d.prepare(`INSERT INTO respostas_rapidas (atalho, texto, exemplo) VALUES (?, ?, ?)`).run(normalizarAtalho(atalho), texto.trim(), exemplo ? 1 : 0);
  const id = Number((d.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id);
  return obterRespostaRapida(id)!;
}

/**
 * Corrige uma resposta rápida existente. Editar uma resposta de demonstração a torna de verdade: quem
 * ajustou o texto quer guardá-lo, e ela não pode sumir com as conversas de exemplo depois disso.
 */
export function atualizarRespostaRapida(id: number, { atalho, texto }: { atalho: string; texto: string }): RespostaRapida | null {
  if (!obterRespostaRapida(id)) return null;
  banco().prepare(`UPDATE respostas_rapidas SET atalho = ?, texto = ?, exemplo = 0 WHERE id = ?`).run(normalizarAtalho(atalho), texto.trim(), id);
  return obterRespostaRapida(id);
}

export function apagarRespostaRapida(id: number): boolean {
  const r = banco().prepare(`DELETE FROM respostas_rapidas WHERE id = ?`).run(id);
  return Number(r.changes) > 0;
}

/** Marca de que as respostas de demonstração já nasceram uma vez: é ela que impede que elas voltem. */
const CHAVE_EXEMPLOS = "RESPOSTAS_RAPIDAS_EXEMPLO_SEMEADAS";

/**
 * As respostas rápidas de demonstração acompanham as conversas de exemplo (lib/demo.ts). Quem chama
 * passa se ainda EXISTE conversa de exemplo — a demonstração some por três caminhos diferentes e
 * nenhum deles precisa saber que esta tabela existe, como em lib/memoria.ts:sincronizarContatosDeExemplo.
 *
 * Elas nascem UMA vez (mesma regra das conversas de exemplo, lib/conversas.ts:CHAVE_EXEMPLOS): sem a
 * marca, apagar uma delas no diálogo a faria voltar na leitura seguinte da lista. E só some o que
 * continua marcado como exemplo — uma resposta que a equipe editou já deixou de ser demonstração, e
 * uma com o mesmo atalho nunca é criada por cima da dela.
 */
export function sincronizarRespostasRapidasDeExemplo(temExemplos: boolean): void {
  const d = banco();
  if (!temExemplos) {
    d.prepare(`DELETE FROM respostas_rapidas WHERE exemplo = 1`).run();
    return;
  }
  if (getConfig(CHAVE_EXEMPLOS)) return;
  for (const r of respostasRapidasExemplo()) {
    const existe = d.prepare(`SELECT id FROM respostas_rapidas WHERE atalho = ?`).get(r.atalho) as { id: number } | undefined;
    if (!existe) criarRespostaRapida({ atalho: r.atalho, texto: r.texto, exemplo: true });
  }
  setConfig(CHAVE_EXEMPLOS, new Date().toISOString());
}

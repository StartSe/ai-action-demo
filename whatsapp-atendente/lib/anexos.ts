/**
 * Anexos das mensagens: o áudio, a foto, o arquivo, a localização ou o contato que o cliente mandou
 * no lugar de (ou junto de) um texto. Tabela própria no mesmo `app.sqlite` de lib/store.ts, no padrão
 * já usado por lib/conversas.ts (`CREATE TABLE IF NOT EXISTS` na primeira abertura).
 *
 * Dono do quê: lib/conversas.ts continua dono das tabelas `conversas` e `mensagens` e este arquivo é
 * o dono de `anexos`; a ligação entre os dois é só o id da mensagem. Por isso nada aqui consulta
 * `mensagens` — quem apaga uma conversa passa os ids das mensagens (`apagarDeMensagens`).
 *
 * O arquivo em si é copiado para `DATA_DIR/anexos/<id>` em segundo plano: o endereço que o provedor
 * manda é temporário, e sem a cópia a conversa de ontem apareceria vazia. Quando a cópia falha, o
 * registro fica com o endereço original e a rota `/api/anexos/[id]` leva o navegador até ele.
 *
 * Localização e contato não são arquivo: eles guardam o que dá para mostrar nas mesmas colunas —
 * `nome_arquivo` é o título (o endereço, o nome de quem foi indicado), `legenda` é a segunda linha
 * (o telefone) e `url_original` é o link do mapa (vazio no contato).
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { publicar } from "./eventos";
import { abrirBanco } from "./store";
import type { Anexo, TipoAnexo } from "./types";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

/** Onde as cópias ficam: dentro do disco do app, ao lado do banco. */
const PASTA = path.join(DATA_DIR, "anexos");

/** Teto de uma cópia. Acima disso o app guarda só o endereço original: o disco é de 1 GB. */
export const TAMANHO_MAXIMO = 16 * 1024 * 1024;

/** Tempo máximo esperando o provedor entregar o arquivo. */
const TEMPO_LIMITE_MS = 30_000;

/** Por quanto tempo o app guarda a cópia de um anexo (a limpeza roda em instrumentation.ts). */
export const DIAS_GUARDADOS = 90;

/** Intervalo mínimo entre duas limpezas neste processo: a limpeza mexe em disco, o laço roda a cada minuto. */
const INTERVALO_LIMPEZA_MS = 6 * 60 * 60 * 1000;

const TIPOS: TipoAnexo[] = ["audio", "imagem", "video", "documento", "figurinha", "localizacao", "contato", "outro"];

/** Os tipos que têm um arquivo para copiar e servir; localização e contato são só cartões de texto. */
const COM_ARQUIVO: TipoAnexo[] = ["audio", "imagem", "video", "documento", "figurinha", "outro"];

type LinhaAnexo = {
  id: string;
  mensagem_id: number;
  tipo: string;
  url_original: string;
  caminho_local: string | null;
  mime: string;
  nome_arquivo: string;
  tamanho: number;
  segundos: number | null;
  legenda: string | null;
  transcricao: string | null;
  criado_em: string;
};

/** O anexo como ele está no banco, com a cópia local: só para este arquivo e para a rota que serve o arquivo. */
export type AnexoRegistro = Anexo & { mensagemId: number; caminhoLocal: string | null; urlOriginal: string };

let criado = false;

function banco() {
  const d = abrirBanco();
  if (!criado) {
    d.exec(`CREATE TABLE IF NOT EXISTS anexos (
      id TEXT PRIMARY KEY,
      mensagem_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      url_original TEXT NOT NULL DEFAULT '',
      caminho_local TEXT NULL,
      mime TEXT NOT NULL DEFAULT '',
      nome_arquivo TEXT NOT NULL DEFAULT '',
      tamanho INTEGER NOT NULL DEFAULT 0,
      segundos INTEGER NULL,
      legenda TEXT NULL,
      transcricao TEXT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    d.exec(`CREATE INDEX IF NOT EXISTS anexos_por_mensagem ON anexos (mensagem_id)`);
    criado = true;
  }
  return d;
}

function ehTipo(valor: string): valor is TipoAnexo {
  return (TIPOS as string[]).includes(valor);
}

/** O endereço que a bolha usa: a cópia servida pelo app, o link do mapa da localização, nada no contato. */
function enderecoDeTela(l: LinhaAnexo, tipo: TipoAnexo): string {
  if (COM_ARQUIVO.includes(tipo)) return `/api/anexos/${l.id}`;
  return l.url_original;
}

function paraAnexo(l: LinhaAnexo): Anexo {
  const tipo = ehTipo(l.tipo) ? l.tipo : "outro";
  return {
    id: l.id,
    tipo,
    url: enderecoDeTela(l, tipo),
    mime: l.mime,
    nomeArquivo: l.nome_arquivo,
    tamanho: Number(l.tamanho),
    segundos: l.segundos === null ? undefined : Number(l.segundos),
    legenda: l.legenda ?? undefined,
    transcricao: l.transcricao ?? undefined,
  };
}

function paraRegistro(l: LinhaAnexo): AnexoRegistro {
  return { ...paraAnexo(l), mensagemId: Number(l.mensagem_id), caminhoLocal: l.caminho_local, urlOriginal: l.url_original };
}

// --- Escrita -------------------------------------------------------------

export interface AnexoNovo {
  /** A mensagem a que este anexo pertence (lib/conversas.ts). */
  mensagemId: number;
  /** Só para avisar as telas de que a conversa mudou; o número não é gravado aqui. */
  numero: string;
  tipo: TipoAnexo;
  /** Endereço no provedor (ou o link do mapa, na localização); vazio quando não há o que abrir. */
  urlOriginal?: string;
  mime?: string;
  nomeArquivo?: string;
  segundos?: number;
  legenda?: string;
  /** O que o atendente ouviu ou leu neste anexo; só as conversas de exemplo já nascem com ele
   * preenchido — nos anexos de verdade quem grava é lib/midia.ts, depois de a IA processar. */
  transcricao?: string;
  /** Momento da gravação, para as conversas de exemplo nascerem espalhadas nos últimos dias. */
  em?: Date;
}

/** Grava o anexo e devolve o registro; o arquivo em si é copiado depois, por `baixar`. */
export function registrarAnexo({ mensagemId, numero, tipo, urlOriginal = "", mime = "", nomeArquivo = "", segundos, legenda, transcricao, em }: AnexoNovo): AnexoRegistro {
  const id = randomBytes(8).toString("hex");
  const quando = (em ?? new Date()).toISOString().slice(0, 19).replace("T", " ");
  banco()
    .prepare(
      `INSERT INTO anexos (id, mensagem_id, tipo, url_original, caminho_local, mime, nome_arquivo, tamanho, segundos, legenda, transcricao, criado_em)
       VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, ?, ?, ?)`
    )
    .run(id, mensagemId, tipo, urlOriginal, mime, nomeArquivo, segundos ?? null, legenda ?? null, transcricao ?? null, quando);
  // A mensagem já avisou as telas quando foi gravada, mas o anexo chega logo depois: sem este segundo
  // aviso, a bolha ficaria só com o texto entre colchetes até a próxima consulta.
  publicar({ tipo: "conversa", numero });
  return obter(id) as AnexoRegistro;
}

/** O que a IA ouviu ou leu neste anexo (lib/midia.ts). */
export function definirTranscricao(id: string, texto: string): void {
  banco().prepare("UPDATE anexos SET transcricao = ? WHERE id = ?").run(texto, id);
}

// --- Leitura -------------------------------------------------------------

export function obter(id: string): AnexoRegistro | null {
  const l = banco().prepare("SELECT * FROM anexos WHERE id = ?").get(id) as LinhaAnexo | undefined;
  return l ? paraRegistro(l) : null;
}

/**
 * Os anexos de um conjunto de mensagens, agrupados pelo id da mensagem. Uma consulta só: a conversa
 * aberta pede todos de uma vez em vez de uma consulta por bolha.
 */
export function anexosDeMensagens(ids: number[]): Map<number, Anexo[]> {
  const mapa = new Map<number, Anexo[]>();
  if (ids.length === 0) return mapa;
  const marcadores = ids.map(() => "?").join(", ");
  const linhas = banco().prepare(`SELECT * FROM anexos WHERE mensagem_id IN (${marcadores}) ORDER BY rowid`).all(...ids) as LinhaAnexo[];
  for (const l of linhas) {
    const lista = mapa.get(Number(l.mensagem_id)) ?? [];
    lista.push(paraAnexo(l));
    mapa.set(Number(l.mensagem_id), lista);
  }
  return mapa;
}

// --- Cópia do arquivo ----------------------------------------------------

/** O `mime` que o provedor anunciou, sem os parâmetros depois do ponto e vírgula. */
function mimeLimpo(valor: string | null | undefined): string {
  return (valor ?? "").split(";")[0]?.trim() ?? "";
}

/**
 * Copia o arquivo do provedor para `DATA_DIR/anexos/<id>`. Devolve se a cópia foi feita. Falhou (fora
 * do ar, grande demais, demorou demais): o registro fica com o endereço original e a conversa continua
 * mostrando o anexo — o que não pode acontecer é a falha derrubar quem chamou.
 */
export async function baixar(id: string): Promise<boolean> {
  const anexo = obter(id);
  if (!anexo || anexo.caminhoLocal || !anexo.urlOriginal) return false;
  if (!COM_ARQUIVO.includes(anexo.tipo)) return false;
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    const resposta = await fetch(anexo.urlOriginal, { signal: controle.signal });
    if (!resposta.ok) throw new Error(`o provedor respondeu ${resposta.status}`);
    const anunciado = Number(resposta.headers.get("content-length") ?? 0);
    if (anunciado > TAMANHO_MAXIMO) throw new Error(`arquivo grande demais (${Math.round(anunciado / 1024 / 1024)} MB)`);
    const dados = Buffer.from(await resposta.arrayBuffer());
    if (dados.length > TAMANHO_MAXIMO) throw new Error(`arquivo grande demais (${Math.round(dados.length / 1024 / 1024)} MB)`);
    // O tipo do arquivo é o que o cabeçalho da resposta diz; o aviso do provedor é só uma promessa.
    const mime = mimeLimpo(resposta.headers.get("content-type")) || anexo.mime;
    fs.mkdirSync(PASTA, { recursive: true });
    const caminho = path.join(PASTA, id);
    fs.writeFileSync(caminho, dados);
    banco().prepare("UPDATE anexos SET caminho_local = ?, mime = ?, tamanho = ? WHERE id = ?").run(caminho, mime, dados.length, id);
    return true;
  } catch (err) {
    console.error(`Não foi possível guardar o anexo ${id} (${anexo.tipo}):`, err instanceof Error ? err.message : err);
    return false;
  } finally {
    clearTimeout(limite);
  }
}

/** Copia o arquivo sem segurar quem chamou: a resposta ao cliente nunca espera por um download. */
export function baixarEmSegundoPlano(id: string): void {
  baixar(id).catch((err) => console.error(`Falha inesperada ao guardar o anexo ${id}:`, err));
}

// --- Limpeza -------------------------------------------------------------

function apagarArquivo(caminho: string | null): void {
  if (!caminho) return;
  try {
    fs.rmSync(caminho, { force: true });
  } catch (err) {
    console.error("Não foi possível apagar o arquivo de um anexo:", err);
  }
}

/** Apaga os anexos destas mensagens, com os arquivos. Chamado por lib/conversas.ts ao apagar conversas. */
export function apagarDeMensagens(ids: number[]): number {
  if (ids.length === 0) return 0;
  const marcadores = ids.map(() => "?").join(", ");
  const d = banco();
  const linhas = d.prepare(`SELECT id, caminho_local FROM anexos WHERE mensagem_id IN (${marcadores})`).all(...ids) as {
    id: string;
    caminho_local: string | null;
  }[];
  for (const l of linhas) apagarArquivo(l.caminho_local);
  d.prepare(`DELETE FROM anexos WHERE mensagem_id IN (${marcadores})`).run(...ids);
  return linhas.length;
}

let ultimaLimpeza = 0;

/**
 * Apaga os anexos com mais de 90 dias, com os arquivos: o disco do app é de 1 GB, e uma foto de três
 * meses atrás não ajuda mais ninguém a atender. A mensagem em si continua na conversa, com o texto
 * entre colchetes. Roda no máximo de 6 em 6 horas, mesmo sendo chamada pelo laço de cada minuto.
 */
export function limparAntigos({ forcar = false }: { forcar?: boolean } = {}): number {
  const agora = Date.now();
  if (!forcar && agora - ultimaLimpeza < INTERVALO_LIMPEZA_MS) return 0;
  ultimaLimpeza = agora;
  const d = banco();
  const corte = new Date(agora - DIAS_GUARDADOS * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
  const linhas = d.prepare("SELECT id, caminho_local FROM anexos WHERE criado_em < ?").all(corte) as { id: string; caminho_local: string | null }[];
  if (linhas.length === 0) return 0;
  for (const l of linhas) apagarArquivo(l.caminho_local);
  d.prepare("DELETE FROM anexos WHERE criado_em < ?").run(corte);
  console.log(`Limpeza de anexos: ${linhas.length} com mais de ${DIAS_GUARDADOS} dias apagados.`);
  return linhas.length;
}

// --- Conteúdo do arquivo -------------------------------------------------

/**
 * O arquivo deste anexo em memória, para a IA ouvir o áudio, olhar a foto ou ler o documento
 * (lib/midia.ts). Prefere a cópia no disco; sem ela (a cópia ainda está em andamento, ou falhou), busca
 * no provedor sem guardar nada. Devolve `null` quando não há arquivo nenhum, e nunca derruba quem
 * chamou: o pior caso é o atendente não entender o anexo.
 */
export async function bytesDoAnexo(id: string): Promise<{ dados: Buffer; mime: string } | null> {
  const anexo = obter(id);
  if (!anexo || !COM_ARQUIVO.includes(anexo.tipo)) return null;
  if (anexo.caminhoLocal) {
    try {
      return { dados: fs.readFileSync(anexo.caminhoLocal), mime: anexo.mime };
    } catch (err) {
      console.error(`Não foi possível ler a cópia do anexo ${id}:`, err instanceof Error ? err.message : err);
    }
  }
  if (!anexo.urlOriginal) return null;
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    const resposta = await fetch(anexo.urlOriginal, { signal: controle.signal });
    if (!resposta.ok) throw new Error(`o provedor respondeu ${resposta.status}`);
    const dados = Buffer.from(await resposta.arrayBuffer());
    if (dados.length > TAMANHO_MAXIMO) throw new Error(`arquivo grande demais (${Math.round(dados.length / 1024 / 1024)} MB)`);
    return { dados, mime: mimeLimpo(resposta.headers.get("content-type")) || anexo.mime };
  } catch (err) {
    console.error(`Não foi possível buscar o anexo ${id} no provedor:`, err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(limite);
  }
}

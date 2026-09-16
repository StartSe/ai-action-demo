// Vídeos pedidos ao Higgsfield a partir de um conceito: plano de confirmação (efeito, formato, custo, saldo),
// criação do trabalho, gravação em SQLite e acompanhamento. Arquivo próprio deste app (não compartilhado):
// usa o mesmo arquivo SQLite de lib/store.ts, com tabela e conexão próprias (padrão de lib/historico.ts).
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ErroDePedido, validarImagem } from "./conceitos";
import { atualizarSaida, listarPorTipo, obter } from "./historico";
import { avisar } from "./notificacoes-do-app";
import { enderecoPublico } from "./setup-comum";
import { abrirSessao, custoVideo, efeitoPorIdOuNome, enviarImagem, ErroHiggsfield, HiggsfieldNaoConectado, estado as estadoRemoto, gerarVideo, higgsfieldConfigurado, listarEfeitos, mapearEfeito, motivoEmPortugues, saldo as saldoRemoto, urlDoResultado, type SessaoHiggsfield } from "./higgsfield";
import { videoTerminou, type Campanha, type Conceito, type Duracao, type EfeitoRemoto, type EstadoVideo, type Formato, type PlanoVideo, type Video } from "./types";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
let db: DatabaseSync | null = null;

/** Tempo máximo na etapa "enviando" antes de considerar que o envio morreu (o processo pode ter reiniciado no meio). */
export const LIMITE_ENVIO_MS = 3 * 60 * 1000;
/** Tempo máximo gerando/finalizando antes de desistir. */
export const LIMITE_GERACAO_MS = 20 * 60 * 1000;

export const AVISO_CREDITOS = "O vídeo é gerado na sua conta do Higgsfield e os créditos são debitados de lá. Nada é cobrado antes de você confirmar, e só um vídeo é gerado por vez.";

/** A campanha ou o conceito não existem: as rotas respondem 404. */
export class CampanhaNaoEncontrada extends Error {}
/** Já existe um vídeo em andamento (um por vez): as rotas respondem 409. */
export class VideoEmAndamento extends Error {}

function abrir(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "app.sqlite"));
  db.exec(`CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    campanhaId TEXT NOT NULL,
    conceitoId TEXT NOT NULL,
    estado TEXT NOT NULL,
    efeito TEXT NOT NULL,
    efeitoId TEXT NULL,
    formato TEXT NOT NULL,
    duracaoSeg INTEGER NOT NULL,
    url TEXT NULL,
    custoCreditos REAL NULL,
    externoId TEXT NULL,
    erro TEXT NULL,
    criadoEm TEXT NOT NULL,
    atualizadoEm TEXT NOT NULL
  )`);
  return db;
}

type Linha = {
  id: string; campanhaId: string; conceitoId: string; estado: EstadoVideo; efeito: string; efeitoId: string | null; formato: Formato; duracaoSeg: number;
  url: string | null; custoCreditos: number | null; externoId: string | null; erro: string | null; criadoEm: string; atualizadoEm: string;
};

function linhaParaVideo(l: Linha): Video {
  return {
    id: l.id,
    campanhaId: l.campanhaId,
    conceitoId: l.conceitoId,
    estado: l.estado,
    efeito: l.efeito,
    efeitoId: l.efeitoId ?? undefined,
    formato: l.formato,
    duracaoSeg: l.duracaoSeg as Duracao,
    url: l.url ?? undefined,
    custoCreditos: l.custoCreditos ?? undefined,
    externoId: l.externoId ?? undefined,
    erro: l.erro ?? undefined,
    criadoEm: l.criadoEm,
    atualizadoEm: l.atualizadoEm,
  };
}

export function obterVideo(id: string): Video | null {
  const linha = abrir().prepare("SELECT * FROM videos WHERE id = ?").get(id) as Linha | undefined;
  return linha ? linhaParaVideo(linha) : null;
}

/** Vídeos de uma campanha, mais recentes primeiro. */
export function listarPorCampanha(campanhaId: string): Video[] {
  const linhas = abrir().prepare("SELECT * FROM videos WHERE campanhaId = ? ORDER BY criadoEm DESC").all(campanhaId) as Linha[];
  return linhas.map(linhaParaVideo);
}

/** O vídeo que ainda está sendo feito (um por vez), se houver; envios parados há mais que o limite são marcados como falha antes. */
export function videoEmAndamento(): Video | null {
  const linhas = abrir().prepare("SELECT * FROM videos WHERE estado IN ('enviando', 'gerando', 'finalizando') ORDER BY criadoEm DESC").all() as Linha[];
  for (const l of linhas) {
    const v = expirarSePreciso(linhaParaVideo(l));
    if (!videoTerminou(v)) return v;
  }
  return null;
}

function atualizar(id: string, mudancas: Partial<Omit<Video, "id" | "criadoEm" | "atualizadoEm">>): Video {
  const atual = obterVideo(id);
  if (!atual) throw new CampanhaNaoEncontrada("Vídeo não encontrado.");
  const novo: Video = { ...atual, ...mudancas, atualizadoEm: new Date().toISOString() };
  abrir()
    .prepare("UPDATE videos SET estado = ?, efeito = ?, efeitoId = ?, url = ?, custoCreditos = ?, externoId = ?, erro = ?, atualizadoEm = ? WHERE id = ?")
    .run(novo.estado, novo.efeito, novo.efeitoId ?? null, novo.url ?? null, novo.custoCreditos ?? null, novo.externoId ?? null, novo.erro ?? null, novo.atualizadoEm, id);
  return novo;
}

/** Marca como falha um vídeo parado há tempo demais (processo reiniciado no meio do envio, provedor que nunca terminou). */
function expirarSePreciso(v: Video): Video {
  if (videoTerminou(v)) return v;
  const idade = Date.now() - new Date(v.atualizadoEm).getTime();
  if (v.estado === "enviando" && idade > LIMITE_ENVIO_MS) return atualizar(v.id, { estado: "falhou", erro: "O envio da imagem não terminou. Tente gerar de novo." });
  if (v.estado !== "enviando" && idade > LIMITE_GERACAO_MS) return atualizar(v.id, { estado: "falhou", erro: "O Higgsfield não terminou o vídeo em 20 minutos. Tente gerar de novo." });
  return v;
}

// ---------------------------------------------------------------------------------------------------------
// Campanha e conceito
// ---------------------------------------------------------------------------------------------------------

export function obterCampanha(campanhaId: string): Campanha {
  const registro = obter<unknown, Campanha>(campanhaId);
  if (!registro || registro.tipo !== "campanha") throw new CampanhaNaoEncontrada("Campanha não encontrada. Crie os conceitos de novo.");
  return { ...registro.saida, id: registro.id };
}

/**
 * Anexa a imagem do produto a uma campanha já criada. Esquecer a imagem no briefing não pode obrigar a
 * recriar os conceitos: a tela mostra a área de envio junto do resultado e chama PATCH /api/conceitos/<id>,
 * que cai aqui. A imagem mora em `saida.briefing.imagemDataUrl`, o mesmo lugar de quem enviou antes.
 */
export function guardarImagemDaCampanha(campanhaId: string, imagemDataUrl: unknown): Campanha {
  const campanha = obterCampanha(campanhaId);
  const imagem = validarImagem(imagemDataUrl);
  if (!imagem.ok) throw new ErroDePedido(imagem.erro);
  if (videoEmAndamento()?.campanhaId === campanhaId) {
    throw new VideoEmAndamento("Espere o vídeo em andamento terminar para trocar a imagem do produto.");
  }
  const atualizada: Campanha = { ...campanha, briefing: { ...campanha.briefing, imagemDataUrl: imagemDataUrl as string } };
  atualizarSaida(campanhaId, atualizada);
  return atualizada;
}

/** Localiza a campanha que contém o conceito (varre as campanhas salvas; o conceito tem id único). */
export function campanhaDoConceito(conceitoId: string): { campanha: Campanha; conceito: Conceito } {
  for (const r of listarPorTipo<unknown, Campanha>("campanha", 500)) {
    const conceito = r.saida.conceitos?.find((c) => c.id === conceitoId);
    if (conceito) return { campanha: { ...r.saida, id: r.id }, conceito };
  }
  throw new CampanhaNaoEncontrada("Conceito não encontrado. Crie os conceitos de novo.");
}

function conceitoDa(campanha: Campanha, conceitoId: string): Conceito {
  const conceito = campanha.conceitos.find((c) => c.id === conceitoId);
  if (!conceito) throw new CampanhaNaoEncontrada("Esse conceito não pertence a esta campanha.");
  return conceito;
}

/** Descrição do vídeo enviada ao Higgsfield junto com a imagem e o efeito: produto, cenas e tom. */
export function montarPromptVideo(campanha: Campanha, conceito: Conceito): string {
  const b = campanha.briefing;
  return [
    `Vídeo publicitário curto de ${b.produto}${b.publico ? ` para ${b.publico}` : ""}.`,
    ...conceito.roteiro.map((c, i) => `Cena ${i + 1} (${c.segundos} s): ${c.cena} Texto na tela: "${c.textoNaTela}".`),
    `Chamada final: ${conceito.chamada}.`,
    b.tom ? `Tom: ${b.tom}.` : "",
    "Sem pessoas reais, sem marcas de terceiros; o produto da imagem é o protagonista.",
  ].filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------------------------------------
// Plano e geração
// ---------------------------------------------------------------------------------------------------------

type Pedido = { campanhaId: string; conceitoId: string; efeito?: string };

async function prepararPedido(pedido: Pedido): Promise<{ campanha: Campanha; conceito: Conceito; sessao: SessaoHiggsfield; efeitos: EfeitoRemoto[]; efeito: EfeitoRemoto }> {
  const campanha = obterCampanha(pedido.campanhaId);
  const conceito = conceitoDa(campanha, pedido.conceitoId);
  // Sem a imagem, a campanha continua valendo: a tela oferece a área de envio junto do resultado
  // (PATCH /api/conceitos/<id>), e ninguém precisa recriar os conceitos por causa disso.
  if (!campanha.briefing.imagemDataUrl) throw new ErroDePedido("Envie a imagem do produto no resultado desta campanha para gerar o vídeo.");
  if (!higgsfieldConfigurado()) throw new HiggsfieldNaoConectado("Conecte o Higgsfield em /setup antes de gerar o vídeo.");
  const sessao = await abrirSessao();
  const efeitos = await listarEfeitos(sessao);
  let efeito: EfeitoRemoto | undefined;
  if (pedido.efeito) {
    efeito = efeitoPorIdOuNome(pedido.efeito, efeitos);
    if (!efeito) throw new ErroDePedido(`O efeito "${pedido.efeito}" não existe no Higgsfield. Efeitos disponíveis: ${efeitos.slice(0, 15).map((e) => e.nome).join(", ")}${efeitos.length > 15 ? "..." : ""}.`);
  } else {
    efeito = mapearEfeito(conceito.efeitoSugerido, efeitos);
  }
  return { campanha, conceito, sessao, efeitos, efeito };
}

/** O que vai ser gerado e quanto custa, sem criar nada no Higgsfield. */
export async function planoVideo(pedido: Pedido): Promise<PlanoVideo> {
  const { campanha, conceito, sessao, efeitos, efeito } = await prepararPedido(pedido);
  const b = campanha.briefing;
  const [custo, saldo] = await Promise.all([
    custoVideo(sessao, { efeitoId: efeito.id, formato: b.formato, duracaoSeg: b.duracaoSeg, prompt: montarPromptVideo(campanha, conceito) }),
    saldoRemoto(sessao).catch(() => null),
  ]);
  return {
    campanhaId: campanha.id,
    conceitoId: conceito.id,
    conceitoTitulo: conceito.titulo,
    efeito,
    efeitos,
    formato: b.formato,
    duracaoSeg: b.duracaoSeg,
    custoCreditos: custo.creditos ?? null,
    motivoSemCusto: custo.motivo,
    saldo,
    emAndamento: videoEmAndamento() !== null,
    aviso: AVISO_CREDITOS,
  };
}

/**
 * Cria o registro do vídeo (estado "enviando") e dispara em segundo plano o envio da imagem e o pedido ao
 * Higgsfield; a tela acompanha por GET /api/videos/<id>. `origemPublica` (https://...) permite o caminho de
 * importação por endereço quando o servidor não aceita upload direto.
 */
export async function iniciarVideo(pedido: Pedido & { origemPublica?: string }): Promise<Video> {
  const { campanha, conceito, sessao, efeito } = await prepararPedido(pedido);
  const emAndamento = videoEmAndamento();
  if (emAndamento) throw new VideoEmAndamento("Já existe um vídeo sendo gerado. Espere ele terminar para gerar outro.");

  const agora = new Date().toISOString();
  const video: Video = {
    id: randomBytes(9).toString("base64url"),
    campanhaId: campanha.id,
    conceitoId: conceito.id,
    estado: "enviando",
    efeito: efeito.nome,
    efeitoId: efeito.id,
    formato: campanha.briefing.formato,
    duracaoSeg: campanha.briefing.duracaoSeg,
    criadoEm: agora,
    atualizadoEm: agora,
  };
  abrir()
    .prepare("INSERT INTO videos (id, campanhaId, conceitoId, estado, efeito, efeitoId, formato, duracaoSeg, criadoEm, atualizadoEm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(video.id, video.campanhaId, video.conceitoId, video.estado, video.efeito, video.efeitoId ?? null, video.formato, video.duracaoSeg, video.criadoEm, video.atualizadoEm);

  const urlPublica = pedido.origemPublica ? `${pedido.origemPublica.replace(/\/$/, "")}/api/videos/imagem/${campanha.id}` : undefined;
  void executarEnvio(video.id, sessao, campanha, conceito, efeito, urlPublica);
  return video;
}

/** Segundo plano: envia a imagem, cria o trabalho e passa o vídeo para "gerando"; qualquer erro vira "falhou" com o motivo. */
async function executarEnvio(videoId: string, sessao: SessaoHiggsfield, campanha: Campanha, conceito: Conceito, efeito: EfeitoRemoto, urlPublica?: string): Promise<void> {
  try {
    const imagemId = await enviarImagem(sessao, campanha.briefing.imagemDataUrl!, urlPublica);
    const { jobId, custo } = await gerarVideo(sessao, {
      imagemId,
      efeitoId: efeito.id,
      formato: campanha.briefing.formato,
      duracaoSeg: campanha.briefing.duracaoSeg,
      prompt: montarPromptVideo(campanha, conceito),
    });
    atualizar(videoId, { estado: "gerando", externoId: jobId, custoCreditos: custo });
  } catch (err) {
    console.error("Falha ao pedir o vídeo ao Higgsfield", err);
    const motivo = err instanceof ErroHiggsfield ? err.message : `Não foi possível pedir o vídeo: ${motivoEmPortugues(err instanceof Error ? err.message : "")}`;
    atualizar(videoId, { estado: "falhou", erro: motivo });
  }
}

/**
 * Estado atual do vídeo, consultando o Higgsfield quando ele ainda está gerando ou finalizando. Erros de
 * consulta não derrubam o vídeo: sobem como ErroHiggsfield para a tela avisar e continuar tentando.
 */
export async function atualizarEstado(id: string): Promise<Video> {
  const salvo = obterVideo(id);
  if (!salvo) throw new CampanhaNaoEncontrada("Vídeo não encontrado.");
  const video = expirarSePreciso(salvo);
  if (videoTerminou(video) || video.estado === "enviando" || !video.externoId) return video;

  const sessao = await abrirSessao();
  const remoto = await estadoRemoto(sessao, video.externoId);
  if (remoto.estado === "falhou") {
    return atualizar(id, { estado: "falhou", erro: `O Higgsfield não conseguiu gerar o vídeo: ${motivoEmPortugues(remoto.erro || "")}` });
  }
  if (remoto.estado === "pronto") {
    const url = remoto.url ?? (await urlDoResultado(sessao, video.externoId).catch(() => undefined));
    if (url) {
      const pronto = atualizar(id, { estado: "pronto", url });
      // A geração leva minutos: quem fechou a aba precisa saber por fora que acabou. Em segundo plano
      // (void) para a consulta de andamento não esperar pelo e-mail/Slack.
      void avisarVideoPronto(pronto);
      return pronto;
    }
    return video.estado === "finalizando" ? video : atualizar(id, { estado: "finalizando" });
  }
  return video;
}

/** Aviso de "o vídeo ficou pronto" pelo canal de /setup#notificacoes, com o link do resultado da campanha. */
async function avisarVideoPronto(video: Video): Promise<void> {
  let titulo = "O vídeo da campanha ficou pronto";
  try {
    titulo = `Vídeo pronto: ${obterCampanha(video.campanhaId).titulo}`;
  } catch {
    // Campanha apagada entre o pedido e a entrega: o aviso vale mesmo sem o título.
  }
  const base = enderecoPublico();
  await avisar({
    titulo,
    texto: `O vídeo com o efeito ${video.efeito} (${video.formato}, ${video.duracaoSeg} s) terminou de ser gerado. Abra a campanha para assistir e baixar o arquivo.`,
    link: base ? `${base.replace(/\/$/, "")}/r/${video.campanhaId}` : undefined,
  }).catch((err) => console.error("Falha ao avisar que o vídeo ficou pronto", err));
}

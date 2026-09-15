/** Proporção do vídeo: vertical (Reels, TikTok, Stories), horizontal (YouTube, LinkedIn) ou quadrado (feed). */
export type Formato = "9:16" | "16:9" | "1:1";
/** Duração do vídeo em segundos. */
export type Duracao = 5 | 10 | 15;
/** Objetivo da campanha, escolhido numa lista fixa. */
export type Objetivo = "lancamento" | "promocao" | "marca" | "evento";

/** O que o usuário descreve antes de pedir os conceitos. A imagem do produto vai como data URL (PNG ou JPG). */
export interface Briefing {
  produto: string;
  publico: string;
  objetivo: Objetivo;
  tom: string;
  formato: Formato;
  duracaoSeg: Duracao;
  imagemDataUrl?: string;
}

/** Uma cena do roteiro: o que aparece, por quantos segundos e o texto que entra na tela. */
export interface Cena {
  cena: string;
  segundos: number;
  textoNaTela: string;
}

/** Um dos três conceitos propostos para a campanha. */
export interface Conceito {
  id: string;
  titulo: string;
  roteiro: Cena[];
  efeitoSugerido: string;
  chamada: string;
  legenda: { instagram: string; linkedin: string; tiktok: string };
}

/** Etapas de um vídeo pedido ao Higgsfield: enviando a imagem, gerando, finalizando (pronto no provedor, buscando o arquivo), pronto ou falhou. */
export type EstadoVideo = "enviando" | "gerando" | "finalizando" | "pronto" | "falhou";

/** Um vídeo pedido ao provedor a partir de um conceito. Gravado em SQLite (lib/videos.ts). */
export interface Video {
  id: string;
  campanhaId: string;
  conceitoId: string;
  estado: EstadoVideo;
  /** Nome do efeito escolhido (da lista remota do Higgsfield). */
  efeito: string;
  /** Identificador do efeito no Higgsfield. */
  efeitoId?: string;
  formato: Formato;
  duracaoSeg: Duracao;
  url?: string;
  custoCreditos?: number;
  /** Identificador do trabalho no Higgsfield. */
  externoId?: string;
  /** Motivo da falha, em português, quando estado = "falhou". */
  erro?: string;
  criadoEm: string;
  atualizadoEm: string;
}

/** Um efeito da lista remota do Higgsfield (presets_show). */
export interface EfeitoRemoto {
  id: string;
  nome: string;
  descricao?: string;
  previewUrl?: string;
}

/** Créditos e plano da conta no Higgsfield. */
export interface Saldo {
  creditos: number;
  plano?: string;
}

/** O que a pessoa vê antes de confirmar a geração: efeito, formato, custo (quando o provedor informa) e saldo. */
export interface PlanoVideo {
  campanhaId: string;
  conceitoId: string;
  conceitoTitulo: string;
  efeito: EfeitoRemoto;
  efeitos: EfeitoRemoto[];
  formato: Formato;
  duracaoSeg: Duracao;
  custoCreditos: number | null;
  saldo: Saldo | null;
  /** Já existe um vídeo sendo gerado (um por vez). */
  emAndamento: boolean;
  aviso: string;
}

/** As etapas mostradas no acompanhamento, na ordem. */
export const ETAPAS_VIDEO: { estado: EstadoVideo; rotulo: string }[] = [
  { estado: "enviando", rotulo: "Enviando a imagem" },
  { estado: "gerando", rotulo: "Gerando o vídeo" },
  { estado: "finalizando", rotulo: "Finalizando" },
];

export function videoTerminou(v: Pick<Video, "estado">): boolean {
  return v.estado === "pronto" || v.estado === "falhou";
}

/** O resultado salvo no histórico (tipo "campanha"): o briefing e os três conceitos. */
export interface Campanha {
  id: string;
  titulo: string;
  briefing: Briefing;
  conceitos: Conceito[];
}

/** O que fica salvo como "entrada" no histórico: o briefing sem a imagem, mais o tamanho dela. */
export type EntradaCampanha = Omit<Briefing, "imagemDataUrl"> & { tamanhoImagem: number };

export const FORMATOS: { valor: Formato; rotulo: string }[] = [
  { valor: "9:16", rotulo: "Vertical 9:16 (Reels, TikTok, Stories)" },
  { valor: "16:9", rotulo: "Horizontal 16:9 (YouTube, LinkedIn)" },
  { valor: "1:1", rotulo: "Quadrado 1:1 (feed)" },
];

export const DURACOES: Duracao[] = [5, 10, 15];

export const OBJETIVOS: { valor: Objetivo; rotulo: string }[] = [
  { valor: "lancamento", rotulo: "Lançamento" },
  { valor: "promocao", rotulo: "Promoção" },
  { valor: "marca", rotulo: "Marca" },
  { valor: "evento", rotulo: "Evento" },
];

/** Efeitos que o storyboard sugere, em português. A lista remota do provedor substitui esta quando conectado. */
export const EFEITOS = ["Zoom dramático", "Giro do produto", "Explosão de partículas", "Câmera lenta", "Antes e depois"] as const;
export type Efeito = (typeof EFEITOS)[number];

export function rotuloObjetivo(objetivo: Objetivo): string {
  return OBJETIVOS.find((o) => o.valor === objetivo)?.rotulo ?? objetivo;
}

/** Nome curto da proporção, para subtítulos ("Vertical 9:16"). */
export function rotuloFormato(formato: Formato): string {
  return FORMATOS.find((f) => f.valor === formato)?.rotulo.replace(/\s*\(.*\)$/, "") ?? formato;
}

/** Valor da propriedade CSS aspect-ratio para o quadro do storyboard. */
export function proporcao(formato: Formato): string {
  return formato.replace(":", " / ");
}

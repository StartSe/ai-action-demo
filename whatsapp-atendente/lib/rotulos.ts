/**
 * Rótulos em português dos valores guardados no banco (canal da conversa, status e números internos).
 * Arquivo sem "use client" e sem node:sqlite: pode ser importado tanto por Client quanto por Server
 * Components. Ao somar um valor novo a `CanalOrigem` ou a `StatusConversa`, acrescente-o ao mapa daqui
 * — o `Record` completo faz o TypeScript cobrar o rótulo — em vez de escrever um ternário na tela.
 */
import { numero } from "./formato";
import { formatarTelefone } from "./telefone";
import type { CanalOrigem, Objetivo, Periodo, PeriodoMetricas, StatusConversa, Tom } from "./types";

const ROTULOS_ORIGEM: Record<CanalOrigem, string> = {
  simulador: "Simulador",
  whatsapp: "WhatsApp",
  mcp: "Assistente de IA",
  exemplo: "Exemplo",
};

export function rotuloOrigem(origem: CanalOrigem): string {
  return ROTULOS_ORIGEM[origem] ?? ROTULOS_ORIGEM.simulador;
}

const ROTULOS_STATUS: Record<StatusConversa, string> = {
  ia: "Atendida pela IA",
  atencao: "Precisa de atenção",
  humano: "Em atendimento humano",
  resolvida: "Resolvida",
};

export function rotuloStatus(status: StatusConversa): string {
  return ROTULOS_STATUS[status] ?? ROTULOS_STATUS.ia;
}

/** Os quatro status, na ordem do atendimento. */
export const STATUS: StatusConversa[] = ["ia", "atencao", "humano", "resolvida"];

/** O status escrito na barra de endereço; `undefined` (sem filtro) para ausente ou desconhecido. */
export function lerStatus(valor: string | null | undefined): StatusConversa | undefined {
  return STATUS.includes(valor as StatusConversa) ? (valor as StatusConversa) : undefined;
}

/** Classe do chip de cada status (globals.css). O azul de "Em atendimento humano" é próprio deste app. */
const CLASSES_STATUS: Record<StatusConversa, string> = {
  ia: "chip-positivo",
  atencao: "chip-media",
  humano: "chip-humano",
  resolvida: "chip-cinza",
};

export function classeStatus(status: StatusConversa): string {
  return CLASSES_STATUS[status] ?? CLASSES_STATUS.ia;
}

/** Os quatro períodos, na ordem em que aparecem no seletor; "7d" é o padrão das telas. */
export const PERIODOS: Periodo[] = ["hoje", "7d", "30d", "tudo"];

/** Anotado como `PeriodoMetricas` (o conjunto menor) para servir de padrão às duas leituras sem que
 * um dia o padrão da lista e o dos números possam divergir. Onde se espera `Periodo`, ele cabe. */
export const PERIODO_PADRAO: PeriodoMetricas = "7d";

const ROTULOS_PERIODO: Record<Periodo, string> = {
  hoje: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  tudo: "Tudo",
};

export function rotuloPeriodo(periodo: Periodo): string {
  return ROTULOS_PERIODO[periodo] ?? ROTULOS_PERIODO[PERIODO_PADRAO];
}

/** O período escrito na barra de endereço, já conferido; o padrão cobre ausente e desconhecido. */
export function lerPeriodo(valor: string | null | undefined): Periodo {
  return PERIODOS.includes(valor as Periodo) ? (valor as Periodo) : PERIODO_PADRAO;
}

/** Os três períodos dos números de Início e Relatórios, na ordem do seletor ("tudo" não entra: sem
 * período anterior de mesmo tamanho, não haveria com o que comparar — ver lib/metricas.ts). */
export const PERIODOS_METRICAS: PeriodoMetricas[] = ["hoje", "7d", "30d"];

/** O período dos números, vindo da barra de endereço; "tudo" e qualquer desconhecido caem no padrão. */
export function lerPeriodoMetricas(valor: string | null | undefined): PeriodoMetricas {
  return PERIODOS_METRICAS.includes(valor as PeriodoMetricas) ? (valor as PeriodoMetricas) : PERIODO_PADRAO;
}

/** "simulador"/"assistente-ia" são números fixos internos: nunca mostrar o valor cru em minúsculas. */
const NUMEROS_INTERNOS: Record<string, string> = {
  simulador: "Simulador",
  "assistente-ia": "Assistente de IA",
};

/** Nome do contato quando existir; senão o rótulo do número interno; senão o número formatado. */
export function rotuloContato(numero: string, nome?: string): string {
  if (nome?.trim()) return nome.trim();
  return rotuloNumero(numero);
}

export function rotuloNumero(numero: string): string {
  return NUMEROS_INTERNOS[numero] ?? formatarTelefone(numero);
}

/** `true` quando o "número" da conversa é um nome fixo interno (o celular de teste, o assistente de
 * IA) em vez de um telefone de verdade: quem mostra uma linha "Telefone" precisa saber a diferença. */
export function numeroInterno(numero: string): boolean {
  return numero in NUMEROS_INTERNOS;
}

/** Uma escolha do formulário do Assistente: o que o cartão diz em cima e a linha de apoio embaixo. */
export type Escolha = { titulo: string; apoio: string };

/** Os quatro objetivos, na ordem em que aparecem nos cartões de "O que ele deve fazer?". */
export const OBJETIVOS: Objetivo[] = ["atendimento", "vendas", "agendamentos", "outro"];

const ROTULOS_OBJETIVO: Record<Objetivo, Escolha> = {
  atendimento: { titulo: "Atendimento", apoio: "Tira dúvidas e informa" },
  vendas: { titulo: "Vendas", apoio: "Apresenta e ajuda a fechar" },
  agendamentos: { titulo: "Agendamentos", apoio: "Agenda conectada ou encaminhamento à equipe" },
  outro: { titulo: "Outro", apoio: "Você escreve o que ele faz" },
};

export function rotuloObjetivo(objetivo: Objetivo): Escolha {
  return ROTULOS_OBJETIVO[objetivo] ?? ROTULOS_OBJETIVO.atendimento;
}

/** Os três tons, na ordem em que aparecem nos cartões de "Tom de resposta". */
export const TONS: Tom[] = ["profissional", "amigavel", "personalizado"];

const ROTULOS_TOM: Record<Tom, Escolha> = {
  profissional: { titulo: "Profissional", apoio: "Clara e objetiva" },
  amigavel: { titulo: "Amigável", apoio: "Próxima e acolhedora" },
  personalizado: { titulo: "Personalizado", apoio: "Você define o estilo" },
};

export function rotuloTom(tom: Tom): Escolha {
  return ROTULOS_TOM[tom] ?? ROTULOS_TOM.profissional;
}

// --- Datas e durações como a tela de Início e a de Relatórios as escrevem ---------------------------
// Ficam aqui, e não em lib/formato.ts, porque lib/formato.ts é igual nos 17 apps da suíte: um texto
// próprio deste app não deve fazê-lo divergir (ver PADRAO.md, "Apps independentes").

/** "Quarta-feira, 17 de setembro" — a data por extenso do cabeçalho do Início, com a inicial maiúscula. */
export function dataPorExtenso(d: Date = new Date()): string {
  const texto = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(d);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "Bom dia" até o meio-dia, "Boa tarde" até as 18h, "Boa noite" depois. */
export function saudacao(d: Date = new Date()): string {
  const hora = d.getHours();
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

/** Quantos dias inteiros separam a data de hoje (0 = hoje, 1 = ontem), pela virada da meia-noite. */
function diasAtras(d: Date): number {
  const meiaNoite = (base: Date) => new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime();
  return Math.round((meiaNoite(new Date()) - meiaNoite(d)) / 86_400_000);
}

/**
 * Há quanto tempo foi, curto o bastante para uma coluna de tabela: "Agora", "Há 3 min", "Há 1 hora",
 * "Ontem", "Há 4 dias" e, mais para trás, a data. Os minutos vêm do relógio (uma mensagem das 23h50
 * lida às 0h10 é "Há 20 min", não "Ontem") e os dias, da virada da meia-noite.
 */
export function haQuantoTempo(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  const minutos = Math.floor((Date.now() - data.getTime()) / 60_000);
  if (minutos < 1) return "Agora";
  if (minutos < 60) return `Há ${minutos} min`;
  const dias = diasAtras(data);
  if (dias === 0) {
    const horas = Math.floor(minutos / 60);
    return `Há ${horas} ${horas === 1 ? "hora" : "horas"}`;
  }
  if (dias === 1) return "Ontem";
  if (dias < 7) return `Há ${dias} dias`;
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * Tempo médio de resposta como indicador: segundos até um minuto, minutos daí para cima. Sem nenhuma
 * resposta medida no período, o indicador mostra um travessão em vez de "0 s" — não houve resposta,
 * e não uma resposta instantânea.
 */
export function tempoDeResposta(ms: number): string {
  if (!ms || ms <= 0) return "—";
  const segundos = Math.round(ms / 1000);
  if (segundos < 60) return `${segundos} s`;
  const minutos = segundos / 60;
  return `${numero(minutos, minutos < 10 ? 1 : 0)} min`;
}

/** Hora quando a mensagem é de hoje, dia e mês quando é mais antiga: o formato de uma lista de
 * conversas (a lista de Conversas e o cartão "precisam de atenção" de Relatórios usam o mesmo). */
export function horaOuDia(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  const mesmoDia = data.toDateString() === new Date().toDateString();
  return mesmoDia
    ? data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// Um dia do gráfico de Relatórios chega como "AAAA-MM-DD" (lib/metricas.ts). Ele é lido pedaço a
// pedaço, e nunca por `new Date("2026-09-10")`: essa forma é interpretada como UTC e, no fuso do
// Brasil, voltaria o dia anterior — o eixo inteiro do gráfico sairia um dia atrasado.
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function diaParaData(dia: string): Date | null {
  const [ano, mes, numeroDoDia] = String(dia).split("-").map(Number);
  if (!ano || !mes || !numeroDoDia) return null;
  return new Date(ano, mes - 1, numeroDoDia);
}

/** "10 set": o rótulo de um dia no eixo do gráfico. */
export function diaAbreviado(dia: string): string {
  const data = diaParaData(dia);
  return data ? `${data.getDate()} ${MESES_CURTOS[data.getMonth()]}` : "";
}

/** "10 de setembro": o mesmo dia escrito por extenso, para a tabela que só o leitor de tela vê. */
export function diaLongo(dia: string): string {
  const data = diaParaData(dia);
  return data ? new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(data) : "";
}

/** Contra o que a comparação de cada indicador é feita, escrita por extenso (ver components/ui.tsx,
 * `Variacao`): o período anterior tem sempre o mesmo tamanho do escolhido (ver lib/metricas.ts). */
const CONTEXTO_COMPARACAO: Record<PeriodoMetricas, string> = {
  hoje: "em relação a ontem",
  "7d": "em relação aos 7 dias anteriores",
  "30d": "em relação aos 30 dias anteriores",
};

export function contextoComparacao(periodo: PeriodoMetricas): string {
  return CONTEXTO_COMPARACAO[periodo] ?? CONTEXTO_COMPARACAO[PERIODO_PADRAO];
}

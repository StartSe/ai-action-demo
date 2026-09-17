// Os assuntos que separam as conversas nos relatórios. A lista sai do objetivo escolhido em
// Configurações (lib/types.ts:Objetivo): quem usa o atendente para vender fala de pagamento e
// promoção, quem o usa para marcar horários fala de agendamento e remarcação, e os cinco assuntos
// comuns valem para todo mundo.
//
// Arquivo folha de propósito: só importa tipos, então tanto a tela (components/Relatorios.tsx) quanto
// as libs de banco (lib/metricas.ts) e a classificação (lib/atendente.ts) leem a mesma lista sem
// fechar ciclo de import. Quem classifica de verdade é lib/atendente.ts:classificarConversa (com IA)
// e lib/demo.ts:classificarLocal (sem IA).
import type { Objetivo } from "./types";

/** Onde caem as conversas que não se encaixam em nenhum outro assunto (e as ainda não classificadas). */
export const ASSUNTO_OUTROS = "Outros";

/** Os assuntos que todo negócio tem, na ordem em que a lista os oferece. */
const COMUNS = ["Preços", "Horário de atendimento", "Produtos e serviços", "Localização e contato", "Reclamações"];

/** O que cada objetivo acrescenta aos assuntos comuns; "atendimento" e "outro" não acrescentam nada. */
const EXTRAS: Partial<Record<Objetivo, string[]>> = {
  vendas: ["Formas de pagamento", "Promoções"],
  agendamentos: ["Agendamentos", "Remarcações"],
};

/** A lista de assuntos do objetivo escolhido, sempre terminando em "Outros". */
export function assuntosDoObjetivo(objetivo: Objetivo): string[] {
  return [...COMUNS, ...(EXTRAS[objetivo] ?? []), ASSUNTO_OUTROS];
}

/** Minúsculas e sem acento, para comparar textos escritos de jeitos diferentes. */
export function semAcento(texto: string): string {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * O assunto escrito pela IA conferido contra a lista: acento, maiúscula e espaço sobrando não
 * importam, mas um assunto inventado (ou vazio) vira "Outros". Sem isso, um relatório ganharia uma
 * barra nova a cada jeito diferente de escrever a mesma coisa.
 */
export function normalizarAssunto(bruto: string | null | undefined, objetivo: Objetivo): string {
  const escrito = semAcento(String(bruto ?? "").trim());
  if (!escrito) return ASSUNTO_OUTROS;
  return assuntosDoObjetivo(objetivo).find((a) => semAcento(a) === escrito) ?? ASSUNTO_OUTROS;
}

/**
 * O que uma resposta rápida sabe sobre si mesma, sem banco e sem rede: como o atalho é escrito, o que
 * torna um atalho inválido, como o texto vira a mensagem que vai para o campo e como a lista é
 * filtrada enquanto a pessoa digita.
 *
 * Arquivo FOLHA (só importa tipos), de propósito: a tela precisa das mesmas regras que a rota usa para
 * recusar um atalho, e um componente não pode importar `lib/respostas-rapidas.ts`, que abre o banco.
 * Mesmo desenho de `lib/transferencia.ts` com `lib/conversas.ts`.
 */
import { LIMITE_ATALHO, LIMITE_TEXTO_RAPIDO, MIN_ATALHO, type RespostaRapida } from "./types";

/**
 * O atalho como ele é gravado: sem a barra que a pessoa digita na frente, em minúsculas, sem acento e
 * com espaço virando hífen. Quem escreve "/Horário de Atendimento" grava `horario-de-atendimento` —
 * o atalho é para ser digitado depressa, não para ser bonito.
 */
export function normalizarAtalho(bruto: string): string {
  return bruto
    .trim()
    .replace(/^\/+/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** A frase de negócio que explica por que este atalho não serve, ou `null` quando ele serve. */
export function erroDeAtalho(atalho: string): string | null {
  if (atalho.length < MIN_ATALHO) return `O atalho precisa ter pelo menos ${MIN_ATALHO} letras.`;
  if (atalho.length > LIMITE_ATALHO) return `O atalho precisa caber em ${LIMITE_ATALHO} letras.`;
  if (!/^[a-z0-9-]+$/.test(atalho)) return "O atalho aceita só letras, números e hífen.";
  return null;
}

/** A frase de negócio que explica por que este texto não serve, ou `null` quando ele serve. */
export function erroDeTextoRapido(texto: string): string | null {
  if (!texto.trim()) return "Escreva o texto da resposta rápida.";
  if (texto.length > LIMITE_TEXTO_RAPIDO) return `A resposta rápida precisa caber em ${LIMITE_TEXTO_RAPIDO.toLocaleString("pt-BR")} caracteres.`;
  return null;
}

/**
 * Troca o que a resposta rápida deixou em aberto pelo que esta conversa tem: `{nome}` vira o nome do
 * contato (ou "você", quando ninguém sabe o nome dele ainda) e `{atendente}` vira o nome do atendente
 * da empresa. A troca acontece na INSERÇÃO, e não na gravação: a mesma resposta serve para todo mundo.
 */
export function aplicarVariaveis(texto: string, { nome, atendente }: { nome?: string; atendente?: string }): string {
  const quem = (nome || "").trim() || "você";
  const assina = (atendente || "").trim() || "nosso atendimento";
  return texto.replace(/\{nome\}/gi, quem).replace(/\{atendente\}/gi, assina);
}

/**
 * O que sobra da lista enquanto a pessoa digita depois da barra: casa pelo atalho e pelo texto, sem
 * acento e sem diferença de maiúsculas. Termo vazio devolve a lista inteira.
 */
export function filtrarRespostas(itens: RespostaRapida[], termo: string): RespostaRapida[] {
  const busca = semAcento(termo.trim());
  if (!busca) return itens;
  return itens.filter((r) => semAcento(r.atalho).includes(busca) || semAcento(r.texto).includes(busca));
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

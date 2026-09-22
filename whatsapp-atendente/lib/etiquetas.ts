/**
 * O que uma etiqueta sabe sobre si mesma, sem banco e sem rede: como o nome é escrito, o que torna um
 * nome inválido, qual é a próxima cor da paleta e qual classe desenha cada cor.
 *
 * Arquivo FOLHA (só importa tipos), de propósito: o painel do contato precisa das mesmas regras que a
 * rota usa para recusar um nome, e um componente não pode importar `lib/conversas.ts`, que abre o
 * banco. Mesmo desenho de `lib/atalhos.ts` com `lib/respostas-rapidas.ts`.
 *
 * Quem guarda a lista da instância e as etiquetas de cada conversa é `lib/conversas.ts` (a chave
 * `ETIQUETAS` e a coluna `conversas.etiquetas`): o dono do formato dos dados continua sendo um só.
 */
import { LIMITE_ETIQUETA, type CorEtiqueta, type Etiqueta } from "./types";

/** A paleta, na ordem em que as cores são distribuídas (as classes moram em app/globals.css). */
export const CORES_ETIQUETA: CorEtiqueta[] = ["azul", "verde", "ambar", "roxo", "rosa", "cinza"];

// A forma do chip mora em `.etiqueta` e só a cor muda de classe: as duas vão juntas no elemento, em
// vez de uma classe por cor com tudo dentro — em Tailwind 4, `@apply` não alcança classe de componente.
const CLASSES: Record<CorEtiqueta, string> = {
  azul: "etiqueta etiqueta-azul",
  verde: "etiqueta etiqueta-verde",
  ambar: "etiqueta etiqueta-ambar",
  roxo: "etiqueta etiqueta-roxo",
  rosa: "etiqueta etiqueta-rosa",
  cinza: "etiqueta etiqueta-cinza",
};

/** A classe do chip desta cor; uma cor desconhecida (registro antigo, valor editado à mão) cai na primeira. */
export function classeEtiqueta(cor: string): string {
  return CLASSES[cor as CorEtiqueta] ?? CLASSES.azul;
}

/**
 * O nome como ele é gravado: sem espaço nas pontas, sem espaço dobrado e em minúsculas. As etiquetas
 * são comparadas pelo nome gravado, então "Orçamento" e "orçamento" são a MESMA etiqueta — o acento
 * continua (é o nome que a equipe escreveu, não um atalho de teclado).
 */
export function normalizarEtiqueta(bruto: string): string {
  return bruto.trim().replace(/\s+/g, " ").toLowerCase();
}

/** A frase de negócio que explica por que este nome não serve, ou `null` quando ele serve. */
export function erroDeEtiqueta(nome: string): string | null {
  if (!nome) return "Escreva o nome da etiqueta.";
  if (nome.length > LIMITE_ETIQUETA) return `A etiqueta precisa caber em ${LIMITE_ETIQUETA} caracteres.`;
  // Vírgula e ponto e vírgula separam colunas na planilha exportada, e uma etiqueta com eles dentro
  // viraria duas lá — recusar aqui é mais honesto do que trocar o caractere nas costas de quem digitou.
  if (/[,;]/.test(nome)) return "A etiqueta não aceita vírgula nem ponto e vírgula.";
  return null;
}

/**
 * A cor que a próxima etiqueta recebe: a seguinte da paleta, contada a partir de quantas já existem.
 * Depois da sexta, as cores se repetem — o que separa as etiquetas é o nome, a cor só ajuda a achar.
 */
export function proximaCor(quantasJaExistem: number): CorEtiqueta {
  return CORES_ETIQUETA[quantasJaExistem % CORES_ETIQUETA.length]!;
}

/**
 * O que sobra da lista da instância enquanto a pessoa digita no campo "Adicionar etiqueta": as que
 * casam com o termo e ainda não estão nesta conversa. Termo vazio devolve as que faltam.
 */
export function sugerirEtiquetas(daEmpresa: Etiqueta[], jaNaConversa: string[], termo: string): Etiqueta[] {
  const busca = semAcento(normalizarEtiqueta(termo));
  return daEmpresa.filter((e) => !jaNaConversa.includes(e.nome) && (!busca || semAcento(e.nome).includes(busca)));
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

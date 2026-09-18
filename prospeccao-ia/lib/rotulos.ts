// Rótulos de valores guardados no banco, num Record completo (nunca um ternário na tela):
// somar um valor ao union vira erro de compilação aqui em vez de um rótulo faltando na tela.
import type { Jornada } from "./types";

export const ROTULO_JORNADA: Record<Jornada, string> = {
  b2b: "Empresas e decisores",
  b2c: "Pessoas/consumidores",
};

export const DESCRICAO_JORNADA: Record<Jornada, string> = {
  b2b: "Encontre empresas que combinam com seu perfil e as pessoas que decidem por elas.",
  b2c: "Encontre pessoas físicas por localização, interesses e sinais públicos.",
};

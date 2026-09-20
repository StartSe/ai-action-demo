export type ItemNavegacao = { rotulo: string; href: string };
export const NAVEGACAO: ItemNavegacao[] = [
  { rotulo: "Início", href: "/" },
  { rotulo: "Histórico", href: "/historico" },
  { rotulo: "Configurações", href: "/setup" },
];

export type Tela = "visao" | "assessments" | "oficina" | "inteligencia";
export function telaDoParametro(valor: string | string[] | undefined): Tela {
  return valor === "assessments" ||
    valor === "oficina" ||
    valor === "inteligencia"
    ? valor
    : "visao";
}

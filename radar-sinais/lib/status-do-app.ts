import { buscaWebConectada } from "./busca";
export function statusExtra(): Record<string, boolean> { return { buscaWeb: buscaWebConectada() }; }

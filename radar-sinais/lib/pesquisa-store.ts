import { atualizarPesquisa, obterRadar } from "./radares";
export function lerPesquisa(radarId?: string) { return obterRadar(radarId).pesquisa; }
export function salvarPesquisa(valor: unknown, radarId?: string) { return atualizarPesquisa(radarId, valor); }

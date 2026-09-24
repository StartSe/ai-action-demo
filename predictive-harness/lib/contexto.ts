import { AsyncLocalStorage } from "node:async_hooks";
export const contexto = new AsyncLocalStorage<{ id: string; fontes: string[] }>();
export const conversaAtual = () => contexto.getStore()?.id || "base";

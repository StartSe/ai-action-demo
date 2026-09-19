import { getConfig, setConfig } from "./store";
import { PESQUISA_PADRAO, validarPesquisa, type Pesquisa } from "./pesquisa";
export function lerPesquisa(): Pesquisa {
  const valor = getConfig("RADAR_PESQUISA");
  if (!valor) return { ...PESQUISA_PADRAO };
  return validarPesquisa(JSON.parse(valor));
}
export function salvarPesquisa(valor: unknown): Pesquisa {
  const pesquisa = validarPesquisa(valor);
  setConfig("RADAR_PESQUISA", JSON.stringify(pesquisa));
  return pesquisa;
}

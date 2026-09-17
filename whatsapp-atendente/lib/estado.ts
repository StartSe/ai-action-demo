// Configuração do negócio (nome, atendente, tom, horário, base de conhecimento, regra de fallback),
// persistida em SQLite em uma chave só, para sobreviver a reinícios. As conversas ficam em tabelas próprias (lib/conversas.ts).
import { configExemplo } from "./demo";
import { getConfig as getStoreConfig, setConfig as setStoreConfig } from "./store";
import type { Config } from "./types";

const CHAVE = "ATENDENTE_CONFIG";

export function getConfig(): Config {
  const bruto = getStoreConfig(CHAVE);
  if (!bruto) return { ...configExemplo };
  try {
    return { ...configExemplo, ...(JSON.parse(bruto) as Partial<Config>) };
  } catch (err) {
    console.error("Falha ao ler a configuração do negócio salva", err);
    return { ...configExemplo };
  }
}

export function setConfig(novo: Config): Config {
  setStoreConfig(CHAVE, JSON.stringify(novo));
  return novo;
}

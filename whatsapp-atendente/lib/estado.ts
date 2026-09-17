// Configuração do negócio (nome, atendente, objetivo, tom, horário, base de conhecimento, regra de fallback),
// persistida em SQLite em uma chave só, para sobreviver a reinícios. As conversas ficam em tabelas próprias (lib/conversas.ts).
import { configExemplo } from "./demo";
import { getConfig as getStoreConfig, setConfig as setStoreConfig } from "./store";
import type { Config, NaoSei, Objetivo, Tom } from "./types";

const CHAVE = "ATENDENTE_CONFIG";

const OBJETIVOS: Objetivo[] = ["atendimento", "vendas", "agendamentos", "outro"];
const TONS: Tom[] = ["profissional", "amigavel", "personalizado"];
const NAO_SEI: NaoSei[] = ["humano", "contato", "site"];

/** Tons antigos (até 17/09/2026) e o que cada um vira hoje. O "descontraído" não tem equivalente
 * entre os três tons novos, então ele vira "personalizado" com a mesma descrição que o prompt usava. */
const TOM_ANTIGO: Record<string, { tom: Tom; tomTexto?: string }> = {
  direto: { tom: "profissional" },
  cordial: { tom: "amigavel" },
  descontraido: { tom: "personalizado", tomTexto: "descontraído e simpático, próximo, mas sempre profissional" },
};

/**
 * Lê uma configuração salva em qualquer versão do formato e devolve uma válida: tom antigo traduzido,
 * objetivo ausente como "atendimento" e os textos livres presentes só no valor que os usa. Nenhum
 * registro antigo quebra — o que não for reconhecido cai no valor padrão.
 */
export function migrarConfig(salvo: Partial<Config> & { tom?: string }): Config {
  const base = { ...configExemplo, ...salvo } as Config;
  const antigo = typeof salvo.tom === "string" ? TOM_ANTIGO[salvo.tom] : undefined;
  const tom = antigo ? antigo.tom : TONS.includes(base.tom) ? base.tom : "profissional";
  const tomTexto = tom === "personalizado" ? String(antigo?.tomTexto ?? base.tomTexto ?? "").trim() : "";
  const objetivo = OBJETIVOS.includes(base.objetivo) ? base.objetivo : "atendimento";
  const objetivoTexto = objetivo === "outro" ? String(base.objetivoTexto ?? "").trim() : "";
  return {
    negocio: base.negocio,
    atendente: base.atendente,
    objetivo,
    ...(objetivoTexto ? { objetivoTexto } : {}),
    tom,
    ...(tomTexto ? { tomTexto } : {}),
    horario: base.horario,
    baseConhecimento: base.baseConhecimento,
    naoSei: NAO_SEI.includes(base.naoSei) ? base.naoSei : "humano",
  };
}

/**
 * Já existe uma configuração salva por alguém? `getConfig()` nunca devolve vazio (sem nada salvo ele cai
 * na empresa de exemplo, que é o que faz o app abrir cheio na demonstração), então quem precisa
 * distinguir "ainda não configurou" de "configurou assim" pergunta aqui — hoje o passo 1 do Assistente,
 * que abre com o modelo da base em vez do exemplo.
 */
export function temConfigSalva(): boolean {
  return Boolean(getStoreConfig(CHAVE));
}

export function getConfig(): Config {
  const bruto = getStoreConfig(CHAVE);
  if (!bruto) return { ...configExemplo };
  try {
    return migrarConfig(JSON.parse(bruto) as Partial<Config>);
  } catch (err) {
    console.error("Falha ao ler a configuração do negócio salva", err);
    return { ...configExemplo };
  }
}

export function setConfig(novo: Config): Config {
  setStoreConfig(CHAVE, JSON.stringify(novo));
  return novo;
}

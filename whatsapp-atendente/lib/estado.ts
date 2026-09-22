// Configuração do negócio (nome, atendente, objetivo, tom, horário, base de conhecimento, regra de fallback),
// persistida em SQLite em uma chave só, para sobreviver a reinícios. As conversas ficam em tabelas próprias (lib/conversas.ts).
import { configExemplo } from "./demo";
import { lerAvisoEspera } from "./espera";
import { getConfig as getStoreConfig, setConfig as setStoreConfig } from "./store";
import { FERRAMENTAS_PADRAO, LIMITE_PERGUNTA, LIMITE_SAUDACAO, MAX_PERGUNTAS, MIDIA_PADRAO, type Config, type ConfigFerramentas, type ConfigMidia, type NaoSei, type Objetivo, type Tom } from "./types";

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
  const fraseFalha = String(base.fraseFalha ?? "").trim();
  const fraseSemMidia = String(base.fraseSemMidia ?? "").trim();
  // Saudação e perguntas de teste são lidas do REGISTRO SALVO, não do `base` (que herda da empresa de
  // exemplo): uma configuração gravada antes da 0.3.0 não tem as duas, e herdá-las faria o atendente de
  // outra empresa se apresentar como a clínica de demonstração. Ausentes continuam ausentes.
  const saudacao = String(salvo.saudacao ?? "").trim().slice(0, LIMITE_SAUDACAO);
  const perguntas = lerPerguntas(salvo.perguntasSugeridas);
  return {
    negocio: base.negocio,
    atendente: base.atendente,
    objetivo,
    ...(objetivoTexto ? { objetivoTexto } : {}),
    tom,
    ...(tomTexto ? { tomTexto } : {}),
    ...(saudacao ? { saudacao } : {}),
    ...(perguntas.length ? { perguntasSugeridas: perguntas } : {}),
    horario: base.horario,
    baseConhecimento: base.baseConhecimento,
    naoSei: NAO_SEI.includes(base.naoSei) ? base.naoSei : "humano",
    ...(fraseFalha ? { fraseFalha } : {}),
    midia: lerMidia(base.midia),
    ferramentas: lerFerramentas(base.ferramentas),
    avisoEsperaMin: lerAvisoEspera(base.avisoEsperaMin),
    ...(fraseSemMidia ? { fraseSemMidia } : {}),
  };
}

/** Uma lista salva torta (não é array, tem número no meio, tem item vazio ou tem item longo demais) não
 * pode impedir a configuração inteira de abrir: o que não serve sai, o que sobra é cortado no teto. */
function lerPerguntas(salvo: unknown): string[] {
  if (!Array.isArray(salvo)) return [];
  return salvo
    .map((p) => String(p ?? "").trim().slice(0, LIMITE_PERGUNTA))
    .filter(Boolean)
    .slice(0, MAX_PERGUNTAS);
}

/** Configuração antiga (sem o campo) e valor malformado caem no padrão: o atendente usa o que já
 * estiver conectado e não pede dados do cliente por conta própria. */
function lerFerramentas(salvo: Partial<ConfigFerramentas> | undefined): ConfigFerramentas {
  if (!salvo || typeof salvo !== "object") return { ...FERRAMENTAS_PADRAO };
  return {
    coletarContato: typeof salvo.coletarContato === "boolean" ? salvo.coletarContato : FERRAMENTAS_PADRAO.coletarContato,
    agenda: typeof salvo.agenda === "boolean" ? salvo.agenda : FERRAMENTAS_PADRAO.agenda,
    sistemas: typeof salvo.sistemas === "boolean" ? salvo.sistemas : FERRAMENTAS_PADRAO.sistemas,
  };
}

/** Configuração antiga (sem o campo) e valor malformado caem no padrão: o atendente entende tudo. */
function lerMidia(salvo: Partial<ConfigMidia> | undefined): ConfigMidia {
  if (!salvo || typeof salvo !== "object") return { ...MIDIA_PADRAO };
  return {
    audio: typeof salvo.audio === "boolean" ? salvo.audio : MIDIA_PADRAO.audio,
    imagem: typeof salvo.imagem === "boolean" ? salvo.imagem : MIDIA_PADRAO.imagem,
    documento: typeof salvo.documento === "boolean" ? salvo.documento : MIDIA_PADRAO.documento,
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

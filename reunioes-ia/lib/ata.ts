// Geração da ata (IA real ou fallback de demonstração), reaproveitada por app/api/ata/route.ts e lib/ferramentas.ts (MCP).
import { aiEnabled, askJSON, meta } from "./ai";
import { ataDemo, esperar } from "./demo";
import type { Ata } from "./types";

const SYSTEM = `Você é um assistente executivo que transforma transcrições de reuniões em atas objetivas e acionáveis para lideranças brasileiras.
Regras:
- Escreva em português do Brasil, direto, sem jargão corporativo.
- "resumo_executivo" deve ter no máximo 4 frases.
- Toda ação precisa de um responsável (use nomes citados na transcrição ou nos participantes informados; se realmente não houver como identificar, use "a definir") e um prazo no formato AAAA-MM-DD (data completa, com ano, mês e dia — nunca só um dia da semana ou algo vago como "fim do mês"). Use a data da reunião informada no prompt como referência para calcular prazos relativos ditos na reunião (ex.: "sexta-feira", "dia 18", "daqui a duas semanas" contam a partir da data da reunião, não de hoje); se não houver como inferir um prazo da transcrição, estime uma data razoável em até 30 dias a partir da data da reunião.
- Liste em "decisoes", "acoes", "riscos_e_bloqueios" e "pendencias" apenas o que de fato aparece ou pode ser inferido com segurança da transcrição. Não invente números, nomes ou compromissos que não estejam no texto.
- "riscos_e_bloqueios" e "pendencias" são listas de frases curtas (podem ser listas vazias se não houver nada relevante).
- "proximos_passos" é um parágrafo curto, não uma lista.
- O e-mail de acompanhamento deve ser curto, objetivo, em tom profissional, recapitulando decisões e ações com responsáveis e prazos (prazos no formato dd/mm/aaaa).
Formato de saída (JSON):
{
  "titulo": "título curto da reunião",
  "resumo_executivo": "",
  "decisoes": [{"decisao": "", "contexto": ""}],
  "acoes": [{"acao": "", "responsavel": "", "prazo": "AAAA-MM-DD"}],
  "riscos_e_bloqueios": [""],
  "pendencias": [""],
  "proximos_passos": "",
  "email_followup": {"assunto": "", "corpo": ""}
}`;

export interface DadosGeracao {
  transcricao: string;
  titulo?: string;
  /** "AAAA-MM-DD"; referência dos prazos relativos. Sem ela, vale a data de hoje. */
  dataReuniao?: string;
  participantes?: string;
  contexto?: string;
}

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

/** "AAAA-MM-DD" de hoje no fuso local do servidor (nunca `toISOString()`, que é UTC e pode virar o dia). */
export function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function gerarAta({ transcricao, titulo, dataReuniao, participantes, contexto }: DadosGeracao): Promise<{ demo: boolean; ata: Ata; meta: ReturnType<typeof meta> }> {
  const insumo = "transcrição da reunião e contexto informado";
  const referencia = dataReuniao && DATA_VALIDA.test(dataReuniao) ? dataReuniao : hojeLocal();
  if (!aiEnabled()) {
    await esperar(1300);
    return { demo: true, ata: ataDemo({ titulo, dataReuniao: referencia }), meta: meta({ demo: true, insumo }) };
  }
  const prompt = `Data da reunião (referência para prazos relativos): ${referencia}\nData de hoje: ${hojeLocal()}\nTítulo informado: ${titulo || "não informado"}\nParticipantes informados: ${participantes || "não informados"}\nContexto adicional: ${contexto || "não informado"}\n\nTranscrição da reunião:\n${transcricao}`;
  const ata = await askJSON<Ata>({ system: SYSTEM, prompt, maxTokens: 4000 });
  return { demo: false, ata, meta: meta({ demo: false, insumo }) };
}

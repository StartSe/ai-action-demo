import { aiEnabled, askJSON, meta } from "@/lib/ai";
import { ataDemo, esperar } from "@/lib/demo";
import { apagarTodos, listar, salvar } from "@/lib/historico";
import type { Ata, FonteTranscricao } from "@/lib/types";

const SYSTEM = `Você é um assistente executivo que transforma transcrições de reuniões em atas objetivas e acionáveis para lideranças brasileiras.
Regras:
- Escreva em português do Brasil, direto, sem jargão corporativo.
- "resumo_executivo" deve ter no máximo 4 frases.
- Toda ação precisa de um responsável (use nomes citados na transcrição ou nos participantes informados; se realmente não houver como identificar, use "a definir") e um prazo no formato AAAA-MM-DD (data completa, com ano, mês e dia — nunca só um dia da semana ou algo vago como "fim do mês"). Use a data de hoje informada no prompt como referência para calcular prazos relativos (ex.: "sexta-feira", "daqui a duas semanas"); se não houver como inferir um prazo da transcrição, estime uma data razoável em até 30 dias a partir de hoje.
- Liste em "decisoes", "acoes", "riscos_e_bloqueios" e "pendencias" apenas o que de fato aparece ou pode ser inferido com segurança da transcrição. Não invente números, nomes ou compromissos que não estejam no texto.
- "riscos_e_bloqueios" e "pendencias" são listas de frases curtas (podem ser listas vazias se não houver nada relevante).
- "proximos_passos" é um parágrafo curto, não uma lista.
- O e-mail de acompanhamento deve ser curto, objetivo, em tom profissional, recapitulando decisões e ações com responsáveis e prazos.
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

interface Payload {
  transcricao?: string;
  titulo?: string;
  participantes?: string;
  contexto?: string;
  fonteTranscricao?: FonteTranscricao | null;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Payload;
  const { transcricao, titulo, participantes, contexto, fonteTranscricao } = body;
  if (!transcricao || !String(transcricao).trim()) {
    return Response.json({ error: "Cole, envie ou grave uma transcrição antes de gerar a ata." }, { status: 400 });
  }
  const entrada = { titulo: titulo || "", participantes: participantes || "", contexto: contexto || "", transcricao, fonteTranscricao: fonteTranscricao ?? null };
  try {
    const insumo = "toda a transcrição da reunião e o contexto informado";
    if (!aiEnabled()) {
      await esperar(1300);
      const ata = ataDemo({ titulo });
      const metaGerada = meta({ demo: true, insumo });
      const id = salvar({ tipo: "ata", titulo: ata.titulo || titulo || "Ata da reunião", entrada, saida: ata, meta: metaGerada });
      return Response.json({ ata, meta: metaGerada, id });
    }
    const prompt = `Data de hoje: ${new Date().toISOString().slice(0, 10)}\nTítulo informado: ${titulo || "não informado"}\nParticipantes informados: ${participantes || "não informados"}\nContexto adicional: ${contexto || "não informado"}\n\nTranscrição da reunião:\n${transcricao}`;
    const ata = await askJSON<Ata>({ system: SYSTEM, prompt, maxTokens: 4000 });
    const metaGerada = meta({ demo: false, insumo });
    const id = salvar({ tipo: "ata", titulo: ata.titulo || titulo || "Ata da reunião", entrada, saida: ata, meta: metaGerada });
    return Response.json({ ata, meta: metaGerada, id });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível gerar a ata agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}

/** Últimos resultados salvos, para a lista "Últimos resultados" no painel. */
export async function GET() {
  return Response.json({ itens: listar(10) });
}

/** Apaga todo o histórico salvo (botão "Apagar tudo"). */
export async function DELETE() {
  apagarTodos();
  return Response.json({ ok: true });
}

import { aiEnabled, askJSON } from "@/lib/ai";
import { ataDemo, esperar } from "@/lib/demo";
import type { Ata } from "@/lib/types";

const SYSTEM = `Você é um assistente executivo que transforma transcrições de reuniões em atas objetivas e acionáveis para lideranças brasileiras.
Regras:
- Escreva em português do Brasil, direto, sem jargão corporativo.
- "resumo_executivo" deve ter no máximo 4 frases.
- Toda ação precisa de um responsável (use nomes citados na transcrição ou nos participantes informados; se realmente não houver como identificar, use "a definir") e um prazo (data, dia da semana ou prazo relativo mencionado ou inferido com segurança).
- Liste em "decisoes", "acoes", "riscos_e_bloqueios" e "pendencias" apenas o que de fato aparece ou pode ser inferido com segurança da transcrição. Não invente números, nomes ou compromissos que não estejam no texto.
- "riscos_e_bloqueios" e "pendencias" são listas de frases curtas (podem ser listas vazias se não houver nada relevante).
- "proximos_passos" é um parágrafo curto, não uma lista.
- O e-mail de acompanhamento deve ser curto, objetivo, em tom profissional, recapitulando decisões e ações com responsáveis e prazos.
Formato de saída (JSON):
{
  "titulo": "título curto da reunião",
  "resumo_executivo": "",
  "decisoes": [{"decisao": "", "contexto": ""}],
  "acoes": [{"acao": "", "responsavel": "", "prazo": ""}],
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
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Payload;
  const { transcricao, titulo, participantes, contexto } = body;
  if (!transcricao || !String(transcricao).trim()) {
    return Response.json({ error: "Cole, envie ou grave uma transcrição antes de gerar a ata." }, { status: 400 });
  }
  try {
    if (!aiEnabled()) {
      await esperar(1300);
      return Response.json({ demo: true, ata: ataDemo({ titulo }) });
    }
    const prompt = `Título informado: ${titulo || "não informado"}\nParticipantes informados: ${participantes || "não informados"}\nContexto adicional: ${contexto || "não informado"}\n\nTranscrição da reunião:\n${transcricao}`;
    const ata = await askJSON<Ata>({ system: SYSTEM, prompt, maxTokens: 4000 });
    return Response.json({ demo: false, ata });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível gerar a ata agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}

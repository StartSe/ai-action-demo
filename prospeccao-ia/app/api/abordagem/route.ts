import { aiEnabled, askJSON, meta } from "@/lib/ai";
import { abordagemDemo, esperar } from "@/lib/demo";
import { getConfig } from "@/lib/store";
import type { Abordagem, Lead } from "@/lib/types";

function brightdataEnabled() {
  return Boolean(getConfig("BRIGHTDATA_API_KEY") && getConfig("BRIGHTDATA_ZONE"));
}

// Busca o texto do site do lead via Bright Data (Web Unlocker) para dar contexto extra à abordagem.
// Falha silenciosamente (retorna string vazia): enriquecimento é opcional e não deve travar a geração da abordagem.
async function enriquecerSite(url: string) {
  try {
    const r = await fetch("https://api.brightdata.com/request", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getConfig("BRIGHTDATA_API_KEY")}` },
      body: JSON.stringify({ zone: getConfig("BRIGHTDATA_ZONE"), url, format: "raw" }),
    });
    if (!r.ok) {
      console.error("Bright Data", r.status);
      return "";
    }
    const html = await r.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000);
  } catch (err) {
    console.error("Bright Data", err instanceof Error ? err.message : err);
    return "";
  }
}

const SYSTEM_ABORDAGEM = `Você é um SDR sênior que escreve as primeiras abordagens de prospecção B2B para vendedores de empresas brasileiras.
Sua tarefa é escrever uma abordagem personalizada para UM lead específico, a partir do que a empresa do usuário vende e do sinal (fato ou hipótese) sobre o lead ou a empresa dele.
Regras:
- Português do Brasil, direto, sem clichê de vendas ("prezado", "venho por meio desta", "solução inovadora"). Frases curtas.
- Use o sinal informado como gancho real da abertura. Não invente fatos que não constem no sinal ou no contexto do site, quando houver.
- O e-mail tem no máximo 2 parágrafos curtos além da saudação e do fechamento, e termina com um pedido claro (uma pergunta ou uma sugestão de horário).
- A mensagem de LinkedIn tem no máximo 300 caracteres (contando espaços).
- A mensagem de WhatsApp é curta (2 a 4 frases), informal mas profissional, sem emojis em excesso (no máximo 1).
- "proximo_passo" é uma orientação prática de 1 a 2 frases sobre a sequência de contato (quando usar cada canal e o que fazer se não houver resposta).
- Não assine com nome de pessoa nem de empresa do remetente; use os marcadores [seu nome] e [sua empresa].
Formato de saída (JSON):
{
  "gancho": "1 frase que resume por que vale abordar este lead agora",
  "email": {"assunto": "", "corpo": ""},
  "linkedin": "até 300 caracteres",
  "whatsapp": "",
  "proximo_passo": ""
}`;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const lead: Partial<Lead> = body?.lead || {};
  const proposta = String(body?.proposta || "").trim();
  const segmento = String(body?.segmento || "").trim();

  if (!lead?.nome || !lead?.empresa) {
    return Response.json({ error: "Selecione um lead para escrever a abordagem." }, { status: 400 });
  }
  if (!proposta) {
    return Response.json({ error: "Descreva o que sua empresa vende e para quem." }, { status: 400 });
  }

  const insumo = "dados do lead e a proposta enviada";

  try {
    if (!aiEnabled()) {
      await esperar(1100);
      return Response.json({ demo: true, abordagem: abordagemDemo({ lead, proposta, segmento }), meta: meta({ demo: true, insumo }) });
    }
    let contexto = "";
    if (brightdataEnabled() && lead.site) {
      contexto = await enriquecerSite(lead.site);
    }
    const prompt = `Lead:
Nome: ${lead.nome}
Cargo: ${lead.cargo || "não informado"}
Empresa: ${lead.empresa}
Setor: ${lead.setor || segmento || "não informado"}
Porte: ${lead.porte || "não informado"}
Cidade: ${lead.cidade || "não informada"}
Sinal sobre o lead ou a empresa: ${lead.sinal || "não informado"}

O que a empresa do usuário vende e para quem:
${proposta}

Segmento-alvo desta prospecção: ${segmento || "não informado"}${
      contexto ? `\n\nTrecho do site da empresa do lead (contexto adicional; use só o que for relevante):\n"""\n${contexto}\n"""` : ""
    }`;
    const abordagem = await askJSON<Abordagem>({ system: SYSTEM_ABORDAGEM, prompt, maxTokens: 2000 });
    return Response.json({ demo: false, abordagem, meta: meta({ demo: false, insumo }) });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível montar a abordagem agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}

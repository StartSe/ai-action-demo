// Geração de abordagens personalizadas (e-mail, LinkedIn, WhatsApp) para um lead, reaproveitada por
// app/api/abordagem/route.ts e lib/ferramentas.ts (MCP).
import { aiEnabled, askJSON, meta } from "./ai";
import { abordagemDemo, esperar } from "./demo";
import { getConfig } from "./store";
import type { Abordagem, Lead } from "./types";

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
- Escreva um gancho de abertura diferente para o e-mail, para o LinkedIn e para o WhatsApp: mesma informação (o sinal do lead), texto diferente em cada canal. Nunca repita a mesma frase nos três.
- Reescreva o que o usuário vende com suas próprias palavras, adaptado ao tom de cada canal. Nunca cole o texto da proposta do usuário literalmente.
- Assine o e-mail com o nome e a empresa do remetente informados abaixo; se nenhum dos dois for informado, assine apenas "Equipe comercial". No WhatsApp, se souber o nome ou a empresa do remetente, apresente-se com eles ("Aqui é [nome], da [empresa]"); senão, não se apresente. Nunca use os marcadores [seu nome] ou [sua empresa].
Formato de saída (JSON):
{
  "gancho": "1 frase que resume por que vale abordar este lead agora",
  "email": {"assunto": "", "corpo": ""},
  "linkedin": "até 300 caracteres",
  "whatsapp": "",
  "proximo_passo": ""
}`;

export async function escreverAbordagem({
  lead,
  proposta,
  segmento = "",
  remetenteNome = "",
  remetenteEmpresa = "",
}: {
  lead: Partial<Lead>;
  proposta: string;
  segmento?: string;
  remetenteNome?: string;
  remetenteEmpresa?: string;
}): Promise<{ demo: boolean; abordagem: Abordagem; meta: ReturnType<typeof meta> }> {
  const insumo = "dados do lead e a proposta enviada";

  if (!aiEnabled()) {
    await esperar(1100);
    return {
      demo: true,
      abordagem: abordagemDemo({ lead, proposta, segmento, remetenteNome, remetenteEmpresa }),
      meta: meta({ demo: true, insumo }),
    };
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

Segmento-alvo desta prospecção: ${segmento || "não informado"}
Remetente: ${remetenteNome || "não informado"}${remetenteEmpresa ? `, da empresa ${remetenteEmpresa}` : ""}${
    contexto ? `\n\nTrecho do site da empresa do lead (contexto adicional; use só o que for relevante):\n"""\n${contexto}\n"""` : ""
  }`;
  const abordagem = await askJSON<Abordagem>({ system: SYSTEM_ABORDAGEM, prompt, maxTokens: 2000 });
  return { demo: false, abordagem, meta: meta({ demo: false, insumo }) };
}

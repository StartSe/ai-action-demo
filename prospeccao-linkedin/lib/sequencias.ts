// Escrita da sequência de mensagens (conexão, dois acompanhamentos e e-mail) para um lead,
// compartilhada entre app/api/sequencias/route.ts e lib/ferramentas.ts (MCP).
import { aiEnabled, askJSON, meta, type Meta } from "./ai";
import { esperar, limitarConexao, sequenciaDemo } from "./demo";
import { ErroDePedido, INSUMO, obterCampanha, salvarCampanha } from "./leads";
import { LIMITE_CONEXAO, TONS, type Campanha, type Lead, type Perfil, type Sequencia } from "./types";

/** Quantos leads uma única chamada pode escrever de uma vez (cada um é uma chamada ao modelo). */
export const MAXIMO_POR_CHAMADA = 20;

const SYSTEM_SEQUENCIA = `Você é um SDR sênior especializado em prospecção pelo LinkedIn para vendedores de empresas brasileiras.
Sua tarefa é escrever a sequência de mensagens para UM lead específico, a partir da proposta da empresa do usuário e do sinal de intenção observado sobre o lead.
A sequência tem quatro peças:
1. "conexao": o pedido de conexão no LinkedIn, com NO MÁXIMO ${LIMITE_CONEXAO} caracteres contando espaços. Curto, específico, sem pedir reunião ainda.
2. "acompanhamento1": a primeira mensagem depois de a conexão ser aceita. Apresenta a proposta em uma frase e termina com uma pergunta ou sugestão de horário.
3. "acompanhamento2": a segunda mensagem, alguns dias depois, sem resposta. Educada, dá uma saída fácil e oferece algo concreto (um resumo, um caso).
4. "email": um e-mail opcional (assunto e corpo, no máximo 2 parágrafos curtos além da saudação e do fechamento) para quem preferir esse canal.
Regras:
- Português do Brasil, frases curtas, sem clichê de vendas ("prezado", "venho por meio desta", "solução inovadora").
- Use o sinal informado como gancho real. Escreva um gancho DIFERENTE em cada uma das quatro peças: mesma informação, texto diferente. Nunca repita a mesma frase de abertura.
- Reescreva a proposta do usuário com suas palavras, adaptada ao tom pedido. Nunca cole o texto da proposta literalmente.
- NUNCA use placeholders entre colchetes ou chaves, como [nome], [sua empresa] ou {cargo}. Tudo o que você não sabe, omita: se o nome do remetente não for informado, não se apresente; se a empresa do remetente não for informada, não a cite; assine o e-mail com o que houver ou apenas "Equipe comercial".
- Não invente fatos sobre o lead além do sinal informado.
Formato de saída (JSON):
{
  "conexao": "até ${LIMITE_CONEXAO} caracteres",
  "acompanhamento1": "",
  "acompanhamento2": "",
  "email": {"assunto": "", "corpo": ""}
}`;

const PLACEHOLDER = /[\[{][^\]}]{1,60}[\]}]/;

function temPlaceholder(s: Sequencia) {
  return [s.conexao, s.acompanhamento1, s.acompanhamento2, s.email?.assunto ?? "", s.email?.corpo ?? ""].some((t) => PLACEHOLDER.test(t));
}

function normalizar(bruto: Partial<Sequencia> & { email?: Partial<Sequencia["email"]> }, leadId: string): Sequencia {
  const texto = (v: unknown) => String(v ?? "").trim();
  const email = bruto.email && (texto(bruto.email.assunto) || texto(bruto.email.corpo)) ? { assunto: texto(bruto.email.assunto), corpo: texto(bruto.email.corpo) } : undefined;
  const seq: Sequencia = { leadId, conexao: limitarConexao(texto(bruto.conexao)), acompanhamento1: texto(bruto.acompanhamento1), acompanhamento2: texto(bruto.acompanhamento2) };
  if (email) seq.email = email;
  if (!seq.conexao || !seq.acompanhamento1 || !seq.acompanhamento2) throw new Error("A IA não devolveu as três mensagens. Tente novamente.");
  return seq;
}

function promptPara(lead: Lead, perfil: Perfil) {
  const tom = TONS.find((t) => t.valor === perfil.tom)?.rotulo ?? "Consultivo";
  const { nome, empresa } = perfil.remetente;
  return `Lead:
Nome: ${lead.nome}
Cargo: ${lead.cargo || "não informado"}
Empresa: ${lead.empresa}
Setor: ${lead.setor || "não informado"}
Sinal de intenção observado: ${lead.sinal || "não informado"}

Proposta da empresa do usuário (em uma frase): ${perfil.proposta}
Tom pedido: ${tom}
Remetente: ${nome || "não informado"}${empresa ? `, da empresa ${empresa}` : ""}`;
}

/** Escreve a sequência para um lead. Sem chave de IA, devolve a sequência de exemplo rotulada como demonstração. */
export async function escreverSequencia(lead: Lead, perfil: Perfil): Promise<{ demo: boolean; sequencia: Sequencia; meta: Meta }> {
  if (!aiEnabled()) {
    await esperar(700);
    return { demo: true, sequencia: sequenciaDemo(lead, perfil), meta: meta({ demo: true, insumo: INSUMO }) };
  }
  const prompt = promptPara(lead, perfil);
  let sequencia = normalizar(await askJSON<Sequencia>({ system: SYSTEM_SEQUENCIA, prompt, maxTokens: 1800 }), lead.id);
  if (temPlaceholder(sequencia)) {
    // Uma segunda tentativa com a correção explícita; se ainda vier marcador, segue assim mesmo (a pessoa revisa antes de enviar).
    const correcao = `${prompt}\n\nA resposta anterior continha marcadores entre colchetes ou chaves. Reescreva omitindo o que não sabe, sem nenhum marcador.`;
    sequencia = normalizar(await askJSON<Sequencia>({ system: SYSTEM_SEQUENCIA, prompt: correcao, maxTokens: 1800 }), lead.id);
  }
  return { demo: false, sequencia, meta: meta({ demo: false, insumo: INSUMO }) };
}

/** Escreve as sequências dos leads escolhidos de uma campanha salva e grava o resultado nela. */
export async function escreverParaCampanha(campanhaId: string, leadIds: string[]): Promise<{ campanha: Campanha; meta: Meta }> {
  const { campanha, perfil } = obterCampanha(campanhaId);
  const ids = Array.from(new Set(leadIds.map((x) => String(x))));
  if (ids.length === 0) throw new ErroDePedido("Selecione ao menos um lead para escrever as mensagens.");
  if (ids.length > MAXIMO_POR_CHAMADA) throw new ErroDePedido(`Escolha até ${MAXIMO_POR_CHAMADA} leads por vez.`);
  const leads = ids.map((id) => campanha.leads.find((l) => l.id === id));
  if (leads.some((l) => !l)) throw new ErroDePedido("Um dos leads escolhidos não está nesta campanha.");

  const resultados = await Promise.all((leads as Lead[]).map((lead) => escreverSequencia(lead, perfil)));
  const novas = new Map(resultados.map((r) => [r.sequencia.leadId, r.sequencia]));
  // Reescrever para um lead substitui a sequência anterior dele; as dos outros leads ficam como estavam.
  const sequencias = [...campanha.sequencias.filter((s) => !novas.has(s.leadId)), ...novas.values()];
  const ordem = new Map(campanha.leads.map((l, i) => [l.id, i]));
  sequencias.sort((a, b) => (ordem.get(a.leadId) ?? 0) - (ordem.get(b.leadId) ?? 0));

  const atualizada: Campanha = { ...campanha, sequencias, estado: campanha.estado === "enviada" ? "enviada" : "pronta" };
  salvarCampanha(atualizada);
  return { campanha: atualizada, meta: resultados[0].meta };
}

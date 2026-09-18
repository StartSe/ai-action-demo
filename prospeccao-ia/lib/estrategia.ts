// Estratégia e mensagens da abordagem (US-029/US-030, Fase 5) — arquivo SEPARADO de lib/abordagem.ts
// (fluxo antigo de lib/types.ts, Lead/Abordagem) de propósito: aqui a entrada é a qualificação já feita
// pelo pipeline do workspace (fit, evidências, sinais, hipótese, papel) e o produto/ICP cadastrados, nunca
// um formulário digitado na hora. Importa lib/ai.ts (node:sqlite) — só pode ser chamado por código de
// servidor (rotas), nunca por um Client Component.
//
// Duas funções, de propósito separadas: gerarEstrategia deriva o RUMO (objetivo/gancho/dor
// provável/tom/CTA) a partir da qualificação; gerarMensagens escreve os TRÊS canais a partir de um rumo já
// decidido (gerado ou editado à mão pelo vendedor). "A edição regera as mensagens" (AC da US-029) chama só
// a segunda — editar um item da estratégia nunca dispara uma nova IA para o próprio item que a pessoa
// acabou de digitar.
import { aiEnabled, askJSON } from "./ai";
import { esperar } from "./demo";
import { data } from "./formato";
import { ROTULO_FIT, ROTULO_PAPEL } from "./rotulos";
import { getConfig } from "./store";
import type { Conta, DirecaoRegeneracao, EstrategiaAbordagem, ICP, LeadProspeccao, NovaAbordagemRegistro, Produto, SinalProspeccao } from "./types";

function primeiroNome(nome: string) {
  return nome.split(" ")[0];
}

function contextoQualificacao(lead: LeadProspeccao, conta: Conta | null) {
  const linhas: string[] = [];
  linhas.push(`Nome: ${lead.nome}`);
  if (lead.cargo) linhas.push(`Cargo: ${lead.cargo}`);
  if (lead.empresa) linhas.push(`Empresa: ${lead.empresa}`);
  if (lead.fit) linhas.push(`Aderência ao perfil ideal: ${ROTULO_FIT[lead.fit]}`);
  const papelRotulo = ROTULO_PAPEL[lead.papel];
  if (papelRotulo) linhas.push(`Papel na decisão: ${papelRotulo}`);
  const evidencias = lead.evidencias.filter((e) => e.resultado === "atende");
  if (evidencias.length > 0) linhas.push(`Evidências que atendem ao perfil: ${evidencias.map((e) => `${e.criterio} (${e.valor})`).join("; ")}`);
  if (lead.sinais.length > 0) linhas.push(`Sinais públicos:\n${lead.sinais.map((s) => `- ${s.descricao} (${data(s.data, { comAno: true })})`).join("\n")}`);
  linhas.push(`Hipótese de dor: ${lead.hipotese || "nenhuma hipótese com sinal suficiente ainda"}`);
  if (conta?.resumo) linhas.push(`Sobre a empresa: ${conta.resumo}`);
  return linhas.join("\n");
}

const SYSTEM_ESTRATEGIA = `Você é um estrategista de vendas que decide COMO abordar UM lead específico, a partir da qualificação já feita (fit, evidências, sinais públicos, hipótese de dor, papel na decisão) e do que a empresa do usuário vende.
Regras:
- Baseie-se só nas informações fornecidas; nunca invente um fato sobre o lead que não esteja ali.
- "objetivo": o resultado esperado desta primeira abordagem (ex.: agendar uma conversa de 15-20 minutos), 1 frase curta.
- "gancho": o fato ou sinal que abre a conversa, citando em poucas palavras o que foi encontrado.
- "dorProvavel": a dor mais provável deste lead, cruzando a hipótese com o que a empresa do usuário resolve; se a hipótese for condicional, mantenha o tom condicional aqui também.
- "tom": uma palavra ou expressão curta (ex.: consultivo, direto, executivo).
- "cta": a próxima ação pedida ao lead, 1 frase curta.
Formato de saída (JSON): { "objetivo": "", "gancho": "", "dorProvavel": "", "tom": "", "cta": "" } — todos os campos são strings curtas, nunca vazias.`;

/** Estratégia inicial de uma abordagem (US-029), gerada a partir da qualificação do lead e da proposta do
 * produto. Sem IA configurada, cai numa versão determinística que já usa o sinal/hipótese reais do lead —
 * mantém a demonstração funcionando sem nenhuma chave. */
export async function gerarEstrategia(lead: LeadProspeccao, conta: Conta | null, produto: Produto, icp: ICP | null): Promise<EstrategiaAbordagem> {
  const sinalPrincipal = [...lead.sinais].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())[0];
  const dorIcp = icp?.dores[0];

  if (!aiEnabled()) {
    await esperar(700);
    return {
      objetivo: "Agendar uma conversa de 15 a 20 minutos",
      gancho: sinalPrincipal ? sinalPrincipal.descricao : `Aderência ao perfil de ${produto.nome}`,
      dorProvavel: lead.hipotese || (dorIcp ? `Possível dificuldade com ${dorIcp.charAt(0).toLowerCase()}${dorIcp.slice(1)}` : "Ainda sem dor identificada"),
      tom: "consultivo",
      cta: "Convite para uma conversa de 15 a 20 minutos",
    };
  }

  try {
    const prompt = `Qualificação do lead:\n${contextoQualificacao(lead, conta)}\n\nO que a empresa do usuário vende:\n${produto.propostaValor}`;
    const resposta = await askJSON<Partial<EstrategiaAbordagem>>({ system: SYSTEM_ESTRATEGIA, prompt, maxTokens: 500 });
    return {
      objetivo: resposta.objetivo?.trim() || "Agendar uma conversa de 15 a 20 minutos",
      gancho: resposta.gancho?.trim() || sinalPrincipal?.descricao || "Aderência ao perfil ideal",
      dorProvavel: resposta.dorProvavel?.trim() || lead.hipotese || "Ainda sem dor identificada",
      tom: resposta.tom?.trim() || "consultivo",
      cta: resposta.cta?.trim() || "Convite para uma conversa de 15 a 20 minutos",
    };
  } catch (err) {
    console.error("Falha ao gerar estratégia de abordagem:", err instanceof Error ? err.message : err);
    return {
      objetivo: "Agendar uma conversa de 15 a 20 minutos",
      gancho: sinalPrincipal ? sinalPrincipal.descricao : `Aderência ao perfil de ${produto.nome}`,
      dorProvavel: lead.hipotese || "Ainda sem dor identificada",
      tom: "consultivo",
      cta: "Convite para uma conversa de 15 a 20 minutos",
    };
  }
}

const SYSTEM_MENSAGENS = `Você é um SDR sênior que escreve as mensagens de uma abordagem cuja ESTRATÉGIA já foi decidida (objetivo, gancho, dor provável, tom e CTA, informados abaixo). Sua tarefa é só escrever os três canais, coerentes com essa estratégia.
Regras:
- Português do Brasil, direto, sem clichê de vendas ("prezado", "venho por meio desta", "solução inovadora"). Frases curtas, no tom pedido.
- Use o "gancho" da estratégia como abertura real, com um TEXTO DIFERENTE em cada canal (mesma informação, nunca a mesma frase repetida nos três).
- O e-mail tem no máximo 2 parágrafos curtos além da saudação e do fechamento, e termina com o CTA da estratégia.
- A mensagem de LinkedIn tem no máximo 300 caracteres (contando espaços).
- A mensagem de WhatsApp é curta (2 a 4 frases), informal mas profissional, sem emojis em excesso (no máximo 1).
- Assine o e-mail com o nome e a empresa do remetente informados; se nenhum dos dois for informado, assine apenas "Equipe comercial". Nunca use os marcadores [seu nome] ou [sua empresa].
Formato de saída (JSON): { "email": {"assunto": "", "corpo": ""}, "linkedin": "até 300 caracteres", "whatsapp": "" }`;

export type Mensagens = { email: { assunto: string; corpo: string }; linkedin: string; whatsapp: string };
export type CampoMensagem = keyof Mensagens;
export const CAMPOS_MENSAGEM: CampoMensagem[] = ["email", "linkedin", "whatsapp"];

/** Monta o `Partial<NovaAbordagemRegistro>` de UM canal só (o resto da abordagem não muda) — usado tanto
 * por uma regeneração nova quanto por "Voltar à versão anterior" (que grava de volta o valor de antes, sem
 * chamar IA de novo). */
export function partialParaCanal(canal: CampoMensagem, valor: Mensagens[CampoMensagem]): Partial<NovaAbordagemRegistro> {
  if (canal === "email") return { email: valor as Mensagens["email"] };
  if (canal === "linkedin") return { linkedin: valor as Mensagens["linkedin"] };
  return { whatsapp: valor as Mensagens["whatsapp"] };
}

function mensagensDemo(lead: LeadProspeccao, produto: Produto, estrategia: EstrategiaAbordagem, remetenteNome: string, remetenteEmpresa: string): Mensagens {
  const nome = primeiroNome(lead.nome);
  const assinatura = remetenteNome ? `${remetenteNome}${remetenteEmpresa ? `, da ${remetenteEmpresa}` : ""}` : "Equipe comercial";
  return {
    email: {
      assunto: `${lead.empresa || nome}: ${estrategia.objetivo.toLowerCase()}`,
      corpo: `Olá, ${nome}.\n\n${estrategia.gancho}. ${estrategia.dorProvavel}\n\n${produto.propostaValor.split(".")[0]}. ${estrategia.cta}?\n\nAbraço,\n${assinatura}`,
    },
    linkedin: `${estrategia.gancho} — ${estrategia.cta.toLowerCase()}?`.slice(0, 300),
    whatsapp: `Oi, ${nome}! ${estrategia.gancho}. ${estrategia.cta}?`,
  };
}

/** Mensagens dos três canais (US-029/030) a partir de uma estratégia JÁ decidida (gerada ou editada à mão
 * pelo vendedor) — é esta função, não `gerarEstrategia`, que a edição inline de um item da estratégia
 * chama de novo: editar "gancho" nunca deve fazer a IA reinventar objetivo/dorProvavel/tom/cta que a pessoa
 * não tocou. Sem IA configurada, cai numa versão determinística que já usa a estratégia recebida. */
export async function gerarMensagens(lead: LeadProspeccao, produto: Produto, estrategia: EstrategiaAbordagem): Promise<Mensagens> {
  const remetenteNome = getConfig("REMETENTE_NOME") || "";
  const remetenteEmpresa = getConfig("REMETENTE_EMPRESA") || "";

  if (!aiEnabled()) {
    await esperar(700);
    return mensagensDemo(lead, produto, estrategia, remetenteNome, remetenteEmpresa);
  }

  try {
    const prompt = `Estratégia decidida:
Objetivo: ${estrategia.objetivo}
Gancho: ${estrategia.gancho}
Dor provável: ${estrategia.dorProvavel}
Tom: ${estrategia.tom}
CTA: ${estrategia.cta}

Lead: ${lead.nome}${lead.cargo ? `, ${lead.cargo}` : ""}${lead.empresa ? ` na ${lead.empresa}` : ""}

O que a empresa do usuário vende:
${produto.propostaValor}

Remetente: ${remetenteNome || "não informado"}${remetenteEmpresa ? `, da empresa ${remetenteEmpresa}` : ""}`;
    const resposta = await askJSON<Partial<Mensagens>>({ system: SYSTEM_MENSAGENS, prompt, maxTokens: 1200 });
    if (!resposta.email?.assunto || !resposta.email?.corpo || !resposta.linkedin || !resposta.whatsapp) {
      throw new Error("resposta incompleta");
    }
    return { email: resposta.email as Mensagens["email"], linkedin: resposta.linkedin, whatsapp: resposta.whatsapp };
  } catch (err) {
    console.error("Falha ao gerar mensagens da abordagem:", err instanceof Error ? err.message : err);
    return mensagensDemo(lead, produto, estrategia, remetenteNome, remetenteEmpresa);
  }
}

// --- Regenerar com direção (US-031) ---------------------------------------------------------------------
// "Regenerar" reescreve só o CANAL aberto na tela, nunca os outros dois nem a estratégia acima — por isso é
// uma função à parte de `gerarMensagens` (que sempre escreve os três juntos, a partir de uma estratégia
// recém decidida/editada). "outro_sinal" não é uma instrução de tom: troca o gancho efetivo pelo sinal que
// o vendedor escolheu na tela, mantendo o resto da estratégia (dor, tom, CTA) como está.

const ROTULO_CANAL_MENSAGEM: Record<CampoMensagem, string> = { email: "e-mail", linkedin: "LinkedIn", whatsapp: "WhatsApp" };

const INSTRUCAO_DIRECAO: Record<DirecaoRegeneracao, string> = {
  mais_curto: "Deixe a mensagem BEM mais curta que uma versão normal — só o essencial, sem enfeite.",
  mais_executivo: "Tom mais executivo: direto, sem rodeios, frases curtas.",
  mais_consultivo: "Tom mais consultivo: focado em entender o problema da pessoa antes de propor algo.",
  sem_pitch: "Não mencione o produto nem a proposta de valor — só o gancho e o convite para conversar.",
  outro_sinal: "Mantenha a mesma direção de sempre; o gancho abaixo já foi trocado pelo sinal escolhido pelo vendedor.",
  outra_abordagem: "Escreva um ângulo de abertura diferente do de costume — mesma estratégia (gancho, dor, CTA), outra forma de dizer.",
};

function regrasCanalMensagem(canal: CampoMensagem): string {
  if (canal === "email") return '- O e-mail tem no máximo 2 parágrafos curtos além da saudação e do fechamento.\n- Assine com o nome e a empresa do remetente informados; sem nenhum dos dois, assine "Equipe comercial". Nunca use os marcadores [seu nome]/[sua empresa].';
  if (canal === "linkedin") return "- No máximo 300 caracteres (contando espaços).";
  return "- Curta (2 a 4 frases), informal mas profissional, no máximo 1 emoji.";
}

function formatoCanalMensagem(canal: CampoMensagem): string {
  return canal === "email" ? '{ "assunto": "", "corpo": "" }' : '{ "texto": "" }';
}

function mensagemDemoCanal(
  lead: LeadProspeccao,
  produto: Produto,
  estrategia: EstrategiaAbordagem,
  canal: CampoMensagem,
  direcao: DirecaoRegeneracao,
  gancho: string,
  remetenteNome: string,
  remetenteEmpresa: string,
): Mensagens[CampoMensagem] {
  const nome = primeiroNome(lead.nome);
  const assinatura = remetenteNome ? `${remetenteNome}${remetenteEmpresa ? `, da ${remetenteEmpresa}` : ""}` : "Equipe comercial";
  const cta = estrategia.cta;

  if (canal === "email") {
    const assunto = `${lead.empresa || nome}: ${estrategia.objetivo.toLowerCase()}`;
    const fechamento = `Abraço,\n${assinatura}`;
    if (direcao === "mais_curto") return { assunto, corpo: `Olá, ${nome}.\n\n${gancho}. ${cta}?\n\n${fechamento}` };
    if (direcao === "mais_executivo") return { assunto, corpo: `${nome}, direto ao ponto: ${gancho.toLowerCase()}. ${estrategia.dorProvavel}\n\n${cta}?\n\n${fechamento}` };
    if (direcao === "mais_consultivo") return { assunto, corpo: `Olá, ${nome}.\n\nTenho visto isso de perto: ${gancho.toLowerCase()}. Como vocês têm lidado com ${estrategia.dorProvavel.toLowerCase()}?\n\n${cta}?\n\n${fechamento}` };
    if (direcao === "sem_pitch") return { assunto, corpo: `Olá, ${nome}.\n\n${gancho}. ${estrategia.dorProvavel}\n\n${cta}?\n\n${fechamento}` };
    if (direcao === "outra_abordagem") return { assunto, corpo: `Oi, ${nome}. ${cta}? Pergunto porque ${gancho.toLowerCase()}, e ${produto.propostaValor.split(".")[0].toLowerCase()}.\n\n${fechamento}` };
    return { assunto, corpo: `Olá, ${nome}.\n\n${gancho}. ${estrategia.dorProvavel}\n\n${produto.propostaValor.split(".")[0]}. ${cta}?\n\n${fechamento}` };
  }

  if (canal === "linkedin") {
    if (direcao === "mais_curto") return `${gancho.split(".")[0]}. ${cta}?`.slice(0, 130);
    if (direcao === "mais_executivo") return `Direto ao ponto: ${gancho}. ${cta}?`.slice(0, 300);
    if (direcao === "mais_consultivo") return `Reparei que ${gancho.toLowerCase()}. Faz sentido trocarmos uma ideia sobre isso?`.slice(0, 300);
    if (direcao === "sem_pitch") return `${gancho}. Podemos conversar 15 minutos?`.slice(0, 300);
    if (direcao === "outra_abordagem") return `${cta}? Pergunto porque ${gancho.toLowerCase()}.`.slice(0, 300);
    return `${gancho} — ${cta.toLowerCase()}?`.slice(0, 300);
  }

  if (direcao === "mais_curto") return `${nome}, ${gancho.toLowerCase()}. ${cta}?`;
  if (direcao === "mais_executivo") return `${nome}, direto: ${gancho.toLowerCase()}. ${cta}?`;
  if (direcao === "mais_consultivo") return `Oi, ${nome}! Como vocês têm lidado com isso: ${gancho.toLowerCase()}? ${cta}?`;
  if (direcao === "sem_pitch") return `Oi, ${nome}! ${gancho}. Podemos conversar rapidinho?`;
  if (direcao === "outra_abordagem") return `${nome}, ${cta.toLowerCase()}? Vi que ${gancho.toLowerCase()}.`;
  return `Oi, ${nome}! ${gancho}. ${cta}?`;
}

/** Regenera só o CANAL indicado (aba aberta na tela), a partir da estratégia JÁ salva e de uma direção
 * pedida pelo vendedor (US-031) — nunca chama `gerarEstrategia`/`gerarMensagens` (que reescreveriam os três
 * canais). Sem IA configurada, cai numa variação determinística que já muda de tamanho/tom de verdade,
 * mantendo "modo demonstração sempre funciona" também para o menu "Regenerar". */
export async function regenerarMensagem(
  lead: LeadProspeccao,
  produto: Produto,
  estrategia: EstrategiaAbordagem,
  canal: CampoMensagem,
  direcao: DirecaoRegeneracao,
  sinalEscolhido?: SinalProspeccao,
): Promise<Mensagens[CampoMensagem]> {
  const remetenteNome = getConfig("REMETENTE_NOME") || "";
  const remetenteEmpresa = getConfig("REMETENTE_EMPRESA") || "";
  const gancho = direcao === "outro_sinal" && sinalEscolhido ? sinalEscolhido.descricao : estrategia.gancho;

  if (!aiEnabled()) {
    await esperar(500);
    return mensagemDemoCanal(lead, produto, estrategia, canal, direcao, gancho, remetenteNome, remetenteEmpresa);
  }

  try {
    const system = `Você é um SDR sênior reescrevendo só a mensagem de ${ROTULO_CANAL_MENSAGEM[canal]} de uma abordagem, a partir da estratégia já decidida e de uma direção pedida pelo vendedor.
Regras:
- Português do Brasil, direto, sem clichê de vendas ("prezado", "venho por meio desta", "solução inovadora").
- Direção pedida: ${INSTRUCAO_DIRECAO[direcao]}
- Use o gancho abaixo como abertura real.
${regrasCanalMensagem(canal)}
Formato de saída (JSON): ${formatoCanalMensagem(canal)}`;
    const prompt = `Estratégia decidida:
Objetivo: ${estrategia.objetivo}
Gancho: ${gancho}
Dor provável: ${estrategia.dorProvavel}
Tom: ${estrategia.tom}
CTA: ${estrategia.cta}

Lead: ${lead.nome}${lead.cargo ? `, ${lead.cargo}` : ""}${lead.empresa ? ` na ${lead.empresa}` : ""}

O que a empresa do usuário vende:
${produto.propostaValor}

Remetente: ${remetenteNome || "não informado"}${remetenteEmpresa ? `, da empresa ${remetenteEmpresa}` : ""}`;
    const resposta = await askJSON<{ assunto?: string; corpo?: string; texto?: string }>({ system, prompt, maxTokens: 500 });
    if (canal === "email") {
      if (!resposta.assunto || !resposta.corpo) throw new Error("resposta incompleta");
      return { assunto: resposta.assunto, corpo: resposta.corpo };
    }
    if (!resposta.texto) throw new Error("resposta incompleta");
    return resposta.texto;
  } catch (err) {
    console.error("Falha ao regenerar mensagem da abordagem:", err instanceof Error ? err.message : err);
    return mensagemDemoCanal(lead, produto, estrategia, canal, direcao, gancho, remetenteNome, remetenteEmpresa);
  }
}

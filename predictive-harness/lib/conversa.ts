// O laço do harness, turno a turno: triagem (Jev) → roteamento (código) → resposta (LLM) →
// verificação (Jev) → próximas perguntas (LLM propõe, Jev ranqueia). Cada decisão é registrada e
// devolvida com a mensagem, para a coluna Harness. Sem OpenRouter (Jev) o harness não roda.
import { randomUUID } from "node:crypto";
import { abrirBanco } from "./store";
import { AppError } from "./api";
import { decidir, escolha, sim, pontuacao, jevDisponivel, type Pergunta, type Decisao } from "./jev";
import { perguntar, parseJSON, conversaPronta, rotuloModelo, aiConfig } from "./ai";
import { obterPlanilha, lerLinhas, resumoParaIA } from "./planilhas";
import { respostaExemplo, CONVERSAS_EXEMPLO } from "./demo";
import type { Mensagem, Planilha, RegistroDecisao, ResumoHarness } from "./types";

const LIMITE_PERGUNTA = 2000;
const ROTULO_INTENCAO: Record<string, string> = {
  pergunta_dados: "Pergunta sobre os dados",
  previsao: "Previsão",
  grafico: "Pedido de gráfico",
  limpeza: "Qualidade ou limpeza dos dados",
  conceito: "Explicação de conceito",
  conversa: "Conversa",
  fora_do_escopo: "Fora do escopo da planilha",
};
const ROTULO_GRAFICO: Record<string, string> = { nenhum: "Nenhum", barras: "Barras", linhas: "Linhas", dispersao: "Dispersão", tabela: "Tabela" };
const NIVEIS_AMBIGUIDADE = ["Clara", "Falta um detalhe", "Precisa perguntar"];
const NIVEIS_COMPLEXIDADE = ["Consulta simples", "Análise composta", "Modelagem ou previsão"];

function db() {
  const b = abrirBanco();
  b.exec(`CREATE TABLE IF NOT EXISTS mensagens (id TEXT PRIMARY KEY, planilha_id TEXT NOT NULL, json TEXT NOT NULL, criado_em TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS mensagens_planilha ON mensagens(planilha_id, criado_em);`);
  return b;
}
export function listarMensagens(planilhaId: string): Mensagem[] {
  const rows = db().prepare("SELECT json FROM mensagens WHERE planilha_id = ? ORDER BY criado_em, rowid").all(planilhaId) as { json: string }[];
  return rows.map((r) => JSON.parse(r.json) as Mensagem);
}
function gravar(planilhaId: string, m: Mensagem) {
  db().prepare("INSERT INTO mensagens (id, planilha_id, json, criado_em) VALUES (?, ?, ?, ?)").run(m.id, planilhaId, JSON.stringify(m), m.criadoEm);
  return m;
}
export function limparConversa(planilhaId: string) {
  db().prepare("DELETE FROM mensagens WHERE planilha_id = ?").run(planilhaId);
}
export function sugestoesIniciais(p: Planilha): string[] {
  if (p.demo) return CONVERSAS_EXEMPLO.map((c) => c.pergunta);
  const num = p.colunas.find((c) => c.semantico === "moeda") || p.colunas.find((c) => c.semantico === "quantidade");
  const cat = p.colunas.find((c) => c.semantico === "categoria" || c.semantico === "geografia");
  const data = p.colunas.find((c) => c.semantico === "data");
  const s: string[] = [];
  if (num && cat) s.push(`Qual ${cat.nome} tem o maior total de ${num.nome}?`);
  if (num && data) s.push(`Como ${num.nome} evoluiu ao longo do período?`);
  s.push("Quais colunas têm problemas de qualidade que eu deveria olhar antes de analisar?");
  return s.slice(0, 3);
}

// --- Perguntas do Jev por estação -------------------------------------------------------------------
function perguntasTriagem(): Record<string, Pergunta> {
  return {
    intencao: {
      type: "choice",
      instructions: "O que a pessoa quer em `pergunta`, considerando `colunas` e `conversa_anterior`?",
      criteria: {
        pergunta_dados: "Quer um número, comparação, ranking ou explicação calculada a partir da planilha.",
        previsao: "Quer saber o que vai acontecer no futuro (projeção, tendência à frente).",
        grafico: "Pede explicitamente um gráfico ou visualização.",
        limpeza: "Pergunta sobre qualidade, vazios, duplicados ou como preparar os dados.",
        conceito: "Quer que um conceito ou métrica seja explicado, sem calcular.",
        conversa: "Saudação, agradecimento ou comentário sem pedido.",
        fora_do_escopo: "Pede algo que não tem relação com esta planilha.",
      },
    },
    respondivel: { type: "noul", instructions: "As `colunas` disponíveis permitem responder `pergunta` (mesmo que exija cálculo)?" },
    precisa_codigo: { type: "noul", instructions: "Responder `pergunta` exige agrupar, filtrar ou calcular sobre as linhas, além do que já está em `agregados_disponiveis`?" },
    precisa_web: { type: "noul", instructions: "Responder bem `pergunta` exige informação externa à planilha (inflação, câmbio, mercado, concorrentes, notícias)?" },
    ambiguidade: { type: "score", instructions: "Quão ambígua é `pergunta` para quem vai calcular a resposta?", criteria: ["Clara: dá para calcular sem perguntar nada.", "Falta um detalhe pequeno; dá para assumir e declarar a premissa.", "Precisa perguntar antes: a resposta muda muito conforme a interpretação."] },
    complexidade: { type: "score", instructions: "Quão complexa é a análise pedida em `pergunta`?", criteria: ["Consulta simples: um número, um ranking ou uma lista.", "Análise composta: cruzar categorias e períodos, comparar, explicar variação.", "Modelagem: previsão, correlação, causa ou cenário."] },
    dado_sensivel: { type: "noul", instructions: "`pergunta` pede para expor dados de pessoas identificáveis (nomes, e-mails, documentos, telefones)?" },
  };
}
function perguntasVerificacao(): Record<string, Pergunta> {
  return {
    responde: { type: "noul", instructions: "A `resposta` responde diretamente ao que foi pedido em `pergunta`?" },
    numeros_batem: { type: "noul", instructions: "Todos os números citados em `resposta` aparecem em `resumo_dos_dados` ou derivam de uma operação simples (soma, diferença, percentual) sobre eles?" },
    grafico: { type: "choice", instructions: "Que visualização ajudaria mais a entender a `resposta`?", criteria: { nenhum: "Um texto curto basta.", barras: "Comparação entre categorias.", linhas: "Evolução ao longo do tempo.", dispersao: "Relação entre duas medidas.", tabela: "Vários números que a pessoa vai consultar." } },
    escalar: { type: "noul", instructions: "A `resposta` recomenda uma decisão de negócio relevante que mereça validação humana antes de agir?" },
  };
}

// --- Turno -----------------------------------------------------------------------------------------
type Contexto = { decisoes: RegistroDecisao[]; harness: ResumoHarness; inicio: number };
function registrar(ctx: Contexto, d: Decisao) {
  ctx.harness.chamadasJev++;
  ctx.harness.latenciaJevMs += d.latenciaMs;
  ctx.harness.custoJevUsd += d.custoUsd;
  ctx.harness.tokensJev += d.tokens;
  ctx.harness.caminho = d.caminho;
}
const pf = (n: number | null) => (n === null ? "" : ` (${n.toFixed(1).replace(".", ",")})`);
function anotarEscolha(ctx: Contexto, estacao: RegistroDecisao["estacao"], d: Decisao, chave: string, rotulo: string, rotulos: Record<string, string>) {
  const e = escolha(d, chave);
  ctx.decisoes.push({ estacao, chave, rotulo, valor: e.valor ? rotulos[e.valor] || e.valor : "Sem resposta", probabilidade: e.probabilidade, confianca: e.confianca, baixaConfianca: e.baixa });
  return e;
}
function anotarSim(ctx: Contexto, estacao: RegistroDecisao["estacao"], d: Decisao, chave: string, rotulo: string) {
  const s = sim(d, chave);
  ctx.decisoes.push({ estacao, chave, rotulo, valor: s.valor === null ? "Sem resposta" : s.valor ? "Sim" : "Não", probabilidade: s.probabilidade, confianca: null, baixaConfianca: s.baixa });
  return s;
}
function anotarNivel(ctx: Contexto, estacao: RegistroDecisao["estacao"], d: Decisao, chave: string, rotulo: string, niveis: string[]) {
  const p = pontuacao(d, chave);
  const idx = p.valor === null ? -1 : Math.min(niveis.length - 1, Math.max(0, Math.round(p.valor)));
  ctx.decisoes.push({ estacao, chave, rotulo, valor: idx < 0 ? "Sem resposta" : niveis[idx] + pf(p.valor), probabilidade: null, confianca: p.confianca, baixaConfianca: p.baixa });
  return p;
}

export async function executarTurno(planilhaId: string, perguntaBruta: unknown, signal?: AbortSignal): Promise<{ pergunta: Mensagem; resposta: Mensagem }> {
  const texto = typeof perguntaBruta === "string" ? perguntaBruta.trim().slice(0, LIMITE_PERGUNTA) : "";
  if (!texto) throw new AppError("Escreva uma pergunta.");
  const p = obterPlanilha(planilhaId);
  const pergunta: Mensagem = { id: randomUUID(), papel: "usuario", texto, criadoEm: new Date().toISOString() };
  const linhas = lerLinhas(p);

  // Sem harness (OpenRouter) ou sem LLM: em demonstração respondem as conversas de exemplo; fora dela, erro claro.
  const harnessLigado = jevDisponivel();
  const llmPronto = await conversaPronta();
  if (!harnessLigado || !llmPronto) {
    if (p.demo) {
      const ex = respostaExemplo(texto, linhas);
      if (ex) {
        gravar(planilhaId, pergunta);
        return { pergunta, resposta: gravar(planilhaId, { id: randomUUID(), papel: "assistente", criadoEm: new Date().toISOString(), ...ex }) };
      }
      throw new AppError(!harnessLigado ? "Em demonstração respondo só às perguntas sugeridas. Conecte o OpenRouter (Jev) e o ChatGPT em Configurações para perguntar qualquer coisa." : "Conecte o ChatGPT em Configurações, ou escolha um modelo do OpenRouter, para perguntar qualquer coisa.", 409);
    }
    throw new AppError(!harnessLigado ? "Conecte o OpenRouter em Configurações: o harness precisa do Jev para triar e verificar cada resposta." : "Conecte o ChatGPT em Configurações, ou escolha um modelo do OpenRouter, para conversar sobre os dados.", 409);
  }

  const ctx: Contexto = { decisoes: [], harness: { chamadasJev: 0, latenciaJevMs: 0, custoJevUsd: 0, tokensJev: 0, modelo: rotuloModelo(), latenciaTotalMs: 0, caminho: "", avisos: [] }, inicio: Date.now() };
  const historico = listarMensagens(planilhaId).slice(-6).map((m) => ({ papel: m.papel, texto: m.texto.slice(0, 600) }));
  const resumo = resumoParaIA(p, linhas);

  // 1. Triagem
  const triagem = await decidir(
    {
      pergunta: texto,
      colunas: p.colunas.map((c) => ({ nome: c.nome, tipo: c.semantico })),
      agregados_disponiveis: "totais por mês, totais por categoria e variação entre as duas últimas janelas de meses, para as colunas numéricas principais",
      conversa_anterior: historico,
    },
    perguntasTriagem(),
    { signal },
  );
  registrar(ctx, triagem);
  const intencao = anotarEscolha(ctx, "triagem", triagem, "intencao", "Intenção", ROTULO_INTENCAO);
  const respondivel = anotarSim(ctx, "triagem", triagem, "respondivel", "Respondível com as colunas");
  const precisaCodigo = anotarSim(ctx, "triagem", triagem, "precisa_codigo", "Precisa de cálculo linha a linha");
  const precisaWeb = anotarSim(ctx, "triagem", triagem, "precisa_web", "Precisa de contexto externo");
  const ambiguidade = anotarNivel(ctx, "triagem", triagem, "ambiguidade", "Ambiguidade", NIVEIS_AMBIGUIDADE);
  const complexidade = anotarNivel(ctx, "triagem", triagem, "complexidade", "Complexidade", NIVEIS_COMPLEXIDADE);
  const sensivel = anotarSim(ctx, "triagem", triagem, "dado_sensivel", "Pede dado pessoal");

  // 2. Roteamento (código, não IA)
  const config = aiConfig();
  const forte = !!config.modelForte && complexidade.valor !== null && complexidade.valor >= 1.5 && !complexidade.baixa;
  ctx.harness.modelo = rotuloModelo(config, forte);
  ctx.decisoes.push({ estacao: "roteamento", chave: "modelo", rotulo: "Modelo escolhido", valor: forte ? "Modelo forte (análise complexa)" : config.modelForte ? "Modelo padrão" : "Modelo padrão (sem modelo forte configurado)", probabilidade: null, confianca: null, baixaConfianca: false });
  const intent = intencao.valor && !intencao.baixa ? intencao.valor : "pergunta_dados";
  if (intencao.baixa) ctx.harness.avisos.push("A intenção veio com baixa confiança; tratei como pergunta sobre os dados.");
  if (precisaCodigo.valor) ctx.harness.avisos.push("Esta pergunta pediria cálculo linha a linha; a resposta usa os agregados prontos. Execução de código chega na próxima versão.");
  if (precisaWeb.valor) ctx.harness.avisos.push("A pergunta pede contexto externo; a busca na web chega na próxima versão.");
  if (sensivel.valor) ctx.harness.avisos.push("A pergunta toca em dado pessoal: a resposta usa só agregados, sem listar pessoas.");
  const perguntarAntes = !ambiguidade.baixa && ambiguidade.valor !== null && ambiguidade.valor >= 1.5 && intent === "pergunta_dados";
  ctx.decisoes.push({ estacao: "roteamento", chave: "caminho", rotulo: "Caminho", valor: intent === "conversa" || intent === "fora_do_escopo" ? "Resposta curta sem tocar nos dados" : perguntarAntes ? "Uma pergunta de esclarecimento" : respondivel.valor === false && !respondivel.baixa ? "Explicar o que a planilha não cobre" : "Responder com os agregados", probabilidade: null, confianca: null, baixaConfianca: false });

  // 3. Resposta (LLM)
  const base = `Você é um analista de dados sênior falando com um executivo brasileiro. Responda em português do Brasil, direto e curto (1 a 3 parágrafos). Sem títulos. Pode usar **negrito** e uma tabela em Markdown quando comparar categorias ou períodos.`;
  let rascunho: string;
  if (intent === "conversa" || intent === "fora_do_escopo") {
    rascunho = await perguntar({ system: `${base} A mensagem não é uma pergunta sobre a planilha "${p.nome}". Responda em uma ou duas frases, sem inventar números, e lembre que você analisa esta planilha.`, prompt: texto, signal, maxTokens: 300 });
  } else if (perguntarAntes) {
    rascunho = await perguntar({ system: `${base} A pergunta é ambígua para ser calculada. Faça UMA pergunta de esclarecimento objetiva, em uma frase, oferecendo as interpretações possíveis com base nas colunas. Não responda ainda.\n\nRESUMO DOS DADOS:\n${resumo}`, prompt: texto, signal, maxTokens: 300 });
  } else {
    const regra = respondivel.valor === false && !respondivel.baixa
      ? "As colunas provavelmente NÃO cobrem a pergunta. Diga isso com clareza, mostre quais colunas existem e o que dá para responder de perto. Não invente."
      : "Use SOMENTE números presentes no RESUMO DOS DADOS ou derivados deles por soma, diferença ou percentual. Se um número necessário não estiver lá, diga que precisa de um cálculo linha a linha em vez de estimar.";
    const sens = sensivel.valor ? " Nunca liste nomes, e-mails, documentos ou telefones; fale só em agregados." : "";
    const prev = intent === "previsao" ? " Se fizer uma projeção, deixe explícito que é uma extrapolação simples da tendência dos agregados, com o intervalo de incerteza em palavras." : "";
    rascunho = await perguntar({
      system: `${base} ${regra}${sens}${prev} Termine com uma linha "Base: ..." dizendo quais colunas e agregados usou.\n\nRESUMO DOS DADOS:\n${resumo}`,
      prompt: historico.length ? `Conversa anterior:\n${historico.map((h) => `${h.papel === "usuario" ? "Pessoa" : "Analista"}: ${h.texto}`).join("\n")}\n\nPergunta agora: ${texto}` : texto,
      forte,
      signal,
    });
  }

  // 4. Verificação (Jev)
  let resposta = rascunho;
  if (intent !== "conversa" && intent !== "fora_do_escopo" && !perguntarAntes) {
    let verif = await decidir({ pergunta: texto, resposta, resumo_dos_dados: resumo.slice(0, 7000) }, perguntasVerificacao(), { signal });
    registrar(ctx, verif);
    let batem = sim(verif, "numeros_batem");
    if (batem.valor === false && !batem.baixa) {
      const reescrita = await perguntar({ system: `${base} A resposta abaixo citou números que não estão no RESUMO DOS DADOS. Reescreva-a usando exclusivamente números do resumo (ou somas, diferenças e percentuais deles) e diga o que não dá para afirmar. Termine com a linha "Base: ...".\n\nRESUMO DOS DADOS:\n${resumo}`, prompt: `Pergunta: ${texto}\n\nResposta a corrigir:\n${resposta}`, forte, signal });
      resposta = reescrita;
      ctx.decisoes.push({ estacao: "verificacao", chave: "reescrita", rotulo: "Resposta reescrita", valor: "Sim: números fora do resumo", probabilidade: batem.probabilidade, confianca: null, baixaConfianca: false });
      verif = await decidir({ pergunta: texto, resposta, resumo_dos_dados: resumo.slice(0, 7000) }, perguntasVerificacao(), { signal });
      registrar(ctx, verif);
      batem = sim(verif, "numeros_batem");
      if (batem.valor === false && !batem.baixa) ctx.harness.avisos.push("Mesmo após reescrever, alguns números podem não estar nos agregados. Confira antes de usar.");
    }
    anotarSim(ctx, "verificacao", verif, "responde", "Responde à pergunta");
    anotarSim(ctx, "verificacao", verif, "numeros_batem", "Números conferem com os dados");
    anotarEscolha(ctx, "verificacao", verif, "grafico", "Gráfico sugerido", ROTULO_GRAFICO);
    const escalar = anotarSim(ctx, "verificacao", verif, "escalar", "Pede validação humana");
    if (escalar.valor) ctx.harness.avisos.push("A resposta sugere uma decisão de negócio: valide com quem responde pela área antes de agir.");
  }

  // 5. Próximas perguntas: o LLM propõe cinco, o Jev ranqueia, ficam três.
  let sugestoes: string[] = [];
  if (intent !== "conversa" && intent !== "fora_do_escopo") {
    try {
      const bruto = await perguntar({ system: `Proponha 5 perguntas curtas de acompanhamento (até 90 caracteres cada) que um executivo faria em seguida sobre estes dados, respondíveis com as colunas listadas. Devolva SOMENTE um JSON: uma lista de 5 strings em português.\n\nCOLUNAS: ${p.colunas.map((c) => `${c.nome} (${c.semantico})`).join(", ")}`, prompt: `Pergunta: ${texto}\nResposta dada: ${resposta.slice(0, 1200)}`, signal, maxTokens: 400 });
      const lista = (parseJSON<unknown>(bruto) as unknown[] | null)?.filter((s): s is string => typeof s === "string" && s.trim().length > 5).slice(0, 5) || [];
      if (lista.length) {
        const perguntas: Record<string, Pergunta> = {};
        lista.forEach((_, i) => (perguntas[`s_${i}`] = { type: "score", instructions: `Quão boa é \`candidatas[${i}]\` como próxima pergunta desta conversa, considerando \`colunas\`?`, criteria: ["Sem relação com a conversa ou impossível com estas colunas.", "Relacionada, mas genérica ou repetida.", "Continuação natural, específica e respondível com as colunas."] }));
        const rank = await decidir({ pergunta: texto, resposta: resposta.slice(0, 1500), colunas: p.colunas.map((c) => c.nome), candidatas: lista }, perguntas, { signal });
        registrar(ctx, rank);
        sugestoes = lista.map((s, i) => ({ s, v: pontuacao(rank, `s_${i}`).valor ?? 0 })).sort((a, b) => b.v - a.v).slice(0, 3).map((x) => x.s.trim());
        ctx.decisoes.push({ estacao: "sugestoes", chave: "ranking", rotulo: "Próximas perguntas ranqueadas", valor: `${lista.length} propostas, ${sugestoes.length} escolhidas`, probabilidade: null, confianca: null, baixaConfianca: false });
      }
    } catch (e) {
      ctx.harness.avisos.push(`Sem sugestões neste turno: ${e instanceof Error ? e.message : "falha ao propor perguntas."}`);
    }
  }

  ctx.harness.latenciaTotalMs = Date.now() - ctx.inicio;
  gravar(planilhaId, pergunta);
  const final: Mensagem = { id: randomUUID(), papel: "assistente", texto: resposta.trim(), criadoEm: new Date().toISOString(), decisoes: ctx.decisoes, harness: ctx.harness, sugestoes };
  return { pergunta, resposta: gravar(planilhaId, final) };
}

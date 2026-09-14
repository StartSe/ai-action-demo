// Lógica de análise de uma conversa de vendas, compartilhada entre a rota HTTP (app/api/analisar/route.ts)
// e a ferramenta MCP (lib/ferramentas.ts), para não duplicar o prompt nem a gravação no histórico.
import crypto from "node:crypto";
import { aiEnabled, askJSON, meta, type Meta } from "./ai";
import { esperar, analiseDemo, conversaDemo } from "./demo";
import { parseConversaColada } from "./conversa";
import { CRITERIOS_PADRAO } from "./criterios";
import { obter as obterCenario } from "./cenarios";
import { obter as obterVendedor } from "./vendedores";
import { salvar } from "./historico";
import type { Analise, Cenario, Conversa, CriterioAnalise, DadosAnalise, LinhaTranscricao, Vendedor } from "./types";

export const SYSTEM_ANALISE = `Você é um especialista em coaching de vendas consultivas que avalia conversas entre um vendedor e um cliente.
Sua tarefa é ler a transcrição e avaliar o desempenho do VENDEDOR (nunca o cliente) em cada um dos critérios informados, na mesma ordem em que foram informados.
Regras:
- Escreva em português do Brasil, direto e específico à conversa (nunca genérico).
- Cada nota vai de 0 a 10, com uma casa decimal, refletindo só o desempenho naquele critério específico.
- A evidência deve citar algo que o vendedor de fato disse ou deixou de dizer na conversa.
- "Como melhorar" é uma sugestão prática e específica a essa conversa, nunca um conselho genérico.
- Aponte no máximo 3 pontos fortes, 3 pontos a melhorar e 3 momentos-chave (cada um com o instante aproximado se souber, ou uma referência à fala).
- O resumo tem no máximo 45 palavras.
Formato de saída (JSON):
{
  "criterios": [{"nome": "", "nota": 0, "evidencia": "", "comoMelhorar": ""}],
  "pontosFortes": ["..."],
  "oQueMelhorar": ["..."],
  "momentos": ["..."],
  "resumo": "2 a 3 frases sobre como foi a conversa, em no máximo 45 palavras"
}`;

function transcricaoParaTexto(transcricao: LinhaTranscricao[]): string {
  return transcricao.map((l) => `${l.papel === "vendedor" ? "Vendedor" : "Cliente"}: ${l.texto}`).join("\n");
}

function contextoCenario(cenario: Cenario | null): string {
  if (!cenario) return "";
  return `\n\nCenário simulado: ${cenario.titulo}. Cliente: ${cenario.cliente.nome}, ${cenario.cliente.cargo} da ${cenario.cliente.empresa}. Contexto: ${cenario.cliente.contexto}. Objetivo do vendedor: ${cenario.objetivo}.`;
}

/** Média dos critérios, sempre calculada aqui (nunca confiada à IA), com uma casa decimal. */
function media(criterios: CriterioAnalise[]): number {
  if (criterios.length === 0) return 0;
  const soma = criterios.reduce((acc, c) => acc + (Number.isFinite(c.nota) ? c.nota : 0), 0);
  return Math.round((soma / criterios.length) * 10) / 10;
}

/** Analisa uma conversa já estruturada contra a lista de critérios; nunca confia a nota geral à IA. */
export async function analisarConversa(conversa: Conversa, criterios: string[] = CRITERIOS_PADRAO, cenario: Cenario | null = null): Promise<{ demo: boolean; analise: Analise; meta: Meta }> {
  const insumo = "conversas coladas e critérios de avaliação";
  if (!aiEnabled()) {
    await esperar(1200);
    const analise = analiseDemo(criterios);
    return { demo: true, analise, meta: meta({ demo: true, insumo }) };
  }
  const prompt = `Critérios de avaliação, nesta ordem: ${criterios.join(" | ")}${contextoCenario(cenario)}\n\nTranscrição da conversa:\n${transcricaoParaTexto(conversa.transcricao)}`;
  const bruta = await askJSON<{
    criterios?: { nome?: string; nota?: number; evidencia?: string; comoMelhorar?: string }[];
    pontosFortes?: string[];
    oQueMelhorar?: string[];
    momentos?: string[];
    resumo?: string;
  }>({ system: SYSTEM_ANALISE, prompt });

  const criteriosResp: CriterioAnalise[] = criterios.map((nome, i) => {
    const c = bruta.criterios?.[i];
    const notaBruta = Number(c?.nota);
    const nota = Number.isFinite(notaBruta) ? Math.round(Math.min(10, Math.max(0, notaBruta)) * 10) / 10 : 0;
    return { nome, nota, evidencia: c?.evidencia || "Sem evidência específica identificada.", comoMelhorar: c?.comoMelhorar || "" };
  });

  const analise: Analise = {
    nota: media(criteriosResp),
    criterios: criteriosResp,
    pontosFortes: (bruta.pontosFortes || []).slice(0, 3),
    oQueMelhorar: (bruta.oQueMelhorar || []).slice(0, 3),
    momentos: (bruta.momentos || []).slice(0, 3),
    resumo: bruta.resumo || "",
  };
  return { demo: false, analise, meta: meta({ demo: false, insumo }) };
}

function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

function tituloResultado(vendedor: Vendedor | null, cenario: Cenario | null): string {
  if (vendedor && cenario) return `Conversa de ${vendedor.nome} · ${cenario.titulo}`;
  if (vendedor) return `Conversa de ${vendedor.nome}`;
  if (cenario) return `Conversa: ${cenario.titulo}`;
  return "Conversa analisada";
}

/**
 * Ponto único de entrada, reaproveitado pela rota HTTP (app/api/analisar/route.ts) e pela ferramenta
 * MCP analisar_conversa (lib/ferramentas.ts): monta a Conversa a partir do texto colado (ou usa a
 * conversa de exemplo em modo demonstração), analisa e salva o resultado no histórico por 90 dias.
 */
export async function gerarAnalise(dados: DadosAnalise): Promise<{ demo: boolean; conversa: Conversa; analise: Analise; meta: Meta; id?: string; titulo: string }> {
  const criterios = dados.criterios && dados.criterios.length > 0 ? dados.criterios : CRITERIOS_PADRAO;
  const vendedor = dados.vendedorId ? obterVendedor(dados.vendedorId) : null;
  const cenario = dados.cenarioId ? obterCenario(dados.cenarioId) : null;
  const titulo = tituloResultado(vendedor, cenario);

  const transcricao = !aiEnabled() ? conversaDemo() : parseConversaColada(dados.conversaColada);
  const conversa: Conversa = {
    id: gerarId(),
    vendedorId: dados.vendedorId,
    cenarioId: dados.cenarioId,
    origem: "colada",
    transcricao,
    criadoEm: new Date().toISOString(),
  };

  const { demo, analise, meta: metaGerada } = await analisarConversa(conversa, criterios, cenario);
  const id = salvar({ tipo: "conversa", titulo, entrada: conversa, saida: analise, meta: metaGerada, expiraEmDias: 90 });
  return { demo, conversa, analise, meta: metaGerada, id, titulo };
}

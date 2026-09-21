// "O que o agente sugere": três melhorias para o site a partir do HTML (resumido), da marca e das métricas de
// 30 dias. Cada sugestão traz a `instrucao` pronta para mandar ao agente ("Aplicar"). Cache de 24 h por versão
// em `config` (SUGESTOES_<projetoId>_<versao>), para não gastar IA a cada abertura do painel.
import { ErroDePedido } from "./gerador";
import { resumo, resumoEmTexto } from "./metricas";
import { gerarJSON, iaDisponivel } from "./motor";
import { obter, paginaDoProjeto, ProjetoNaoEncontrado } from "./projetos";
import { getConfig, setConfig } from "./store";

export type Sugestao = { titulo: string; motivo: string; instrucao: string };
export type RespostaSugestoes = { sugestoes: Sugestao[]; versao: number; demo: boolean; geradoEm: string };

const CACHE_MS = 24 * 60 * 60 * 1000;

const SUGESTOES_DEMO: Sugestao[] = [
  { titulo: "Chamada principal mais direta", motivo: "O título do herói descreve a empresa; um título que promete o resultado para quem visita costuma converter mais.", instrucao: "Reescreva o título principal do herói prometendo o resultado que o cliente ganha, em até 10 palavras, e ajuste a frase de apoio para explicar como." },
  { titulo: "Botão de contato pelo WhatsApp", motivo: "A maior parte das visitas vem do celular; um botão de WhatsApp reduz o caminho até o contato.", instrucao: "Troque o botão principal do herói por 'Falar no WhatsApp' e adicione o mesmo botão na chamada final; mantenha as cores da marca." },
  { titulo: "Prova social com números da empresa", motivo: "Depoimentos genéricos convencem menos do que números concretos do negócio.", instrucao: "Na seção de prova social, troque os depoimentos por três números da empresa com rótulos curtos (deixe marcadores como '+X clientes' para a pessoa preencher) e mantenha o layout." },
];

/** Recorte do HTML que cabe no prompt: títulos, botões e os primeiros caracteres de cada seção. */
export function resumirHtml(html: string): string {
  const texto = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const titulos = [...html.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => `h${m[1]}: ${texto(m[2]).slice(0, 120)}`);
  const botoes = [...html.matchAll(/<(a|button)\b[^>]*class="[^"]*(btn|bg-|button)[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => texto(m[3]).slice(0, 60)).filter(Boolean);
  const secoes = [...html.matchAll(/<(section|header|footer)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m, i) => `${m[1]} ${i + 1}: ${texto(m[2]).slice(0, 200)}`);
  return [`Títulos:\n${titulos.join("\n") || "(nenhum)"}`, `Botões: ${[...new Set(botoes)].slice(0, 12).join(" | ") || "(nenhum)"}`, `Seções:\n${secoes.slice(0, 12).join("\n")}`].join("\n\n");
}

const SYSTEM = `Você é um consultor de marketing digital que revisa a página de uma pequena empresa e propõe melhorias que um agente vai aplicar por edição do HTML.
Devolva JSON no formato {"sugestoes":[{"titulo":"...","motivo":"...","instrucao":"..."}]} com EXATAMENTE 3 sugestões:
- titulo: até 8 palavras, em português, sem ponto final.
- motivo: uma frase (até 30 palavras) ligando a sugestão ao que você viu na página ou nas métricas.
- instrucao: o pedido concreto ao agente, em português, específico o bastante para ser executado sem perguntas (qual seção, qual texto, qual botão), sem inventar dados da empresa (telefone, preço, endereço) — quando precisar de um dado, deixe um marcador entre colchetes.
Priorize: clareza da promessa no herói, caminho até o contato, prova social, legibilidade no celular, coerência com a marca. Não sugira trocar cores da marca nem adicionar scripts.`;

function chaveCache(projetoId: string, versao: number): string {
  return `SUGESTOES_${projetoId}_${versao}`;
}

/** Três sugestões para a versão atual do site, do cache (24 h) ou geradas agora (`forcar` ignora o cache). */
export async function sugerir(projetoId: string, forcar = false): Promise<RespostaSugestoes> {
  const projeto = obter(projetoId);
  if (!projeto) throw new ProjetoNaoEncontrado();
  const salva = paginaDoProjeto(projeto);
  if (projeto.estado !== "pronto" || !salva) throw new ErroDePedido("As sugestões chegam quando o site estiver pronto.");
  const atual = salva.pagina.versoes[salva.pagina.versoes.length - 1];
  const chave = chaveCache(projetoId, atual.n);

  if (!forcar) {
    const bruto = getConfig(chave);
    if (bruto) {
      try {
        const cache = JSON.parse(bruto) as RespostaSugestoes;
        if (Date.now() - new Date(cache.geradoEm).getTime() < CACHE_MS && Array.isArray(cache.sugestoes)) return cache;
      } catch { /* cache inválido: gera de novo */ }
    }
  }

  let resposta: RespostaSugestoes;
  if (!(await iaDisponivel())) {
    resposta = { sugestoes: SUGESTOES_DEMO, versao: atual.n, demo: true, geradoEm: new Date().toISOString() };
  } else {
    const metricas = resumo(projetoId, 30);
    const prompt = [
      `Empresa: ${projeto.marca?.nome || projeto.nome}. Site: «${projeto.nome}».${projeto.briefing ? ` Briefing: ${projeto.briefing.slice(0, 600)}` : ""}`,
      `Métricas dos últimos 30 dias: ${resumoEmTexto(projetoId, 30)} Celular: ${metricas.celular}, computador: ${metricas.computador}. Origens: ${metricas.origens.map((o) => `${o.origem} (${o.visitas})`).join(", ") || "nenhuma"}.`,
      `Resumo da página (versão ${atual.n}):\n${resumirHtml(atual.html)}`,
    ].join("\n\n");
    const bruto = await gerarJSON<{ sugestoes?: unknown }>({ system: SYSTEM, prompt, maxTokens: 1500 });
    const lista = Array.isArray(bruto?.sugestoes) ? (bruto.sugestoes as Record<string, unknown>[]) : [];
    const sugestoes: Sugestao[] = lista
      .filter((s) => typeof s?.titulo === "string" && typeof s?.instrucao === "string")
      .slice(0, 3)
      .map((s) => ({ titulo: String(s.titulo).slice(0, 80), motivo: String(s.motivo ?? "").slice(0, 300), instrucao: String(s.instrucao).slice(0, 600) }));
    if (sugestoes.length === 0) throw new ErroDePedido("A inteligência artificial não devolveu sugestões desta vez. Tente de novo.");
    resposta = { sugestoes, versao: atual.n, demo: false, geradoEm: new Date().toISOString() };
  }
  setConfig(chave, JSON.stringify(resposta));
  return resposta;
}

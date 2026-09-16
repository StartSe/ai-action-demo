// "Buscar entregas no quadro": lê o quadro de tarefas conectado (integração MCP_TAREFAS, ex.: o Agente de
// quadro desta suíte) e devolve os cartões já concluídos pela pessoa, para preencher o campo "Entregas"
// do PDI sem digitar. Arquivo próprio deste app.
import { chamar, conectar } from "./mcp-cliente";
import { conexaoAutorizada } from "./mcp-oauth";
import { integracaoConfigurada, MCP_TAREFAS } from "./setup-comum";

export type EntregaQuadro = { titulo: string; lista: string; vencimento: string | null };

/** Configuração faltando é problema do pedido (400), não do quadro (502): a rota decide o status por instanceof. */
export class QuadroNaoConectado extends Error {
  constructor() {
    super("Conecte um quadro de tarefas em Configurações para buscar as entregas da pessoa.");
    this.name = "QuadroNaoConectado";
  }
}

type CartaoRemoto = { nome?: string; responsavel?: string; vencimento?: string | null };
type ListaRemota = { nome?: string; cartoes?: CartaoRemoto[] };

/** Listas que representam "feito" no quadro (o Agente de quadro chama de "Concluído"; Trello/Jira variam). */
const LISTA_CONCLUIDA = /conclu|feit|done|finaliz|entreg|pront|encerrad|complet/i;

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** "Marina Costa" casa com "Marina", "marina costa", "Marina C. Costa"; "Marina Souza" não (primeiro nome igual, sobrenomes diferentes). */
export function ehDaPessoa(responsavel: string, nome: string): boolean {
  const r = normalizar(responsavel);
  const n = normalizar(nome);
  if (!r || !n) return false;
  if (r === n) return true;
  const partesR = r.split(/\s+/);
  const partesN = n.split(/\s+/);
  if (partesR[0] !== partesN[0]) return false;
  if (partesR.length === 1 || partesN.length === 1) return true;
  return partesR.slice(1).some((p) => partesN.slice(1).includes(p));
}

/** O `quadro` que o Agente de quadro devolve em toda resposta de operar_quadro ({ listas: [{ nome, cartoes }] }). */
function extrairListas(resultado: unknown): ListaRemota[] | null {
  if (!resultado || typeof resultado !== "object") return null;
  const quadro = (resultado as { quadro?: { listas?: unknown } }).quadro;
  if (!quadro || !Array.isArray(quadro.listas)) return null;
  return quadro.listas as ListaRemota[];
}

export async function buscarEntregasNoQuadro(nome: string): Promise<EntregaQuadro[]> {
  if (!integracaoConfigurada(MCP_TAREFAS)) throw new QuadroNaoConectado();
  const conexao = await conexaoAutorizada("MCP_TAREFAS");
  if (!conexao) throw new QuadroNaoConectado();

  // Listar não altera nada, então confirmar: true é seguro e é o único modo em que o quadro volta completo na resposta.
  const resultado = await chamar(conectar(conexao.url, conexao.token), "operar_quadro", { comando: "Liste todos os cartões do quadro", confirmar: true });
  const listas = extrairListas(resultado);
  if (!listas) {
    console.error("O quadro conectado não devolveu a lista de cartões:", JSON.stringify(resultado).slice(0, 200));
    throw new Error("O quadro conectado não devolveu a lista de cartões. Confira se o endereço aponta para um quadro de tarefas.");
  }

  const entregas: EntregaQuadro[] = [];
  for (const lista of listas) {
    if (!lista.nome || !LISTA_CONCLUIDA.test(lista.nome)) continue;
    for (const c of lista.cartoes ?? []) {
      if (c.nome && c.responsavel && ehDaPessoa(c.responsavel, nome)) {
        entregas.push({ titulo: c.nome, lista: lista.nome, vencimento: c.vencimento ?? null });
      }
    }
  }
  return entregas;
}

/** Linhas prontas para o campo "Entregas" (uma por cartão). */
export function entregasComoTexto(entregas: EntregaQuadro[]): string {
  return entregas.map((e) => `- ${e.titulo}`).join("\n");
}

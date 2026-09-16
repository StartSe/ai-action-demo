// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { integracaoMCP, MCP_CRM, NOTIFICACOES, openrouter, type Campo, type Integracao, type Opcao } from "./setup-comum";
import { conectar, listarFerramentas, type FerramentaMCP } from "./mcp-cliente";
import { conexaoAutorizada } from "./mcp-oauth";
import { getConfig } from "./store";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que escreve as mensagens de cada lead" });

/** Prefixo das chaves salvas (PROSPECTHALO_URL, PROSPECTHALO_CODIGO, PROSPECTHALO_FERRAMENTA_*...). */
export const PREFIXO_PROSPECTHALO = "PROSPECTHALO";

/** As três operações que este app faz no Prospect Halo; cada uma é uma ferramenta remota escolhida em tempo de execução. */
export type OperacaoProspectHalo = "buscar" | "campanha" | "estado";
export const OPERACOES_PROSPECTHALO: OperacaoProspectHalo[] = ["buscar", "campanha", "estado"];

/** Campo (em "Opções avançadas") onde a pessoa escolhe, numa lista, qual ferramenta remota cumpre cada operação. */
export const CAMPO_FERRAMENTA: Record<OperacaoProspectHalo, string> = {
  buscar: `${PREFIXO_PROSPECTHALO}_FERRAMENTA_BUSCAR`,
  campanha: `${PREFIXO_PROSPECTHALO}_FERRAMENTA_CAMPANHA`,
  estado: `${PREFIXO_PROSPECTHALO}_FERRAMENTA_ESTADO`,
};

/** Valor da opção "Identificar sozinho": o app escolhe a ferramenta por palavras-chave (lib/prospecthalo.ts). */
export const FERRAMENTA_AUTOMATICA = "automatico";

const ROTULO_OPERACAO: Record<OperacaoProspectHalo, string> = {
  buscar: "buscar leads",
  campanha: "criar a campanha de envio",
  estado: "consultar o andamento",
};

/** Lê as escolhas manuais salvas (uma por operação); "Identificar sozinho" e vazio não contam. */
export function mapeamentoManual(): Partial<Record<OperacaoProspectHalo, string>> {
  const manual: Partial<Record<OperacaoProspectHalo, string>> = {};
  for (const op of OPERACOES_PROSPECTHALO) {
    const valor = (getConfig(CAMPO_FERRAMENTA[op]) || "").trim();
    if (valor && valor !== FERRAMENTA_AUTOMATICA) manual[op] = valor;
  }
  return manual;
}

// As opções das três listas vêm de uma única chamada tools/list ao Prospect Halo, com cache curto por
// processo: GET /api/setup pede as opções dos três campos em sequência e não faz sentido chamar o
// serviço remoto três vezes para a mesma resposta.
const CACHE_FERRAMENTAS_MS = 60 * 1000;
let cacheFerramentas: { chave: string; expiraEm: number; ferramentas: FerramentaMCP[] } | null = null;

/** Ferramentas expostas pelo Prospect Halo conectado; lista vazia quando não há conexão ou ela falha. */
export async function ferramentasRemotas(): Promise<FerramentaMCP[]> {
  const conexao = await conexaoAutorizada(PREFIXO_PROSPECTHALO);
  if (!conexao) return [];
  const chave = `${conexao.url}|${conexao.token}`;
  if (cacheFerramentas && cacheFerramentas.chave === chave && cacheFerramentas.expiraEm > Date.now()) return cacheFerramentas.ferramentas;
  try {
    const ferramentas = await listarFerramentas(conectar(conexao.url, conexao.token));
    cacheFerramentas = { chave, expiraEm: Date.now() + CACHE_FERRAMENTAS_MS, ferramentas };
    return ferramentas;
  } catch (err) {
    console.error("Prospect Halo: não foi possível listar as ferramentas para o setup", err);
    return [];
  }
}

const OPCAO_AUTOMATICA: Opcao = { valor: FERRAMENTA_AUTOMATICA, rotulo: "Identificar sozinho (recomendado)" };

function campoFerramenta(op: OperacaoProspectHalo): Campo {
  return {
    chave: CAMPO_FERRAMENTA[op],
    rotulo: `Ferramenta para ${ROTULO_OPERACAO[op]}`,
    tipo: "select",
    opcional: true,
    avancado: true,
    padrao: FERRAMENTA_AUTOMATICA,
    opcoes: [OPCAO_AUTOMATICA],
    ajuda: op === "buscar" ? "Só se o app escolher a ferramenta errada. As listas mostram o que o Prospect Halo oferece depois de autorizar." : undefined,
    opcoesDinamicas: async () => {
      const remotas = await ferramentasRemotas();
      return [OPCAO_AUTOMATICA, ...remotas.map((f) => ({ valor: f.nome, rotulo: f.descricao ? `${f.nome}: ${f.descricao.slice(0, 60)}` : f.nome }))];
    },
  };
}

/**
 * Prospect Halo: servidor MCP remoto (com OAuth) que busca leads no LinkedIn do usuário e envia as
 * mensagens aprovadas da conta dele. Os nomes reais das ferramentas são descobertos em tempo de
 * execução (lib/prospecthalo.ts); as três listas em "Opções avançadas" permitem corrigir a escolha.
 */
export const PROSPECTHALO: Integracao = {
  ...integracaoMCP({
    id: "prospecthalo",
    titulo: "Prospect Halo",
    descricao: "Busca leads no seu LinkedIn e envia as mensagens aprovadas. Sem conectar, a lista sai com dados de exemplo e nada é enviado.",
    ajudaUrl: "Normalmente não precisa mudar: clique em Autorizar e entre com a sua conta do Prospect Halo.",
    urlPadrao: "https://app.prospecthalo.ai/api/agent/v1/mcp",
    rotuloFerramentas: "Ferramentas",
    camposExtras: OPERACOES_PROSPECTHALO.map(campoFerramenta),
    testarExtra: (ferramentas) => {
      const manual = mapeamentoManual();
      const nomes = new Set(ferramentas.map((f) => f.nome));
      const ausentes = OPERACOES_PROSPECTHALO.filter((op) => manual[op] && !nomes.has(manual[op]!));
      if (ausentes.length > 0) {
        return { ok: false, mensagem: `Conectado, mas a ferramenta escolhida para ${ausentes.map((op) => ROTULO_OPERACAO[op]).join(" e ")} não existe mais no Prospect Halo. Volte para "Identificar sozinho" ou escolha outra em Opções avançadas.` };
      }
      return undefined;
    },
  }),
  beneficio: "Busca leads no seu LinkedIn e envia as mensagens aprovadas",
  link: { url: "https://prospecthalo.ai", rotulo: "Criar conta no Prospect Halo" },
};

/** CRM do time de vendas: recebe os leads escolhidos na lista (botão "Enviar para o CRM"). */
export const CRM: Integracao = {
  ...MCP_CRM,
  beneficio: "Manda os leads escolhidos para o CRM do time",
  descricao: "Conecte o CRM onde o time de vendas trabalha (HubSpot, Zendesk e Intercom, por exemplo, expõem um servidor MCP nas configurações de integrações da conta) para mandar os leads escolhidos direto daqui, como contatos.",
};

/** Por onde chegam os leads novos da semana (rotina "Leads novos toda semana") com as mensagens prontas. */
export const AVISOS: Integracao = { ...NOTIFICACOES, beneficio: "Entrega os leads novos da semana com as mensagens prontas" };

export const INTEGRACOES: Integracao[] = [OPENROUTER, PROSPECTHALO, CRM, AVISOS];

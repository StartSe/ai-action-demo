// Sugestão de produto + ICP a partir do site ou de um parágrafo colado (US-007), usada por
// POST /api/produtos/analisar. O resultado nunca é salvo direto: components/ProdutoComIA.tsx sempre
// abre o formulário de edição com a sugestão pré-preenchida.
import { aiEnabled, askJSON, meta } from "./ai";
import { lerPagina } from "./descoberta";
import { esperar } from "./demo";
import type { SugestaoProduto } from "./types";

function pareceEndereco(entrada: string) {
  const t = entrada.trim();
  if (/^https?:\/\//i.test(t)) return true;
  return !/\s/.test(t) && /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t);
}

function normalizarEndereco(entrada: string) {
  const t = entrada.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

const SUGESTAO_DEMO: SugestaoProduto = {
  nome: "CMMS da Zetta Manutenção Industrial",
  descricao: "Sistema de gestão de manutenção industrial que reduz parada não programada de máquinas.",
  propostaValor:
    "Reduz parada não programada de máquinas em indústrias de médio porte que hoje controlam a manutenção em planilha, com implantação em 3 semanas e sem precisar trocar o ERP.",
  icp: {
    nome: "Diretores de Operações em indústrias de médio porte",
    criterios: { setor: "Indústria de alimentos", porte: "51-200 funcionários", localizacao: "São Paulo, Brasil" },
    personas: ["Diretor de Operações", "Gerente de Manutenção"],
    dores: ["Parada não programada de máquinas", "Manutenção controlada em planilha", "Falta de previsibilidade na produção"],
    sinais: ["Abriu vaga para Gerente de Manutenção", "Comentou sobre parada de linha em post público"],
  },
};

const SYSTEM_PRODUTO = `Você lê o texto de um site (ou uma descrição escrita por um vendedor) e devolve um resumo estruturado do produto e do perfil de cliente ideal (ICP), para popular um formulário que a pessoa ainda vai revisar campo a campo.
Regras:
- Português do Brasil, direto, sem clichê de marketing ("solução inovadora", "líder de mercado").
- "descricao" tem uma linha (até 20 palavras). "propostaValor" tem 1 a 2 frases: o problema que o produto resolve e para quem.
- Nunca invente número de clientes, prêmio ou dado que não conste no texto informado.
- "criterios" descreve o tipo de empresa-alvo (setor, porte, localização); deixe um campo de fora quando o texto não permitir inferir.
- No máximo 4 personas (cargos de quem decide ou influencia a compra), 5 dores (problemas que o produto resolve) e 6 sinais de intenção (fatos públicos que indicam que é hora de abordar, ex.: "abriu vaga para X", "anunciou expansão").
Formato de saída (JSON):
{
  "nome": "",
  "descricao": "",
  "propostaValor": "",
  "icp": { "nome": "", "criterios": { "setor": "", "porte": "", "localizacao": "" }, "personas": [], "dores": [], "sinais": [] }
}`;

export async function sugerirProdutoDoSite(entradaBruta: string): Promise<{
  demo: boolean;
  sugestao: SugestaoProduto;
  avisoLeitura?: string;
  meta: ReturnType<typeof meta>;
}> {
  const entrada = entradaBruta.trim();
  const ehEndereco = pareceEndereco(entrada);
  let avisoLeitura: string | undefined;
  let contexto = entrada;

  if (ehEndereco) {
    try {
      const pagina = await lerPagina(normalizarEndereco(entrada));
      if (pagina.demo) {
        avisoLeitura = "A leitura de páginas não está conectada; a sugestão usou só o endereço informado.";
      } else {
        contexto = pagina.conteudo.slice(0, 6000);
      }
    } catch {
      avisoLeitura = "Não foi possível ler o site agora; a sugestão usou só o endereço informado.";
      contexto = entrada;
    }
  }

  if (!aiEnabled()) {
    await esperar(1100);
    return { demo: true, sugestao: SUGESTAO_DEMO, avisoLeitura, meta: meta({ demo: true, insumo: "seu site" }) };
  }

  const prompt = ehEndereco
    ? `Endereço informado: ${entrada}\n\nTexto lido da página (pode estar incompleto ou vazio):\n"""\n${contexto || "(não foi possível ler a página)"}\n"""`
    : `Descrição escrita pelo vendedor sobre o produto:\n"""\n${entrada}\n"""`;

  const bruta = await askJSON<Partial<SugestaoProduto>>({ system: SYSTEM_PRODUTO, prompt, maxTokens: 1500 });
  const icpBruto = bruta.icp || ({} as NonNullable<SugestaoProduto["icp"]>);
  const sugestao: SugestaoProduto = {
    nome: bruta.nome || "",
    descricao: bruta.descricao || "",
    propostaValor: bruta.propostaValor || "",
    icp: {
      nome: icpBruto.nome || "Perfil sugerido",
      criterios: icpBruto.criterios || {},
      personas: (icpBruto.personas || []).slice(0, 4),
      dores: (icpBruto.dores || []).slice(0, 5),
      sinais: (icpBruto.sinais || []).slice(0, 6),
    },
  };
  return { demo: false, sugestao, avisoLeitura, meta: meta({ demo: false, insumo: "seu site" }) };
}

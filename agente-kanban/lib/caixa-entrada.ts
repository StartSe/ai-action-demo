// Caixa de entrada pública: qualquer pessoa da empresa pede algo por um link (/f/[código]) e
// o agente cria o cartão certo no quadro, sem passar pelo gestor. Próprio deste app (não replicado).
import { aiEnabled, askJSON, meta } from "./ai";
import type { Desfazer, ResultadoAgente } from "./agente";
import { criar, listarRespostas, registrarCallback, type CampoFormulario, type ParametrosPublicos } from "./formularios";
import { salvar } from "./historico";
import { trelloConfigurado, type Etiqueta } from "./quadro";
import { quadroDemoPara } from "./quadro-demo";
import { mcpTarefasConfigurado, quadroMcp } from "./quadro-mcp";
import { trello } from "./trello";

export const TIPO_PEDIDO = "pedido-quadro";

const CAMPOS_PEDIDO: CampoFormulario[] = [
  { chave: "quemPede", rotulo: "Seu nome", tipo: "texto", obrigatorio: true },
  { chave: "oQuePrecisa", rotulo: "O que você precisa", tipo: "textarea", obrigatorio: true },
  { chave: "urgencia", rotulo: "Urgência (alta, média ou baixa)", tipo: "texto", obrigatorio: true },
  { chave: "prazoDesejado", rotulo: "Prazo desejado", tipo: "texto" },
];

/** Parâmetro próprio deste link: quem é o "dono" do quadro de exemplo onde o cartão deve nascer, quando o Trello não está conectado. */
type ParametrosPedido = ParametrosPublicos & { visitanteId: string };

function provedorPara(visitanteId: string) {
  if (mcpTarefasConfigurado()) return quadroMcp;
  return trelloConfigurado() ? trello : quadroDemoPara(visitanteId);
}

function normalizarEtiqueta(texto: string): Etiqueta {
  const semAcento = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/alta|urgente|critic/.test(semAcento)) return "alta";
  if (/baixa|sem pressa|tranquil/.test(semAcento)) return "baixa";
  return "media";
}

/** Escolhe em qual coluna o pedido entra: com IA, pergunta ao modelo; sem IA, entra sempre na primeira coluna (a "entrada" natural de um quadro Kanban). */
async function escolherLista(listas: { id: string; nome: string }[], pedido: string): Promise<string> {
  if (listas.length <= 1) return listas[0]?.id ?? "";
  if (!aiEnabled()) return listas[0].id;
  try {
    const resposta = await askJSON<{ listaId: string }>({
      system:
        'Você escolhe em qual coluna de um quadro Kanban um novo pedido deve entrar. Responda só com JSON no formato {"listaId": "..."}, usando exatamente um dos IDs informados.',
      prompt: `Colunas disponíveis:\n${listas.map((l) => `${l.id}: ${l.nome}`).join("\n")}\n\nPedido recebido: "${pedido}"\n\nQual coluna é a mais adequada para este pedido entrar?`,
    });
    if (listas.some((l) => l.id === resposta.listaId)) return resposta.listaId;
  } catch {
    // segue para o palpite padrão abaixo
  }
  return listas[0].id;
}

/** Cria o link público (/f/<código>) da caixa de entrada; `visitanteId` é quem verá o cartão nascer no próprio quadro de exemplo, quando o Trello não está conectado. */
export function criarLink(visitanteId: string): string {
  const parametros: ParametrosPedido = {
    marca: "K",
    nome: "Agente de Kanban",
    titulo: "Peça algo para o quadro",
    descricao: "Conte o que você precisa; um cartão é criado automaticamente na coluna certa, com a urgência marcada.",
    visitanteId,
  };
  return criar({ tipo: TIPO_PEDIDO, campos: CAMPOS_PEDIDO, parametros });
}

/** Respostas já recebidas por este link, para a lista "Pedidos recebidos" do painel. */
export function pedidosRecebidos(codigo: string) {
  return listarRespostas<{ quemPede: string; oQuePrecisa: string; urgencia: string; prazoDesejado?: string }>(codigo);
}

registrarCallback(TIPO_PEDIDO, async ({ dados, parametros }) => {
  const { visitanteId } = parametros as ParametrosPedido;
  const provedor = provedorPara(visitanteId);
  const listas = await provedor.listarListas();
  const etiqueta = normalizarEtiqueta(dados.urgencia || "");
  const listaId = await escolherLista(listas, dados.oQuePrecisa || "");
  const lista = listas.find((l) => l.id === listaId);

  const nome = (dados.oQuePrecisa || "Novo pedido").split("\n")[0].slice(0, 120);
  const partesDescricao = [`Pedido de ${dados.quemPede || "alguém da empresa"} pela caixa de entrada.`, dados.oQuePrecisa || ""];
  if (dados.prazoDesejado) partesDescricao.push(`Prazo desejado: ${dados.prazoDesejado}.`);
  const descricao = partesDescricao.filter(Boolean).join(" ");

  const cartao = await provedor.criarCartao({ nome, descricao, listaId, etiqueta });
  const quadro = await provedor.obterQuadro();
  const textoResposta = `Criei o cartão "${cartao.nome}" em "${lista?.nome ?? ""}" a partir do pedido de ${dados.quemPede || "alguém da empresa"}.`;
  const desfazer: Desfazer = { tipo: "criar_cartao", cartaoId: cartao.id, nome: cartao.nome };
  const resultado: ResultadoAgente = {
    resposta: textoResposta,
    acoes: [{ tipo: "criar_cartao", descricao: textoResposta }],
    quadro,
    alterados: [cartao.id],
    desfazer,
  };
  const metaGerada = meta({ demo: !aiEnabled(), insumo: "o pedido recebido pela caixa de entrada pública" });
  const resultadoId = salvar({
    tipo: "agente-kanban",
    titulo: `Pedido de ${dados.quemPede || "alguém"}: ${cartao.nome}`,
    entrada: { mensagem: `Pedido recebido pela caixa de entrada: ${dados.oQuePrecisa || ""}` },
    saida: resultado,
    meta: metaGerada,
  });
  return { resultadoId };
});

// O que este app expõe a um assistente pelo endereço /mcp. Próprio do app (app/mcp/route.ts é
// idêntico em toda a suíte e importa daqui).
//
// Nenhuma função abaixo duplica prompt ou conta: todas chamam as mesmas funções de lib/carteira.ts
// que as rotas HTTP chamam.
import { montarCarteira, precificarItem, simular } from "./carteira";
import { listarCanais } from "./canais";
import { moeda, percentual } from "./formato";
import { diagnosticarMix } from "./ia";
import { listarItens } from "./itens";
import { obterNegocio } from "./negocio";
import { ROTULO_ESTADO } from "./rotulos";
import type { Ferramenta } from "./mcp";

export const NOME_SERVIDOR = "precificador";

/** A versão que o app mostra em Configurações e devolve em /api/health. */
export { version as VERSAO } from "../package.json";

function semNegocio() {
  return { erro: "Nenhum negócio foi configurado ainda. Abra o app e preencha a tela Negócio." };
}

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "listar_itens",
    descricao: "Lista os itens precificados com preço, margem líquida real e situação no canal padrão.",
    schema: { type: "object", properties: {}, required: [] },
    executar: async () => {
      const { linhas, noVermelho, abaixoDoAlvo } = montarCarteira();
      if (linhas.length === 0) return { itens: [], aviso: "Nenhum item cadastrado." };
      return {
        noVermelho,
        abaixoDoAlvo,
        itens: linhas.map((l) => ({
          id: l.item.id,
          nome: l.item.nome,
          canal: l.canal.nome,
          preco: moeda(l.preco),
          margemLiquida: percentual(l.derivados.margemLiquidaPct),
          margemAlvo: percentual(l.margemAlvoPct),
          situacao: ROTULO_ESTADO[l.estado],
        })),
      };
    },
  },
  {
    nome: "precificar_item",
    descricao: "Devolve o corredor de preço completo de um item: piso de prejuízo, piso da margem-alvo, faixa de mercado, teto de valor e os números derivados do preço atual.",
    schema: {
      type: "object",
      properties: {
        item: { type: "string", description: "Nome ou id do item." },
        canal: { type: "string", description: "Nome do canal de venda. Sem isso, usa o canal padrão." },
      },
      required: ["item"],
    },
    executar: async (args) => {
      const negocio = obterNegocio();
      if (!negocio) return semNegocio();
      const busca = String(args.item || "").trim().toLowerCase();
      const itens = listarItens(negocio.id);
      const item = itens.find((i) => i.id === args.item) ?? itens.find((i) => i.nome.toLowerCase().includes(busca));
      if (!item) return { erro: `Nenhum item chamado "${args.item}". Use listar_itens para ver os nomes.` };

      // Os canais vêm de listarCanais, não da carteira: a carteira só carrega o canal padrão, e
      // procurar ali faria "iFood" cair silenciosamente de volta no balcão.
      const nomeCanal = String(args.canal || "").trim().toLowerCase();
      const canais = listarCanais(negocio.id);
      const escolhido = nomeCanal ? canais.find((c) => c.nome.toLowerCase().includes(nomeCanal)) : undefined;
      if (nomeCanal && !escolhido) return { erro: `Nenhum canal chamado "${args.canal}". Os canais são: ${canais.map((c) => c.nome).join(", ")}.` };
      const canalId = escolhido?.id;

      const atual = precificarItem(item.id, canalId);
      if (!atual) return { erro: "Não foi possível montar o cenário deste item." };
      const { corredor, derivados, cascata } = atual.precificacao;

      return {
        item: item.nome,
        canal: atual.cenario.canal.nome,
        precoEscolhido: moeda(derivados.preco),
        corredor: {
          pisoDePrejuizo: moeda(corredor.pisoPrejuizo),
          pisoDaMargemAlvo: corredor.pisoMargemAlvo === null ? null : moeda(corredor.pisoMargemAlvo),
          faixaDeMercado: corredor.mercado ? `${moeda(corredor.mercado.min)} a ${moeda(corredor.mercado.max)}` : null,
          tetoDeValor: corredor.tetoValor === null ? null : moeda(corredor.tetoValor),
          margemNaoCabe: corredor.impossivel ? corredor.impossivel.message : null,
        },
        custo: { direto: moeda(corredor.custo.direto), fixoRateado: moeda(corredor.custo.rateioFixo), total: moeda(corredor.custo.total) },
        derivados: {
          lucro: moeda(derivados.lucro),
          margemLiquida: percentual(derivados.margemLiquidaPct),
          descontoMaximo: percentual(derivados.descontoMaximoPct),
          pontoEquilibrio: derivados.pontoEquilibrio === null ? null : `${Math.ceil(derivados.pontoEquilibrio)} por mês`,
          situacao: ROTULO_ESTADO[derivados.estado],
        },
        cascata: cascata.fatias.map((f) => ({ [f.rotulo]: moeda(f.valor) })),
      };
    },
  },
  {
    nome: "listar_itens_no_vermelho",
    descricao: "Lista só os itens cujo preço atual não cobre o custo mais o imposto e a taxa do canal.",
    schema: { type: "object", properties: {}, required: [] },
    executar: async () => {
      const { linhas } = montarCarteira();
      const vermelhos = linhas.filter((l) => l.estado === "prejuizo");
      if (vermelhos.length === 0) return { itens: [], resumo: "Nenhum item está no vermelho." };
      return {
        resumo: `${vermelhos.length} de ${linhas.length} itens estão no vermelho.`,
        itens: vermelhos.map((l) => ({
          nome: l.item.nome,
          preco: moeda(l.preco),
          custoTotal: moeda(l.custo.total),
          precoDeLucroZero: moeda(l.derivados.precoLucroZero),
          perdaPorUnidade: moeda(Math.abs(l.derivados.lucro)),
        })),
      };
    },
  },
  {
    nome: "simular_alta_de_custo",
    descricao: "Mostra quais itens saem da margem-alvo se um insumo, ou o custo fixo do mês, subir de preço. Mantém os preços atuais e não altera nada.",
    schema: {
      type: "object",
      properties: {
        aumentoPct: { type: "number", description: "Aumento em fração: 0.2 para 20%." },
        alvo: { type: "string", enum: ["insumo", "custo-fixo"], description: 'O que sobe. Padrão: "insumo".' },
        insumo: { type: "string", description: 'Nome do insumo, quando o alvo é "insumo". Sem isso, simula um aumento em todos.' },
      },
      required: ["aumentoPct"],
    },
    executar: async (args) => {
      const aumento = Number(args.aumentoPct);
      if (!Number.isFinite(aumento) || aumento <= 0) return { erro: "Informe um aumento maior que zero, em fração (0.2 para 20%)." };
      const afetados = simular(aumento, { alvo: args.alvo === "custo-fixo" ? "custo-fixo" : "insumo", nomeInsumo: typeof args.insumo === "string" ? args.insumo : undefined });
      if (afetados.length === 0) return { afetados: [], resumo: "Nenhum item muda de situação com esse aumento." };
      return {
        resumo: `${afetados.length} ${afetados.length === 1 ? "item muda" : "itens mudam"} de margem com esse aumento.`,
        afetados: afetados.map((a) => ({
          nome: a.item.nome,
          preco: moeda(a.preco),
          margemAntes: percentual(a.margemAntes),
          margemDepois: percentual(a.margemDepois),
          situacaoAntes: ROTULO_ESTADO[a.estadoAntes],
          situacaoDepois: ROTULO_ESTADO[a.estadoDepois],
        })),
      };
    },
  },
  {
    nome: "diagnosticar_mix",
    descricao: "Lê a carteira inteira e diz o que corrigir primeiro. Usa a IA configurada no app; sem chave, devolve um exemplo.",
    schema: { type: "object", properties: {}, required: [] },
    executar: async () => {
      const { linhas } = montarCarteira();
      if (linhas.length === 0) return { erro: "Nenhum item cadastrado ainda." };
      const { diagnostico, meta } = await diagnosticarMix();
      return { ...diagnostico, exemplo: meta.demo };
    },
  },
];

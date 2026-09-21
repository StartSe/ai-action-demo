// O assistente que responde sobre o negócio que já existe. Server-only.
//
// A conversa de abertura (lib/conversa.ts) preenche o negócio de quem está começando. Este aqui é o
// outro lado: quem já tem itens cadastrados não quer preencher de novo, quer perguntar — "qual item
// está me dando prejuízo?", "posso dar 15% no marketplace?", "o queijo subiu 20%, o que reajusto?".
//
// Ele não recebe a carteira inteira no prompt: recebe **as mesmas cinco ferramentas que o app já
// expõe em /mcp** (lib/ferramentas.ts) e chama as que precisar. Isso vale por três motivos:
//
//  1. Não há segunda implementação. A conta que responde ao assistente é a mesma que responde à
//     tela, porque as duas passam por lib/carteira.ts.
//  2. A resposta é sobre os números de agora, não sobre uma foto colada no prompt.
//  3. Uma carteira de quarenta itens não precisa caber no contexto.
//
// A IA continua sem calcular: toda ferramenta devolve número já pronto de lib/precificacao.
import { aiEnabled, meta, type Meta } from "./ai";
import { completar, ferramentaDeBusca, type ChamadaDeFerramenta, type Fonte, type MensagemChat } from "./busca";
import { montarCarteira } from "./carteira";
import { esperar } from "./demo";
import { FERRAMENTAS } from "./ferramentas";
import { moeda, percentual } from "./formato";
import { modeloPara } from "./modelos-do-app";
import { ROTULO_ESTADO } from "./rotulos";
import type { Fala } from "./conversa";

/** Quantas idas e voltas de ferramenta antes de desistir. Na prática duas bastam. */
const MAX_VOLTAS = 4;
/** Quantas falas da conversa vão no prompt. */
const MEMORIA = 20;

const SISTEMA = `Você é o assistente de preços de um pequeno negócio brasileiro. O dono já cadastrou
os itens dele neste app e agora quer perguntar sobre eles.

Como responder:
- Direto ao ponto. Comece pela resposta, não por um resumo do que ele perguntou.
- Português do Brasil, frases curtas, sem jargão de consultoria.
- Texto puro: nada de negrito, título ou marcação. Lista, quando precisar, com um hífen por linha.
- Use as ferramentas para pegar os números. Nunca invente um número, nunca calcule de cabeça:
  todo valor que você disser tem que ter vindo de uma ferramenta.
- Quando a resposta for sobre um item, diga o nome dele.
- Quando não houver dado suficiente, diga o que falta preencher no app em vez de supor.
- No máximo três recomendações por resposta, cada uma acionável.

Você também pode consultar a internet, e só deve fazer isso para um número público que muda com o
tempo — o valor do DAS deste ano, a alíquota de um anexo, a taxa que um aplicativo cobra hoje.
Nunca busque na internet o custo ou o preço deste negócio: isso está nas ferramentas.`;

/** As ferramentas do app no formato de função que o modelo entende. */
function ferramentasDoApp(): Record<string, unknown>[] {
  return FERRAMENTAS.map((f) => ({
    type: "function",
    function: { name: f.nome, description: f.descricao, parameters: f.schema },
  }));
}

async function executar(chamada: ChamadaDeFerramenta): Promise<string> {
  const ferramenta = FERRAMENTAS.find((f) => f.nome === chamada.function.name);
  if (!ferramenta) return JSON.stringify({ erro: `Não existe a ferramenta ${chamada.function.name}.` });
  try {
    const args = chamada.function.arguments ? JSON.parse(chamada.function.arguments) : {};
    return JSON.stringify(await ferramenta.executar(args));
  } catch (err) {
    console.error(`A ferramenta ${chamada.function.name} falhou:`, err);
    return JSON.stringify({ erro: "Não consegui consultar isso agora." });
  }
}

export type RespostaAssistente = { resposta: string; fontes: Fonte[]; meta: Meta };

/** Resposta de exemplo sem chave de IA: usa os números reais da carteira, só o texto é fixo. */
function exemplo(): RespostaAssistente {
  const { linhas, noVermelho, abaixoDoAlvo } = montarCarteira();
  const piores = [...linhas].sort((a, b) => a.derivados.margemLiquidaPct - b.derivados.margemLiquidaPct);
  const pior = piores[0];

  const partes = [
    noVermelho > 0
      ? `${noVermelho} ${noVermelho === 1 ? "item está" : "itens estão"} no vermelho.`
      : abaixoDoAlvo > 0
        ? `Nenhum item no vermelho, mas ${abaixoDoAlvo} ${abaixoDoAlvo === 1 ? "está" : "estão"} abaixo da margem-alvo.`
        : "Todos os seus itens estão dentro da margem-alvo.",
    pior
      ? `O que está pior é ${pior.item.nome}: ${percentual(pior.derivados.margemLiquidaPct)} de margem a ${moeda(pior.preco)} no ${pior.canal.nome}, situação ${ROTULO_ESTADO[pior.estado].toLowerCase()}.`
      : "",
    pior && pior.derivados.descontoMaximoPct > 0 ? `Nele, o desconto máximo sem sair do lucro é ${percentual(pior.derivados.descontoMaximoPct)}.` : "",
    "Conecte a inteligência artificial em Configurações para eu responder à sua pergunta de verdade, e não com este resumo pronto.",
  ];

  return { resposta: partes.filter(Boolean).join(" "), fontes: [], meta: meta({ demo: true, insumo: `${linhas.length} itens` }) };
}

/**
 * Responde a uma pergunta sobre a carteira, chamando as ferramentas do app até ter o que precisa.
 *
 * O laço é manual porque `askWithTools` (lib/ai.ts, infraestrutura) não convive com a ferramenta de
 * busca do OpenRouter, que roda no servidor deles. Aqui as duas coisas andam na mesma chamada: as
 * funções do app o app executa, a busca o OpenRouter executa.
 */
export async function perguntarAoAssistente(falas: Fala[]): Promise<RespostaAssistente> {
  if (!aiEnabled()) {
    await esperar();
    return exemplo();
  }

  const modelo = modeloPara("leitura");
  const mensagens: MensagemChat[] = [
    { role: "system", content: SISTEMA },
    ...falas.slice(-MEMORIA).map((f): MensagemChat => ({ role: f.de === "pessoa" ? "user" : "assistant", content: f.texto })),
  ];
  const ferramentas = [...ferramentasDoApp(), ferramentaDeBusca()];
  const fontes: Fonte[] = [];

  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const r = await completar({ mensagens, ferramentas, model: modelo, maxTokens: 1400, temperature: 0.3 });
    for (const f of r.fontes) if (!fontes.some((x) => x.url === f.url)) fontes.push(f);

    if (r.chamadas.length === 0) {
      const resposta = r.conteudo.trim();
      if (resposta) return { resposta, fontes, meta: meta({ demo: false, insumo: "carteira", model: modelo }) };
      break;
    }

    mensagens.push({ role: "assistant", content: r.conteudo || null, tool_calls: r.chamadas });
    for (const chamada of r.chamadas) {
      mensagens.push({ role: "tool", tool_call_id: chamada.id, content: await executar(chamada) });
    }
  }

  // Estourou as voltas sem uma resposta em texto: melhor dizer isso do que devolver vazio.
  return {
    resposta: "Consultei seus números mas me perdi no caminho. Pergunte de novo, de um jeito mais direto — por exemplo: qual item está no vermelho?",
    fontes,
    meta: meta({ demo: false, insumo: "carteira", model: modelo }),
  };
}

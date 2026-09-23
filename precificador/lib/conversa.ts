// A conversa de abertura: a IA pergunta sobre o negócio e propõe o preenchimento inteiro.
// Server-only.
//
// Por que existe: a tela Negócio pede rateio, balde e alíquota efetiva de alguém que só sabe que
// paga R$ 2.800 de aluguel e faz uns cem pães por dia. A conversa traduz — ela coleta em linguagem
// de dono de negócio e devolve um rascunho das **entradas**, que a pessoa revisa antes de aplicar.
//
// A IA continua sem calcular: ela nunca propõe preço, margem realizada nem lucro. Propõe custo,
// capacidade, tempo e insumo; quem vira isso em preço é lib/precificacao.
import { aiEnabled, askText, meta, type Meta } from "./ai";
import { buscaDisponivel, perguntarComBusca, type Fonte } from "./busca";
import { esperar } from "./demo";
import { modeloPara } from "./modelos-do-app";
import { obterPreset } from "./presets";
import { FORMATO_PROPOSTA, lerProposta, semProposta, type Proposta } from "./proposta";

export type Fala = { de: "pessoa" | "assistente"; texto: string };

/** Quantas falas vão no prompt. O bastante para a conversa ter memória sem estourar contexto. */
const MEMORIA = 20;

export const PRIMEIRA_FALA =
  "Me conta do seu negócio: o que você vende e como. Pode escrever do seu jeito — eu pergunto o resto e no fim deixo tudo preenchido para você conferir.";

const SISTEMA = `Você conversa com o dono de um pequeno negócio brasileiro que quer descobrir se está cobrando certo.
Ele não é contador. Você está coletando o que o app precisa para calcular os preços dele.

Como conduzir:
- Uma ou duas perguntas por vez, nunca um questionário inteiro de uma vez.
- Pergunte em linguagem de negócio: "quanto você paga de aluguel por mês", não "informe os custos fixos indiretos".
- Aceite resposta aproximada. "Uns 3 mil" é um número bom o suficiente para começar.
- Nunca explique teoria de precificação. Nunca use "otimizar", "alavancar", "sinergia", "markup" ou "rateio".
- Português do Brasil, frases curtas.
- Responda apenas o que o dono vai ler. Nunca escreva o seu raciocínio, nunca escreva em inglês, nunca comente a própria tarefa.

Você tem uma ferramenta de busca na internet. Use-a só quando precisar de um número público que
muda com o tempo e que não convém chutar: o valor do DAS do MEI neste ano, a alíquota efetiva de um
anexo do Simples, a taxa que um aplicativo de entrega cobra hoje, a faixa de preço praticada num
ramo. Diga de onde veio o número que trouxer.

Nunca busque o custo ou o preço deste negócio em particular — isso só o dono sabe, e é ele que você
tem que perguntar. Na dúvida entre buscar e perguntar, pergunte.

O que você precisa descobrir, nesta ordem de importância:
1. O que ele vende (produto, serviço ou os dois) e dois ou três itens concretos.
2. Os custos que ele paga todo mês mesmo sem vender nada: aluguel, energia, internet, contador, prestações.
3. Quanto ele consegue produzir ou atender num mês normal, e quantas horas por mês ele de fato trabalha nisso.
4. Quanto ele quer tirar por mês para si.
5. Onde ele vende e quanto cada lugar cobra dele: loja, maquininha, aplicativo, marketplace.
6. O regime: MEI, Simples ou Lucro presumido. Se ele não souber, assuma MEI para negócio pequeno.
7. Para cada item, o que entra nele: os dois ou três materiais principais, com quanto usa e por quanto compra, e quantos minutos leva.

Enquanto estiver só conversando, responda com as perguntas e nada mais.

Quando tiver o suficiente para começar — não precisa de tudo, precisa do bastante — responda
exatamente neste formato, sem markdown e sem nenhum comentário fora dele:

${FORMATO_PROPOSTA}

Regras do bloco:
- Toda linha de insumo começa pelo nome exato do item a que ele pertence, como neste exemplo:
  item: X-Salada | produto | 8 | 5
  insumo: X-Salada | Pão | 1 | un | 8 | un | 12
  insumo: X-Salada | Carne | 120 | g | 1 | kg | 38
- Nunca proponha preço de venda, margem obtida nem lucro. O app calcula isso sozinho a partir do que você propôs.
- Use números que ele te deu. Onde ele não deu e você precisa de algo, use um valor comum do ramo dele e diga na frase anterior que chutou.
- No MEI, não cadastre imposto em percentual: acrescente uma linha fixo com o DAS.
- Só escreva o bloco uma vez, quando for propor. Nas outras respostas, converse normalmente sem ele.`;

export type RespostaConversa = { resposta: string; proposta: Proposta | null; fontes: Fonte[]; meta: Meta };

/** O histórico virando um prompt só: `askText` (infraestrutura) não recebe lista de mensagens. */
function transcrever(falas: Fala[]): string {
  return falas
    .slice(-MEMORIA)
    .map((f) => `${f.de === "pessoa" ? "Dono" : "Você"}: ${f.texto}`)
    .join("\n\n");
}

/**
 * Sem chave de IA, a conversa segue um roteiro curto e termina no rascunho da padaria.
 *
 * Não é a experiência real, e a tela diz isso — mas mostra o que a conversa faz e o rascunho que
 * sai dela é aplicável de verdade, então dá para seguir o fluxo inteiro sem conectar nada.
 */
function exemplo(falas: Fala[]): { resposta: string; proposta: Proposta | null } {
  const rodada = falas.filter((f) => f.de === "pessoa").length;

  if (rodada <= 1) {
    return {
      resposta:
        "Entendi. Agora me diz o que você paga todo mês mesmo quando não vende nada: aluguel, energia, internet, contador. Valor aproximado já serve.",
      proposta: null,
    };
  }
  if (rodada === 2) {
    return {
      resposta: "Certo. E num mês normal, quanto você consegue produzir? Quantas horas por mês você trabalha nisso, e quanto gostaria de tirar para você?",
      proposta: null,
    };
  }

  const padaria = obterPreset("padaria")!;
  return {
    resposta:
      "Montei um rascunho com o que você contou e com valores comuns de uma padaria no lugar do que faltou. Confira os números, mude o que estiver errado e aplique — depois dá para ajustar tudo item por item.",
    proposta: {
      negocio: {
        nome: padaria.negocio.nome,
        regime: padaria.negocio.regime,
        modoCapacidade: padaria.negocio.modoCapacidade,
        volumeMensalUnidades: padaria.negocio.volumeMensalUnidades,
        horasProdutivasMes: padaria.negocio.horasProdutivasMes,
        proLaboreMensal: padaria.negocio.proLaboreMensal,
        margemAlvoPadraoPct: padaria.negocio.margemAlvoPadraoPct,
      },
      fixos: padaria.custosFixos.map((f) => ({ ...f })),
      canais: padaria.canais.map((c) => ({ nome: c.nome, taxaPct: c.taxaPct, taxaFixa: c.taxaFixa, padrao: Boolean(c.padrao) })),
      itens: padaria.itens.map((i) => ({
        nome: i.nome,
        tipo: i.tipo,
        tempoMinutos: i.tempoMinutos,
        perdaPct: i.perdaPct,
        insumos: i.insumos.map((l) => ({ ...l })),
      })),
    },
  };
}

export async function conversar(falas: Fala[]): Promise<RespostaConversa> {
  if (!aiEnabled()) {
    await esperar();
    const { resposta, proposta } = exemplo(falas);
    return { resposta, proposta, fontes: [], meta: meta({ demo: true, insumo: "conversa de exemplo" }) };
  }

  // A conversa é a tarefa mais difícil do app: ela sai do texto solto de alguém e entrega um
  // rascunho estruturado. É a única que usa o modelo mais capaz do nível escolhido.
  const modelo = modeloPara("conversa");
  const transcrito = transcrever(falas);

  // A busca é uma ferramenta que o modelo aciona se quiser — por isso a conversa inteira passa por
  // `perguntarComBusca`, e não por `askText`. Quando ele não precisa de fato público nenhum, não há
  // busca e não há custo de busca.
  if (buscaDisponivel()) {
    try {
      const comBusca = await perguntarComBusca({
        system: SISTEMA,
        prompt: `${transcrito}\n\nResponda à última mensagem do dono.`,
        model: modelo,
        maxTokens: 1600,
        temperature: 0.5,
      });
      return montar(comBusca, modelo);
    } catch (err) {
      // A ferramenta de busca ainda é Beta no OpenRouter: se ela falhar, a conversa segue sem ela
      // em vez de morrer. Perder o valor do DAS não pode custar a conversa inteira.
      console.error("A conversa com busca falhou; seguindo sem busca.", err);
    }
  }

  const texto = await askText({
    system: SISTEMA,
    prompt: `${transcrito}\n\nResponda à última mensagem do dono.`,
    maxTokens: 1600,
    temperature: 0.5,
    model: modelo,
  });
  return montar({ texto, fontes: [] }, modelo);
}

function montar({ texto, fontes }: { texto: string; fontes: Fonte[] }, modelo: string): RespostaConversa {
  const proposta = lerProposta(texto);
  const resposta = semProposta(texto) || (proposta ? "Montei um rascunho do seu negócio. Confira os números e mude o que estiver errado." : texto.trim());
  return { resposta, proposta, fontes, meta: meta({ demo: false, insumo: "conversa", model: modelo }) };
}

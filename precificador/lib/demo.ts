// Respostas de exemplo usadas quando nenhuma chave de IA está configurada. Tudo o que o app faz de
// conta continua real em modo demonstração — o motor (lib/precificacao) não depende de IA nenhuma;
// só os três blocos de texto abaixo são fixos.
import { percentual } from "./formato";
import type { CustosEsquecidos, DiagnosticoMix, Estado, LeituraCorredor } from "./types";

/** Segura a resposta pelo tempo de uma chamada real, para a tela não piscar. */
export function esperar(ms = 900 + Math.random() * 600): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Leitura de exemplo do corredor. Ao contrário de um texto totalmente fixo, ela varia com o estado
 * e com a margem de verdade do item — são números que o motor já calculou, não a IA.
 */
export function leituraCorredorExemplo({ estado, margemLiquidaPct, descontoMaximoPct, nomeItem }: { estado: Estado; margemLiquidaPct: number; descontoMaximoPct: number; nomeItem: string }): LeituraCorredor {
  if (estado === "prejuizo") {
    return {
      resumo: `Neste preço, ${nomeItem} sai de casa custando mais do que entra. Cada venda aumenta o buraco em vez de fechá-lo, e o volume só piora a conta.`,
      acoes: ["Suba o preço até o primeiro marcador da régua", "Confira se a ficha tem algum insumo com quantidade errada", "Veja se o canal escolhido é o mais barato para este item"],
      risco: "Vender mais deste item hoje aumenta o prejuízo, não o faturamento.",
    };
  }
  if (estado === "abaixo-do-alvo") {
    return {
      resumo: `${nomeItem} dá lucro, mas abaixo do que você definiu: ${percentual(margemLiquidaPct)} contra a margem que você quer. Dá para trabalhar assim, desde que seja escolha sua e não descuido.`,
      acoes: ["Suba o preço até o segundo marcador para bater a margem-alvo", "Ou reduza o custo direto revendo a linha mais cara da ficha"],
      risco: "Um aumento de insumo joga este item para o vermelho rápido.",
    };
  }
  if (estado === "acima-do-teto") {
    return {
      resumo: `O preço está acima do teto de valor que você declarou. A margem é boa, mas o cliente pode achar caro e ir para o concorrente antes de perguntar o porquê.`,
      acoes: ["Confira se o teto de valor ainda reflete o que o cliente compara", "Se o preço se sustenta, deixe claro na venda o que justifica a diferença"],
    };
  }
  return {
    resumo: `${nomeItem} está na faixa saudável: ${percentual(margemLiquidaPct)} de margem líquida, acima do custo e dentro do que o mercado pratica.`,
    acoes: [`Você pode dar até ${percentual(descontoMaximoPct)} de desconto sem sair do lucro`, "Repita a ficha deste item nos outros da mesma família"],
  };
}

/** Interrogatório de exemplo: as perguntas que quase todo pequeno negócio esquece. */
export function custosEsquecidosExemplo(tipo: "produto" | "servico"): CustosEsquecidos {
  const comuns = [
    { pergunta: "A embalagem está na ficha?", porque: "Saco, caixa, etiqueta e fita somam mais do que parece por unidade." },
    { pergunta: "Quanto tempo seu de trabalho essa peça consome?", porque: "Sem o tempo, seu pró-labore não entra no preço e você trabalha de graça." },
    { pergunta: "Você perde alguma parte no processo?", porque: "Aparas, refugo e erro de produção são custo que já saiu do caixa." },
  ];
  const deServico = [
    { pergunta: "O deslocamento até o cliente está contado?", porque: "Combustível e o tempo no trânsito saem da sua hora produtiva." },
    { pergunta: "Quantas revisões estão incluídas?", porque: "Revisão sem limite é hora trabalhada que ninguém pagou." },
  ];
  const deProduto = [
    { pergunta: "O frete da compra do insumo entrou no custo?", porque: "O preço da nota raramente é o que o insumo custou de verdade." },
    { pergunta: "Você paga taxa de cartão nesse canal?", porque: "A taxa sai do preço antes de virar lucro; cadastre o canal certo." },
  ];
  return {
    abertura: "Faltam alguns custos que costumam passar batido neste tipo de item.",
    perguntas: [...comuns, ...(tipo === "servico" ? deServico : deProduto)],
  };
}

/** Diagnóstico de exemplo do mix. Usa os nomes reais dos itens que estão fora do alvo. */
export function diagnosticoMixExemplo(piores: string[]): DiagnosticoMix {
  if (piores.length === 0) {
    return {
      resumo: "Todos os itens da sua carteira estão na faixa saudável. O próximo ganho vem de vender mais do que já dá lucro, não de mexer em preço.",
      prioridades: [],
      ponto_forte: "Nenhum item abaixo da margem-alvo.",
    };
  }
  return {
    resumo:
      piores.length === 1
        ? `${piores[0]} está puxando sua margem para baixo. Corrigir esse item sozinho já muda o resultado do mês.`
        : `${piores.length} itens estão puxando sua margem para baixo. Corrigir os dois primeiros costuma valer mais do que ajustar todos de uma vez.`,
    prioridades: piores.slice(0, 3).map((item, i) => ({
      item,
      observacao: i === 0 ? "É o que está mais longe da margem-alvo." : "Está abaixo do alvo e vende com frequência.",
      acao: i === 0 ? "Suba o preço até o marcador da margem-alvo ou reveja a ficha." : "Ajuste o preço no canal padrão e confira os outros canais depois.",
    })),
    ponto_forte: "O resto da carteira está no azul.",
  };
}

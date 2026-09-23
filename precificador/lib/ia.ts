// Os três textos que a IA escreve neste app. Server-only.
//
// Princípio 4 do produto, aqui virado em contrato: **a IA interpreta, nunca calcula**. Toda função
// abaixo recebe números que lib/precificacao já produziu, manda esses números prontos no prompt e
// recebe de volta um objeto sem nenhum campo numérico (ver lib/types.ts). Se um número aparecer no
// texto, ele veio interpolado por nós ou o modelo copiou o que mandamos — nunca de uma conta dele.
//
// Sem chave configurada, cada função cai para lib/demo.ts: o app inteiro continua funcionando.
//
// As respostas vêm em texto simples, não em JSON: modelo gratuito erra JSON com frequência e o
// erro "a IA respondeu em um formato inesperado" não se justifica num app em que ela só escreve
// prosa. lib/leitura-ia.ts lê o texto com tolerância e, quando o modelo foge do formato, o
// exemplo de lib/demo.ts entra no lugar — nunca um erro na tela.
import { aiEnabled, askText, meta, type Meta } from "./ai";
import { montarCarteira } from "./carteira";
import { custosEsquecidosExemplo, diagnosticoMixExemplo, esperar, leituraCorredorExemplo } from "./demo";
import { moeda, percentual } from "./formato";
import { modeloPara } from "./modelos-do-app";
import { lerCustosEsquecidos, lerDiagnosticoMix, lerLeituraCorredor } from "./leitura-ia";
import type { Cenario, Precificacao } from "./precificacao";
import type { CustosEsquecidos, DiagnosticoMix, LeituraCorredor } from "./types";

const VOZ = `Você fala com o dono de um pequeno negócio brasileiro que já vende e desconfia que está cobrando errado.
Ele não é contador e decide pelo celular.

Regras que não se quebram:
- Você NUNCA calcula. Todos os números já vêm prontos no texto abaixo; use-os como estão ou não use nenhum.
- Nunca invente um número que não esteja nos dados.
- Português do Brasil, frases curtas, sem jargão de consultoria e sem "otimizar", "alavancar", "sinergia".
- Fale do negócio dele, não de teoria de precificação.`;

const ROTULO_ESTADO: Record<string, string> = {
  prejuizo: "abaixo do preço de lucro zero (prejuízo)",
  "abaixo-do-alvo": "acima do prejuízo, mas abaixo da margem-alvo",
  saudavel: "na faixa saudável",
  "acima-do-teto": "acima do teto de valor declarado",
};

/** Os números do item, já calculados, no formato em que a IA deve lê-los. */
function retrato(cenario: Cenario, { corredor, derivados }: Precificacao): string {
  const linhas = [
    `Item: ${cenario.item.nome} (${cenario.item.tipo === "servico" ? "serviço" : "produto"})`,
    `Canal de venda: ${cenario.canal.nome}`,
    `Preço escolhido: ${moeda(derivados.preco)}`,
    `Custo direto (insumos, mão de obra e perda): ${moeda(corredor.custo.direto)}`,
    `Custo fixo rateado por unidade: ${moeda(corredor.custo.rateioFixo)}`,
    `Custo total: ${moeda(corredor.custo.total)}`,
    `Imposto mais taxa do canal: ${percentual(corredor.taxaTotalPct)} do preço`,
    `Preço de lucro zero: ${moeda(corredor.pisoPrejuizo)}`,
    corredor.pisoMargemAlvo !== null
      ? `Preço da margem-alvo (${percentual(corredor.margemAlvoPct)}): ${moeda(corredor.pisoMargemAlvo)}`
      : `A margem-alvo de ${percentual(corredor.margemAlvoPct)} não cabe: imposto e taxa já consomem ${percentual(corredor.taxaTotalPct)} do preço`,
    corredor.mercado ? `Faixa de mercado: ${moeda(corredor.mercado.min)} a ${moeda(corredor.mercado.max)}` : "Nenhum preço de concorrente cadastrado",
    corredor.tetoValor !== null ? `Teto de valor declarado: ${moeda(corredor.tetoValor)}` : "Nenhum teto de valor declarado",
    `Lucro por unidade: ${moeda(derivados.lucro)}`,
    `Margem líquida real: ${percentual(derivados.margemLiquidaPct)}`,
    `Desconto máximo sem sair do lucro: ${percentual(derivados.descontoMaximoPct)}`,
    derivados.pontoEquilibrio !== null
      ? `Ponto de equilíbrio: ${Math.ceil(derivados.pontoEquilibrio)} unidades por mês`
      : "Neste preço nenhum volume paga os custos fixos",
    `Situação: ${ROTULO_ESTADO[derivados.estado]}`,
  ];
  return linhas.join("\n");
}

const FORMATO_LEITURA = `Leitura: <duas ou três frases sobre onde o preço está e o que isso significa>
- <ação curta, no máximo 12 palavras>
- <outra ação, se houver>
Risco: <uma frase; omita a linha inteira se não houver risco relevante>`;

/** Prompt 1 — o que o corredor deste item quer dizer. */
export async function lerCorredor(cenario: Cenario, precificacao: Precificacao): Promise<{ leitura: LeituraCorredor; meta: Meta }> {
  if (!aiEnabled()) {
    await esperar();
    const leitura = leituraCorredorExemplo({
      estado: precificacao.derivados.estado,
      margemLiquidaPct: precificacao.derivados.margemLiquidaPct,
      descontoMaximoPct: precificacao.derivados.descontoMaximoPct,
      nomeItem: cenario.item.nome,
    });
    return { leitura, meta: meta({ demo: true, insumo: cenario.item.nome }) };
  }

  const texto = await askText({
    system: `${VOZ}\n\nSua tarefa: explicar, em linguagem de dono de negócio, onde o preço deste item caiu dentro do corredor e o que fazer a respeito.\nNo máximo três ações.\nResponda em texto simples, exatamente neste formato, sem markdown e sem nenhuma outra linha:\n\n${FORMATO_LEITURA}`,
    prompt: `Estes são os números já calculados do item:\n\n${retrato(cenario, precificacao)}`,
    maxTokens: 700,
    model: modeloPara("leitura"),
  });

  const leitura = lerLeituraCorredor(texto);
  if (!leitura) {
    // O modelo fugiu do formato a ponto de não sobrar nada aproveitável: melhor o exemplo do que
    // um erro, já que a leitura é um complemento e os números na tela continuam corretos.
    console.error("A leitura do corredor não pôde ser lida:", texto.slice(0, 200));
    return {
      leitura: leituraCorredorExemplo({
        estado: precificacao.derivados.estado,
        margemLiquidaPct: precificacao.derivados.margemLiquidaPct,
        descontoMaximoPct: precificacao.derivados.descontoMaximoPct,
        nomeItem: cenario.item.nome,
      }),
      meta: meta({ demo: true, insumo: cenario.item.nome }),
    };
  }
  return { leitura, meta: meta({ demo: false, insumo: cenario.item.nome, model: modeloPara("leitura") }) };
}

const FORMATO_CUSTOS = `<uma frase de abertura>
- <uma pergunta direta> — <uma frase dizendo por que esse custo importa>
- <outra pergunta> — <por que importa>`;

/** Prompt 2 — o que provavelmente falta na ficha deste item. */
export async function interrogarCustos(cenario: Cenario, precificacao: Precificacao): Promise<{ custos: CustosEsquecidos; meta: Meta }> {
  if (!aiEnabled()) {
    await esperar();
    return { custos: custosEsquecidosExemplo(cenario.item.tipo), meta: meta({ demo: true, insumo: cenario.item.nome }) };
  }

  const ficha = cenario.insumos.length
    ? cenario.insumos.map((l) => `- ${l.nome}: usa ${l.qtdUsada} ${l.unidadeUso}, comprado a ${moeda(l.custoCompra)} por ${l.qtdCompra} ${l.unidadeCompra}`).join("\n")
    : "A ficha não tem nenhuma linha de insumo; o custo direto foi digitado à mão.";

  const texto = await askText({
    system: `${VOZ}\n\nSua tarefa: perguntar sobre os custos que provavelmente ficaram de fora desta ficha.\nEntre três e cinco perguntas, cada uma sobre um custo diferente e concreto para este tipo de item.\nNão repita um custo que já está na ficha. Não sugira valores.\nResponda em texto simples, exatamente neste formato, sem markdown e sem nenhuma outra linha:\n\n${FORMATO_CUSTOS}`,
    prompt: `Item: ${cenario.item.nome} (${cenario.item.tipo === "servico" ? "serviço" : "produto"})
Tempo de execução declarado: ${cenario.item.tempoMinutos} minutos
Perda declarada: ${percentual(cenario.item.perdaPct)}
Custo direto atual: ${moeda(precificacao.corredor.custo.direto)}

Linhas da ficha:
${ficha}`,
    maxTokens: 800,
    model: modeloPara("leitura"),
  });

  const custos = lerCustosEsquecidos(texto);
  if (!custos) {
    console.error("O interrogatório de custos não pôde ser lido:", texto.slice(0, 200));
    return { custos: custosEsquecidosExemplo(cenario.item.tipo), meta: meta({ demo: true, insumo: cenario.item.nome }) };
  }
  return { custos, meta: meta({ demo: false, insumo: cenario.item.nome, model: modeloPara("leitura") }) };
}

const FORMATO_MIX = `Leitura: <duas ou três frases sobre o que a carteira mostra>
- <nome exato de um item da lista> — <o que há com ele> — <o que fazer>
Ponto forte: <uma frase; omita a linha se não houver>`;

/** Prompt 3 — o que a carteira inteira está dizendo. */
export async function diagnosticarMix(): Promise<{ diagnostico: DiagnosticoMix; meta: Meta }> {
  const { linhas } = montarCarteira();
  const fora = linhas.filter((l) => l.estado === "prejuizo" || l.estado === "abaixo-do-alvo").sort((a, b) => a.derivados.margemLiquidaPct - b.derivados.margemLiquidaPct);

  if (!aiEnabled()) {
    await esperar();
    return { diagnostico: diagnosticoMixExemplo(fora.map((l) => l.item.nome)), meta: meta({ demo: true, insumo: `${linhas.length} itens` }) };
  }

  const tabela = linhas
    .map((l) => `- ${l.item.nome} (${l.canal.nome}): preço ${moeda(l.preco)}, margem ${percentual(l.derivados.margemLiquidaPct)}, alvo ${percentual(l.margemAlvoPct)}, ${ROTULO_ESTADO[l.estado]}`)
    .join("\n");

  const texto = await askText({
    system: `${VOZ}\n\nSua tarefa: dizer o que a carteira inteira está mostrando e o que corrigir primeiro.\nNo máximo três prioridades, sempre com o nome exato de um item da lista.\nResponda em texto simples, exatamente neste formato, sem markdown e sem nenhuma outra linha:\n\n${FORMATO_MIX}`,
    prompt: `Carteira de itens, cada um no canal padrão:\n\n${tabela}\n\nItens abaixo da margem-alvo: ${fora.length} de ${linhas.length}.`,
    maxTokens: 900,
    model: modeloPara("leitura"),
  });

  const diagnostico = lerDiagnosticoMix(texto, linhas.map((l) => l.item.nome));
  if (!diagnostico) {
    console.error("O diagnóstico do mix não pôde ser lido:", texto.slice(0, 200));
    return { diagnostico: diagnosticoMixExemplo(fora.map((l) => l.item.nome)), meta: meta({ demo: true, insumo: `${linhas.length} itens` }) };
  }
  return { diagnostico, meta: meta({ demo: false, insumo: `${linhas.length} itens`, model: modeloPara("leitura") }) };
}

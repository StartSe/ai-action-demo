// A proposta de preenchimento que a conversa produz: um rascunho do negócio, dos custos fixos, dos
// canais e dos primeiros itens. Puro, sem node:*, e testado.
//
// A IA aqui continua sem calcular nada. Ela propõe **entradas** — quanto é o aluguel, quantas horas
// o dono trabalha, o que entra em cada peça — e o motor de lib/precificacao é quem transforma isso
// em preço. Uma proposta nunca traz preço, margem realizada nem lucro: se trouxesse, estaria
// competindo com a conta em vez de alimentá-la.
//
// O formato é de linhas, não JSON, pelo mesmo motivo de lib/leitura-ia.ts: modelo gratuito erra
// JSON com frequência, e aqui um erro custa a configuração inteira.
import type { Balde, ModoCapacidade, Regime, TipoItem, Unidade } from "./precificacao";
import { UNIDADES } from "./precificacao";

export type PropostaNegocio = {
  nome: string;
  regime: Regime;
  modoCapacidade: ModoCapacidade;
  volumeMensalUnidades: number;
  horasProdutivasMes: number;
  proLaboreMensal: number;
  margemAlvoPadraoPct: number;
};

export type PropostaFixo = { nome: string; valorMensal: number; balde: Balde };
export type PropostaCanal = { nome: string; taxaPct: number; taxaFixa: number; padrao: boolean };
export type PropostaInsumo = { nome: string; qtdUsada: number; unidadeUso: Unidade; qtdCompra: number; unidadeCompra: Unidade; custoCompra: number };
export type PropostaItem = { nome: string; tipo: TipoItem; tempoMinutos: number; perdaPct: number; insumos: PropostaInsumo[] };

export type Proposta = {
  negocio: PropostaNegocio;
  fixos: PropostaFixo[];
  canais: PropostaCanal[];
  itens: PropostaItem[];
};

/**
 * O formato que o prompt pede, como **exemplo preenchido** e não como gabarito de lacunas.
 *
 * Modelo gratuito copia exemplo bem e preenche `<lacuna>` mal: com o gabarito de colchetes
 * angulares, ele devolvia literalmente "negocio: <nome> | <mei, simples ou presumido>". O exemplo
 * abaixo é de uma padaria justamente para não parecer um esqueleto a ser repetido.
 *
 * Exportado para o prompt e o leitor nunca saírem de sincronia.
 */
export const FORMATO_PROPOSTA = `MENSAGEM
Montei um rascunho com o que você me contou. Chutei o valor do DAS e a taxa da maquininha; confira e me diga o que mudar.
PROPOSTA
negocio: Padaria da esquina | mei | unidades | 3000 | 200 | 4500 | 25
fixo: Aluguel | 2800 | produto
fixo: DAS do MEI | 81 | ambos
canal: Balcão | 0 | 0 | principal
canal: iFood | 27 | 0 |
item: Pão de forma | produto | 12 | 5
insumo: Pão de forma | Farinha | 500 | g | 1 | kg | 6,50
insumo: Pão de forma | Fermento | 10 | g | 500 | g | 18
FIM

O que cada posição significa:
- negocio: nome | regime (mei, simples ou presumido) | capacidade medida em (unidades, horas ou ambos) | unidades por mês | horas produtivas por mês | quanto quer tirar por mês | margem-alvo em %
- fixo: nome do custo | valor por mês | onde pesa (produto, servico ou ambos)
- canal: nome | taxa em % | taxa fixa por venda em reais | escreva principal no canal mais usado
- item: nome | produto ou servico | minutos de trabalho | perda em %
- insumo: nome do item a que pertence | nome do insumo | quanto usa | unidade de uso | quanto vem na embalagem | unidade da embalagem | preço da embalagem`;

/** "2.800", "6,50", "27%" e "R$ 12" viram número. Vazio ou ilegível vira 0. */
export function numeroBR(bruto: string): number {
  const limpo = String(bruto || "")
    .replace(/[R$%\s]/gi, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

/** Percentual escrito como "25" ou "25%" vira a fração 0,25. Já em fração, mantém. */
function fracao(bruto: string): number {
  const n = numeroBR(bruto);
  if (n <= 0) return 0;
  // Um modelo às vezes responde 0,25 em vez de 25. Acima de 1 é percentual; até 1, já é fração.
  return Math.min(1, n > 1 ? n / 100 : n);
}

function unidade(bruto: string): Unidade {
  const t = String(bruto || "").trim().toLowerCase();
  const achada = UNIDADES.find((u) => u.toLowerCase() === t);
  if (achada) return achada;
  if (/^(kilo|quilo|kgs?)$/.test(t)) return "kg";
  if (/^(grama|gramas|gr)$/.test(t)) return "g";
  if (/^(litro|litros|l)$/.test(t)) return "L";
  if (/^(mililitro|mililitros)$/.test(t)) return "ml";
  if (/^(metro|metros)$/.test(t)) return "m";
  if (/^(cent[ií]metro|cent[ií]metros)$/.test(t)) return "cm";
  return "un";
}

function regime(bruto: string): Regime {
  const t = String(bruto || "").trim().toLowerCase();
  if (t.includes("mei")) return "mei";
  if (t.includes("presum")) return "presumido";
  return "simples";
}

function modo(bruto: string): ModoCapacidade {
  const t = String(bruto || "").trim().toLowerCase();
  if (t.startsWith("hora")) return "horas";
  if (t.startsWith("ambos") || t.includes("dois")) return "ambos";
  return "unidades";
}

function balde(bruto: string): Balde {
  const t = String(bruto || "").trim().toLowerCase();
  if (t.startsWith("serv")) return "servico";
  if (t.startsWith("ambos") || t.includes("dois")) return "ambos";
  return "produto";
}

function tipo(bruto: string): TipoItem {
  return String(bruto || "").trim().toLowerCase().startsWith("serv") ? "servico" : "produto";
}

/** Separa a linha em campos por "|", tolerando o separador colado ou com espaço sobrando. */
function campos(resto: string): string[] {
  return resto.split("|").map((c) => c.trim());
}

/** O rótulo da linha e o que vem depois dele, sem marcador de lista nem negrito. */
function rotulada(linha: string): { rotulo: string; resto: string } | null {
  const limpa = linha.replace(/\*\*/g, "").replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim();
  const m = limpa.match(/^(neg[óo]cio|fixo|canal|item|insumo)\s*:\s*/i);
  if (!m) return null;
  return { rotulo: m[1].toLowerCase().replace("ó", "o"), resto: limpa.slice(m[0].length) };
}

/**
 * A linha é o gabarito devolvido como se fosse resposta?
 *
 * Um modelo mais fraco às vezes copia o formato em vez de preenchê-lo — "negocio: <nome> | <mei…>"
 * ou "item: ... | ...". Gravar isso criaria um negócio chamado "<nome>" com tudo zerado.
 */
function ehGabarito(resto: string): boolean {
  return /[<>]/.test(resto) || /^\s*\.{2,}/.test(resto);
}

/** true quando o texto traz um bloco de proposta, mesmo que ainda incompleto. */
export function temProposta(texto: string): boolean {
  return /^\s*PROPOSTA\s*$/im.test(String(texto || ""));
}

/**
 * Lê a proposta de dentro da resposta da IA. Devolve `null` quando não há bloco, ou quando o bloco
 * não tem nem negócio nem item — sem isso não há o que aplicar.
 *
 * Tudo o que não for reconhecido é ignorado em silêncio: uma linha a mais de conversa dentro do
 * bloco não pode custar a configuração inteira.
 */
export function lerProposta(texto: string): Proposta | null {
  const todas = String(texto || "").split("\n");
  const inicio = todas.findIndex((l) => /^\s*PROPOSTA\s*$/i.test(l));
  if (inicio < 0) return null;
  const fim = todas.findIndex((l, i) => i > inicio && /^\s*FIM\s*$/i.test(l));
  const linhas = todas.slice(inicio + 1, fim < 0 ? undefined : fim);

  let negocio: PropostaNegocio | null = null;
  const fixos: PropostaFixo[] = [];
  const canais: PropostaCanal[] = [];
  const itens: PropostaItem[] = [];

  for (const linha of linhas) {
    const lida = rotulada(linha);
    if (!lida) continue;
    if (ehGabarito(lida.resto)) continue;
    const c = campos(lida.resto);
    if (!c[0]) continue;

    if (lida.rotulo === "negocio") {
      negocio = {
        nome: c[0].slice(0, 120),
        regime: regime(c[1]),
        modoCapacidade: modo(c[2]),
        volumeMensalUnidades: Math.max(0, numeroBR(c[3])),
        horasProdutivasMes: Math.max(0, numeroBR(c[4])),
        proLaboreMensal: Math.max(0, numeroBR(c[5])),
        margemAlvoPadraoPct: fracao(c[6]) || 0.2,
      };
    } else if (lida.rotulo === "fixo") {
      fixos.push({ nome: c[0].slice(0, 120), valorMensal: Math.max(0, numeroBR(c[1])), balde: balde(c[2]) });
    } else if (lida.rotulo === "canal") {
      canais.push({
        nome: c[0].slice(0, 60),
        taxaPct: fracao(c[1]),
        taxaFixa: Math.max(0, numeroBR(c[2])),
        padrao: /principal|padr[ãa]o|sim/i.test(c[3] || ""),
      });
    } else if (lida.rotulo === "item") {
      itens.push({ nome: c[0].slice(0, 120), tipo: tipo(c[1]), tempoMinutos: Math.max(0, numeroBR(c[2])), perdaPct: fracao(c[3]), insumos: [] });
    } else if (lida.rotulo === "insumo") {
      // A linha começa pelo nome do item a que o insumo pertence. É o campo que resolve o caso em
      // que o modelo lista todos os itens primeiro e só depois os insumos: sem ele, tudo grudaria
      // no último item e os anteriores ficariam com a ficha vazia.
      //
      // Quando o primeiro campo não casa com nenhum item, a linha é lida no formato sem
      // referência e o insumo vai para o item mais recente — que é o certo quando o modelo
      // escreveu os insumos logo abaixo do item.
      const referenciado = itens.find((i) => i.nome.trim().toLowerCase() === c[0].trim().toLowerCase());
      const campos = referenciado ? c.slice(1) : c;
      const dono = referenciado ?? itens[itens.length - 1];
      if (!dono || !campos[0]) continue;
      dono.insumos.push({
        nome: campos[0].slice(0, 120),
        qtdUsada: Math.max(0, numeroBR(campos[1])),
        unidadeUso: unidade(campos[2]),
        qtdCompra: Math.max(0, numeroBR(campos[3])) || 1,
        unidadeCompra: unidade(campos[4]),
        custoCompra: Math.max(0, numeroBR(campos[5])),
      });
    }
  }

  if (!negocio && itens.length === 0) return null;

  // Exatamente um canal principal: o marcado, ou o primeiro.
  if (canais.length > 0 && !canais.some((c) => c.padrao)) canais[0].padrao = true;
  let jaTemPadrao = false;
  for (const canal of canais) {
    if (canal.padrao && jaTemPadrao) canal.padrao = false;
    if (canal.padrao) jaTemPadrao = true;
  }

  return {
    negocio: negocio ?? {
      nome: "",
      regime: "simples",
      modoCapacidade: "unidades",
      volumeMensalUnidades: 0,
      horasProdutivasMes: 0,
      proLaboreMensal: 0,
      margemAlvoPadraoPct: 0.2,
    },
    fixos,
    canais,
    itens,
  };
}

/**
 * A resposta sem o bloco de proposta: o que de fato vai para a bolha da conversa.
 *
 * O marcador "MENSAGEM" existe porque os modelos gratuitos de raciocínio despejam o próprio
 * rascunho mental antes da resposta — em inglês, inclusive ("We need to respond to the owner…").
 * Com o marcador, só o que vem depois dele chega à tela. Sem marcador, vale o que vier antes do
 * bloco: corta na primeira linha "PROPOSTA" ou na primeira linha rotulada, porque um modelo às
 * vezes começa a listar sem abrir o bloco.
 */
export function semProposta(texto: string): string {
  const linhas = String(texto || "").split("\n");
  const fimDoRecado = linhas.findIndex((l) => /^\s*PROPOSTA\s*$/i.test(l) || rotulada(l) !== null);
  const ate = fimDoRecado < 0 ? linhas.length : fimDoRecado;

  const marcador = linhas.findIndex((l, i) => i < ate && /^\s*MENSAGEM\s*:?\s*$/i.test(l));
  const inicio = marcador < 0 ? 0 : marcador + 1;

  const recado = linhas.slice(inicio, ate).join("\n").trim();
  return /[<>]/.test(recado) ? "" : recado;
}

// Modo demonstração: uma planilha de exemplo gerada de forma determinística e três conversas com as
// respostas calculadas a partir dela (os números são verdadeiros) e decisões do Jev gravadas, marcadas
// como exemplo. Nada aqui chama IA.
import type { Linha } from "./planilhas";
import { paraNumero } from "./planilhas";
import type { Mensagem, RegistroDecisao } from "./types";

export const NOME_EXEMPLO = "Vendas por região e canal (exemplo)";
const REGIOES = ["Sudeste", "Sul", "Nordeste", "Centro-Oeste", "Norte"];
const CANAIS = ["Loja própria", "E-commerce", "Distribuidor"];
const PRODUTOS = ["Linha Essencial", "Linha Pro", "Acessórios", "Serviços"];
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
export function gerarCSVExemplo(): string {
  const rnd = lcg(20260921);
  const linhas = ["data;regiao;canal;produto;unidades;receita;custo;desconto_pct;vendedor_id"];
  const pesoRegiao: Record<string, number> = { Sudeste: 1.0, Sul: 0.62, Nordeste: 0.48, "Centro-Oeste": 0.31, Norte: 0.19 };
  const pesoCanal: Record<string, number> = { "Loja própria": 0.5, "E-commerce": 0.32, Distribuidor: 0.18 };
  const precoBase: Record<string, number> = { "Linha Essencial": 189, "Linha Pro": 449, Acessórios: 79, Serviços: 320 };
  const margem: Record<string, number> = { "Loja própria": 0.42, "E-commerce": 0.51, Distribuidor: 0.27 };
  for (let m = 0; m < 24; m++) {
    const ano = 2024 + Math.floor(m / 12);
    const mes = (m % 12) + 1;
    const tendencia = 1 + m * 0.018;
    const sazonal = mes === 11 || mes === 12 ? 1.35 : mes === 1 || mes === 2 ? 0.82 : 1;
    for (const regiao of REGIOES) {
      const cresc = regiao === "Nordeste" ? 1 + m * 0.03 : regiao === "Norte" ? 1 + m * 0.012 : 1;
      for (const canal of CANAIS) {
        const canalTend = canal === "E-commerce" ? 1 + m * 0.022 : canal === "Distribuidor" ? 1 - m * 0.006 : 1;
        const produto = PRODUTOS[Math.floor(rnd() * PRODUTOS.length)];
        const unidades = Math.max(3, Math.round(140 * pesoRegiao[regiao] * pesoCanal[canal] * tendencia * sazonal * cresc * canalTend * (0.85 + rnd() * 0.3)));
        const desconto = Math.round((canal === "E-commerce" ? 8 : canal === "Distribuidor" ? 14 : 4) + rnd() * 6);
        const receita = Math.round(unidades * precoBase[produto] * (1 - desconto / 100));
        const custo = Math.round(receita * (1 - margem[canal]) * (0.95 + rnd() * 0.1));
        const vendedor = `V${String(1 + Math.floor(rnd() * 18)).padStart(3, "0")}`;
        linhas.push(`${ano}-${String(mes).padStart(2, "0")}-01;${regiao};${canal};${produto};${unidades};${receita};${custo};${desconto};${vendedor}`);
      }
    }
  }
  return linhas.join("\n");
}

const R$ = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const pct = (n: number) => (n * 100).toFixed(1).replace(".", ",") + "%";
function soma(linhas: Linha[], col: string, filtro: (l: Linha) => boolean) {
  return linhas.filter(filtro).reduce((a, l) => a + (paraNumero(l[col]) || 0), 0);
}
const dec = (estacao: RegistroDecisao["estacao"], chave: string, rotulo: string, valor: string, probabilidade: number, confianca: number | null = null): RegistroDecisao => ({ estacao, chave, rotulo, valor, probabilidade, confianca, baixaConfianca: false, exemplo: true });
const harnessExemplo = { chamadasJev: 3, latenciaJevMs: 610, custoJevUsd: 0.00031, tokensJev: 7400, modelo: "Exemplo · sem IA conectada", latenciaTotalMs: 1400, caminho: "exemplo", avisos: ["Resposta de demonstração calculada localmente; conecte ChatGPT e OpenRouter para perguntar qualquer coisa."] };

export type ConversaExemplo = { pergunta: string; resposta: (linhas: Linha[]) => Omit<Mensagem, "id" | "criadoEm" | "papel"> };
export const CONVERSAS_EXEMPLO: ConversaExemplo[] = [
  {
    pergunta: "Qual região vendeu mais em 2025 e qual cresceu mais em relação a 2024?",
    resposta(linhas) {
      const por = REGIOES.map((r) => {
        const a24 = soma(linhas, "receita", (l) => l.regiao === r && l.data.startsWith("2024"));
        const a25 = soma(linhas, "receita", (l) => l.regiao === r && l.data.startsWith("2025"));
        return { r, a24, a25, cresc: (a25 - a24) / a24 };
      }).sort((x, y) => y.a25 - x.a25);
      const maior = por[0];
      const cresceu = [...por].sort((x, y) => y.cresc - x.cresc)[0];
      const total25 = por.reduce((a, x) => a + x.a25, 0);
      return {
        texto: `**${maior.r}** foi a região que mais vendeu em 2025, com ${R$(maior.a25)} (${pct(maior.a25 / total25)} da receita do ano). Quem mais cresceu foi **${cresceu.r}**: de ${R$(cresceu.a24)} em 2024 para ${R$(cresceu.a25)} em 2025, alta de ${pct(cresceu.cresc)}.\n\n| Região | Receita 2024 | Receita 2025 | Variação |\n|---|---|---|---|\n${por.map((x) => `| ${x.r} | ${R$(x.a24)} | ${R$(x.a25)} | ${pct(x.cresc)} |`).join("\n")}\n\nBase: colunas data, regiao e receita, somadas por ano.`,
        decisoes: [
          dec("triagem", "intencao", "Intenção", "Pergunta sobre os dados", 0.93, 0.95),
          dec("triagem", "respondivel", "Respondível com as colunas", "Sim", 0.97),
          dec("triagem", "precisa_codigo", "Precisa de cálculo", "Sim", 0.88),
          dec("triagem", "complexidade", "Complexidade", "Análise composta (1,2)", 0.71, 0.8),
          dec("verificacao", "numeros_batem", "Números conferem com os dados", "Sim", 0.96),
          dec("verificacao", "grafico", "Gráfico sugerido", "Barras", 0.81, 0.84),
        ],
        harness: harnessExemplo,
        sugestoes: ["Como a receita evoluiu mês a mês em 2025?", "Qual canal tem a melhor margem?", "O que puxou o crescimento do Nordeste: unidades ou preço?"],
        exemplo: true,
      };
    },
  },
  {
    pergunta: "Como a receita evoluiu mês a mês em 2025?",
    resposta(linhas) {
      const meses = [...new Set(linhas.map((l) => l.data.slice(0, 7)).filter((m) => m.startsWith("2025")))].sort();
      const valores = meses.map((m) => ({ m, v: soma(linhas, "receita", (l) => l.data.startsWith(m)) }));
      const pico = [...valores].sort((a, b) => b.v - a.v)[0];
      const vale = [...valores].sort((a, b) => a.v - b.v)[0];
      const primeiro = valores[0].v;
      const ultimo = valores[valores.length - 1].v;
      return {
        texto: `A receita de 2025 saiu de ${R$(primeiro)} em janeiro para ${R$(ultimo)} em dezembro (${pct((ultimo - primeiro) / primeiro)} no ano). O pico foi em **${pico.m}** (${R$(pico.v)}), puxado pela sazonalidade de fim de ano; o ponto mais baixo foi **${vale.m}** (${R$(vale.v)}).\n\n| Mês | Receita |\n|---|---|\n${valores.map((x) => `| ${x.m} | ${R$(x.v)} |`).join("\n")}\n\nBase: coluna receita somada por mês da coluna data.`,
        decisoes: [
          dec("triagem", "intencao", "Intenção", "Pergunta sobre os dados", 0.9, 0.92),
          dec("triagem", "respondivel", "Respondível com as colunas", "Sim", 0.98),
          dec("triagem", "complexidade", "Complexidade", "Consulta simples (0,6)", 0.66, 0.77),
          dec("verificacao", "numeros_batem", "Números conferem com os dados", "Sim", 0.97),
          dec("verificacao", "grafico", "Gráfico sugerido", "Linhas", 0.9, 0.93),
          dec("verificacao", "escalar", "Pede validação humana", "Não", 0.12),
        ],
        harness: harnessExemplo,
        sugestoes: ["Qual região vendeu mais em 2025 e qual cresceu mais em relação a 2024?", "Qual canal tem a melhor margem?", "Quanto do pico de fim de ano veio do e-commerce?"],
        exemplo: true,
      };
    },
  },
  {
    pergunta: "Qual canal tem a melhor margem?",
    resposta(linhas) {
      const por = CANAIS.map((c) => {
        const rec = soma(linhas, "receita", (l) => l.canal === c);
        const cus = soma(linhas, "custo", (l) => l.canal === c);
        return { c, rec, cus, margem: (rec - cus) / rec };
      }).sort((a, b) => b.margem - a.margem);
      return {
        texto: `O canal com melhor margem bruta é **${por[0].c}**: ${pct(por[0].margem)} sobre ${R$(por[0].rec)} de receita no período. ${por[por.length - 1].c} tem a menor, ${pct(por[por.length - 1].margem)}, o que é esperado pelo desconto médio maior nesse canal.\n\n| Canal | Receita | Custo | Margem bruta |\n|---|---|---|---|\n${por.map((x) => `| ${x.c} | ${R$(x.rec)} | ${R$(x.cus)} | ${pct(x.margem)} |`).join("\n")}\n\nBase: colunas canal, receita e custo; margem = (receita − custo) ÷ receita.`,
        decisoes: [
          dec("triagem", "intencao", "Intenção", "Pergunta sobre os dados", 0.94, 0.96),
          dec("triagem", "ambiguidade", "Ambiguidade", "Falta um detalhe: margem bruta ou líquida (0,9)", 0.55, 0.62),
          dec("roteamento", "modelo", "Modelo escolhido", "Padrão (complexidade baixa)", 1),
          dec("verificacao", "numeros_batem", "Números conferem com os dados", "Sim", 0.95),
          dec("verificacao", "grafico", "Gráfico sugerido", "Barras", 0.78, 0.8),
          dec("verificacao", "escalar", "Pede validação humana", "Não", 0.2),
        ],
        harness: harnessExemplo,
        sugestoes: ["A margem do distribuidor melhorou ou piorou ao longo de 2025?", "Qual região vendeu mais em 2025 e qual cresceu mais em relação a 2024?", "Como a receita evoluiu mês a mês em 2025?"],
        exemplo: true,
      };
    },
  },
];
export function respostaExemplo(pergunta: string, linhas: Linha[]): Omit<Mensagem, "id" | "criadoEm" | "papel"> | null {
  const alvo = pergunta.trim().toLowerCase();
  const c = CONVERSAS_EXEMPLO.find((c) => c.pergunta.toLowerCase() === alvo);
  return c ? c.resposta(linhas) : null;
}

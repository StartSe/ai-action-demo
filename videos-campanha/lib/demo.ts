// Respostas de exemplo usadas quando não há chave de IA configurada (ver lib/ai.ts: aiEnabled()).
// Arquivo sem imports de node:*: a tela (app/page.tsx) importa BRIEFING_DEMO daqui.
import { type Briefing, type Conceito } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Briefing do exemplo (a imagem do produto de exemplo mora em public/exemplo-produto.jpg). */
export const BRIEFING_DEMO: Omit<Briefing, "imagemDataUrl"> = {
  produto: "Garrafa térmica Vela 750 ml",
  publico: "Pessoas que treinam cedo e passam o dia inteiro fora de casa",
  objetivo: "lancamento",
  tom: "Direto e confiante",
  formato: "9:16",
  duracaoSeg: 10,
};

/**
 * Divide `total` segundos entre as cenas na proporção dos pesos, em inteiros que somam exatamente `total`,
 * com pelo menos 1 s por cena (quando o total permite). Ex.: (10, [3, 4, 3]) → [3, 4, 3]; (5, [3, 4, 3]) → [2, 2, 1].
 */
export function distribuirSegundos(total: number, pesos: number[]): number[] {
  const n = pesos.length;
  if (n === 0) return [];
  const seguros = pesos.map((p) => (Number.isFinite(p) && p > 0 ? p : 1));
  const soma = seguros.reduce((a, b) => a + b, 0);
  const exatos = seguros.map((p) => (p / soma) * total);
  const inteiros = exatos.map((v) => Math.max(total >= n ? 1 : 0, Math.floor(v)));
  let resto = total - inteiros.reduce((a, b) => a + b, 0);
  // Distribui o que sobrou para as cenas com maior parte fracionária (empate: a primeira).
  const ordem = exatos.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  let k = 0;
  while (resto > 0) {
    inteiros[ordem[k % n].i] += 1;
    resto -= 1;
    k += 1;
  }
  while (resto < 0) {
    const maior = inteiros.indexOf(Math.max(...inteiros));
    inteiros[maior] -= 1;
    resto += 1;
  }
  return inteiros;
}

/** Nome curto do produto para caber no texto da tela ("Garrafa térmica Vela 750 ml" → "Vela"). */
function nomeCurto(produto: string): string {
  const palavras = produto.trim().split(/\s+/);
  const ehNome = (p: string) => /^[A-ZÀ-Ú][a-zà-ú]+$/.test(p) && p.length > 2;
  // Prefere um nome próprio que não seja a primeira palavra (que costuma ser só a categoria: "Garrafa", "Tênis").
  const proprio = palavras.slice(1).find(ehNome) ?? palavras.find(ehNome);
  return proprio ?? palavras.slice(0, 2).join(" ");
}

/** Três conceitos fictícios, com ângulos diferentes (benefício, companhia, antes e depois), ajustados à duração. */
export function conceitosDemo(b: Briefing): Conceito[] {
  const produto = b.produto.trim() || "o produto";
  const nome = nomeCurto(produto);
  const publico = b.publico.trim() || "quem vive o dia inteiro fora de casa";
  const [a1, a2, a3] = distribuirSegundos(b.duracaoSeg, [3, 4, 3]);
  const [b1, b2, b3] = distribuirSegundos(b.duracaoSeg, [2, 5, 3]);
  const [c1, c2, c3] = distribuirSegundos(b.duracaoSeg, [4, 3, 3]);

  return [
    {
      id: "c1",
      titulo: "O dia inteiro na temperatura certa",
      efeitoSugerido: "Zoom dramático",
      roteiro: [
        { cena: `${produto} sozinho no centro, fundo escuro, a câmera se aproxima devagar.`, segundos: a1, textoNaTela: "6 da manhã. Gelado." },
        { cena: "Corte seco: mesma imagem com luz quente de fim de tarde, aproximação continua até o detalhe da tampa.", segundos: a2, textoNaTela: "6 da tarde. Ainda gelado." },
        { cena: "Afasta para mostrar o produto inteiro, chamada entra por baixo.", segundos: a3, textoNaTela: `${nome}. Lançamento.` },
      ],
      chamada: `Conheça a ${nome}`,
      legenda: {
        instagram: `Sai de casa às 6 e só volta à noite? A ${produto} segura a temperatura o dia inteiro. Lançamento disponível.\n#${nome.replace(/\s+/g, "")} #lancamento #diaInteiro #treino #rotina`,
        linkedin: `Lançamos a ${produto}. Feita para ${publico}: mantém a temperatura por até 24 horas, do treino da manhã à última reunião do dia. Um detalhe simples que muda a rotina de quem passa o dia fora. #lancamento #produto`,
        tiktok: `6h gelado. 18h gelado. ${nome} chegou.\n#${nome.replace(/\s+/g, "")} #lancamento #rotina #treino`,
      },
    },
    {
      id: "c2",
      titulo: "Feita para acompanhar",
      efeitoSugerido: "Giro do produto",
      roteiro: [
        { cena: `${produto} de frente, fundo claro e limpo.`, segundos: b1, textoNaTela: "Treino." },
        { cena: "O produto gira devagar em 360 graus; a cada quarto de volta, uma palavra troca na tela.", segundos: b2, textoNaTela: "Trabalho. Trânsito. Casa." },
        { cena: "O giro para de frente; a chamada entra ao lado do produto.", segundos: b3, textoNaTela: `Vai onde você vai.` },
      ],
      chamada: `Garanta a sua ${nome}`,
      legenda: {
        instagram: `Treino, trabalho, trânsito, casa. A ${produto} vai junto em todos. Leve, sem vazar e na temperatura que você escolheu.\n#${nome.replace(/\s+/g, "")} #rotina #hidratacao #lancamento`,
        linkedin: `Produto bom é o que acompanha a rotina sem pedir atenção. A ${produto} foi pensada para ${publico}: cabe na mochila, não vaza e mantém a temperatura entre um compromisso e outro. Já disponível.`,
        tiktok: `Vai onde você vai. ${nome}, agora disponível.\n#${nome.replace(/\s+/g, "")} #rotina #hidratacao`,
      },
    },
    {
      id: "c3",
      titulo: "Antes e depois",
      efeitoSugerido: "Antes e depois",
      roteiro: [
        { cena: "Metade esquerda da tela em preto e branco, sem produto: só um copo descartável genérico desenhado com blocos.", segundos: c1, textoNaTela: "Antes: água morna às 10h." },
        { cena: `A imagem de ${produto} desliza da direita e ocupa a tela, em cores.`, segundos: c2, textoNaTela: "Depois: gelada até a noite." },
        { cena: "Produto parado, brilho suave passando, chamada em destaque.", segundos: c3, textoNaTela: `${nome}. Sem volta.` },
      ],
      chamada: `Troque hoje pela ${nome}`,
      legenda: {
        instagram: `Antes: água morna às 10 da manhã. Depois: gelada até a noite. A ${produto} chegou e não tem volta.\n#${nome.replace(/\s+/g, "")} #antesedepois #lancamento #hidratacao`,
        linkedin: `Pequenas trocas, grande diferença no dia. Substituímos o copo descartável pela ${produto}: temperatura mantida por horas, menos lixo, mais água ao longo do dia. Lançamento para ${publico}.`,
        tiktok: `Antes x depois. Adivinha qual é a ${nome}.\n#${nome.replace(/\s+/g, "")} #antesedepois #lancamento`,
      },
    },
  ];
}

// Dados de exemplo usados quando não há chave de IA configurada, plausíveis e em português (ver
// PADRAO.md "Modo demonstração"). Os dois CSVs também alimentam "Preencher com um exemplo" (?exemplo=1)
// em app/page.tsx, que monta arquivos de verdade (File) a partir destes textos.
import type { ResultadoClassificacao } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

export const DEMO_HISTORICO_CSV = `Data,Descrição,Valor,Categoria
05/01/2026,Uber corrida São Paulo,38.90,Transporte
06/01/2026,99 corrida Centro,24.50,Transporte
07/01/2026,Aluguel escritório Fevereiro,8500.00,Despesas administrativas
10/01/2026,Assinatura Notion Team,240.00,Software
12/01/2026,Assinatura Figma Organization,450.00,Software
15/01/2026,Google Ads campanha institucional,3200.00,Marketing
18/01/2026,Meta Ads campanha institucional,2800.00,Marketing
20/01/2026,Uber corrida Aeroporto,65.00,Transporte
22/01/2026,Conta de luz escritório Janeiro,610.00,Despesas administrativas
25/01/2026,Assinatura Slack Business+,190.00,Software
28/01/2026,Material de escritório Kalunga,340.00,Despesas administrativas
30/01/2026,Honorários contábeis Janeiro,1800.00,Serviços contábeis
02/02/2026,LinkedIn Ads vagas abertas,950.00,Marketing
04/02/2026,99 corrida visita a cliente,41.20,Transporte
`;

export const DEMO_NOVOS_CSV = `Data,Descrição,Valor
06/02/2026,Uber corrida reunião com cliente,45.00
07/02/2026,Assinatura Canva Pro,55.00
08/02/2026,Aluguel escritório Março,8500.00
10/02/2026,Pagamento PIX João Silva,1200.00
12/02/2026,Google Ads campanha produto novo,4100.00
14/02/2026,Compra de mobiliário para o escritório novo,3200.00
15/02/2026,Honorários contábeis Fevereiro,1800.00
`;

export function resultadoDemo(): ResultadoClassificacao {
  const lancamentos: ResultadoClassificacao["lancamentos"] = [
    {
      id: "l1",
      data: "06/02/2026",
      descricao: "Uber corrida reunião com cliente",
      valor: 45.0,
      categoriaSugerida: "Transporte",
      confianca: "alta",
      revisar: false,
      citacoes: ["Uber corrida São Paulo", "Uber corrida Aeroporto", "99 corrida visita a cliente"],
      justificativa: "Corridas de aplicativo (Uber/99) já classificadas em Transporte no histórico.",
    },
    {
      id: "l2",
      data: "07/02/2026",
      descricao: "Assinatura Canva Pro",
      valor: 55.0,
      categoriaSugerida: "Software",
      confianca: "alta",
      revisar: false,
      citacoes: ["Assinatura Notion Team", "Assinatura Figma Organization", "Assinatura Slack Business+"],
      justificativa: "Assinaturas de ferramentas de trabalho seguem sempre classificadas como Software no histórico.",
    },
    {
      id: "l3",
      data: "08/02/2026",
      descricao: "Aluguel escritório Março",
      valor: 8500.0,
      categoriaSugerida: "Despesas administrativas",
      confianca: "alta",
      revisar: false,
      citacoes: ["Aluguel escritório Fevereiro"],
      justificativa: "Mesmo lançamento recorrente do mês anterior, mesmo valor e mesma descrição.",
    },
    {
      id: "l4",
      data: "10/02/2026",
      descricao: "Pagamento PIX João Silva",
      valor: 1200.0,
      categoriaSugerida: null,
      confianca: "baixa",
      revisar: true,
      citacoes: [],
      justificativa: "Nenhum lançamento do histórico se parece com um PIX para pessoa física; sem um precedente claro, não é possível apontar a categoria com segurança.",
    },
    {
      id: "l5",
      data: "12/02/2026",
      descricao: "Google Ads campanha produto novo",
      valor: 4100.0,
      categoriaSugerida: "Marketing",
      confianca: "alta",
      revisar: false,
      citacoes: ["Google Ads campanha institucional", "Meta Ads campanha institucional", "LinkedIn Ads vagas abertas"],
      justificativa: "Investimento em mídia paga (Google/Meta/LinkedIn Ads) sempre classificado como Marketing no histórico.",
    },
    {
      id: "l6",
      data: "14/02/2026",
      descricao: "Compra de mobiliário para o escritório novo",
      valor: 3200.0,
      categoriaSugerida: null,
      confianca: "baixa",
      revisar: true,
      citacoes: [],
      justificativa: "O histórico tem despesas recorrentes de escritório (aluguel, luz, material), mas nenhuma compra de mobiliário para comparar com segurança.",
    },
    {
      id: "l7",
      data: "15/02/2026",
      descricao: "Honorários contábeis Fevereiro",
      valor: 1800.0,
      categoriaSugerida: "Serviços contábeis",
      confianca: "alta",
      revisar: false,
      citacoes: ["Honorários contábeis Janeiro"],
      justificativa: "Mesmo lançamento recorrente do mês anterior, mesmo valor e mesma descrição.",
    },
  ];

  return {
    lancamentos,
    totalNovos: lancamentos.length,
    totalRevisar: lancamentos.filter((l) => l.revisar).length,
    categoriasEncontradas: ["Transporte", "Despesas administrativas", "Software", "Marketing", "Serviços contábeis"],
    totalHistorico: 14,
  };
}

// Lista padrão dos 7 critérios de venda consultiva avaliados em cada conversa. Arquivo puro (sem
// node:*): usado tanto pelo painel ("use client", como valor inicial dos campos editáveis) quanto
// por lib/analise.ts (server-only) ao montar o prompt e ao calcular a nota geral.
export const CRITERIOS_PADRAO: string[] = [
  "Abertura e rapport",
  "Descoberta de necessidades",
  "Apresentação de valor",
  "Tratamento de objeções",
  "Geração de urgência",
  "Escuta ativa",
  "Fechamento e próximos passos",
];

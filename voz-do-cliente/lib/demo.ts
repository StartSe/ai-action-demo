// Respostas de exemplo usadas quando não há chave de IA configurada.
// As contagens são derivadas do número real de comentários enviados,
// para que a demonstração pareça coerente mesmo sem chamar a IA.
import type { Analise, Comentario } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Comentários de exemplo (com nota NPS de 0 a 10) usados pelo botão "Usar comentários de exemplo" e por ?exemplo=1. */
export const COMENTARIOS_EXEMPLO: Comentario[] = [
  { texto: "O app é rápido e muito fácil de usar, resolvo tudo em menos de um minuto.", nota: 9 },
  { texto: "Trava toda vez que tento fazer um Pix acima de mil reais, preciso reabrir o aplicativo três vezes.", nota: 3 },
  { texto: "Atendimento demorou cinco dias para responder um chamado sobre cobrança indevida.", nota: 2 },
  { texto: "Adoro receber notificação na hora de qualquer movimentação na conta, me sinto seguro.", nota: 9 },
  { texto: "Abrir conta foi extremamente simples, em dez minutos já estava com o cartão liberado.", nota: 10 },
  { texto: "Meu limite do cartão nunca aumenta, uso o cartão há dois anos sem nenhum atraso.", nota: 4 },
  { texto: "O design é limpo e bonito, não fico perdido procurando funções escondidas.", nota: 9 },
  { texto: "Perdi um boleto agendado porque o app não avisou que o pagamento tinha falhado.", nota: 3 },
  { texto: "O chat de suporte é automático e não resolve nada, sempre preciso ligar para o telefone.", nota: 3 },
  { texto: "Muito bom poder investir direto pelo app sem taxa nenhuma.", nota: 10 },
  { texto: "As tarifas são justas, mas não entendo direito onde elas aparecem na fatura.", nota: 7 },
  { texto: "App caiu durante uma transferência importante e o dinheiro ficou preso por dois dias.", nota: 2 },
  { texto: "Consegui portar meu salário em poucos cliques, sem burocracia nenhuma.", nota: 9 },
  { texto: "Já abri três chamados sobre o mesmo problema e ninguém resolve de verdade.", nota: 1 },
  { texto: "A biometria facial falha demais, preciso digitar senha na maioria das vezes.", nota: 4 },
  { texto: "Gostei muito da organização automática dos gastos por categoria.", nota: 9 },
  { texto: "O cartão virtual para compras online é ótimo, uso todos os dias.", nota: 9 },
  { texto: "Fiquei sem conseguir acessar o app por quase uma semana sem explicação.", nota: 1 },
  { texto: "O suporte por telefone é educado, mas a espera passa de quarenta minutos.", nota: 6 },
  { texto: "Adoro o cofrinho automático, ajuda demais a guardar dinheiro sem esforço.", nota: 9 },
  { texto: "O aplicativo trava direto na tela de extrato, preciso fechar e abrir de novo.", nota: 3 },
  { texto: "Recebi cobrança de uma anuidade que juraram que não existia.", nota: 2 },
  { texto: "A central de ajuda dentro do app é confusa, fico rodando em círculos.", nota: 4 },
  { texto: "O Pix por aproximação é uma mão na roda, uso direto no mercado.", nota: 9 },
  { texto: "Nunca mais quero trocar de banco, o atendimento humano quando funciona é excelente.", nota: 10 },
  { texto: "Demorou dois dias para aprovarem meu cartão adicional sem motivo aparente.", nota: 4 },
  { texto: "A tela de investimentos poderia mostrar mais clareza sobre o risco de cada produto.", nota: 6 },
  { texto: "Simples, rápido e sem letra miúda, é assim que eu gosto de banco.", nota: 9 },
  { texto: "O app trava especialmente à noite, parece que o servidor cai nesse horário.", nota: 3 },
  { texto: "Fui mal atendido no chat, o atendente encerrou a conversa sem resolver nada.", nota: 2 },
  { texto: "Amei a função de dividir a conta com amigos direto pelo Pix.", nota: 9 },
  { texto: "Fatura do cartão vem sem explicação clara das tarifas internacionais.", nota: 5 },
  { texto: "Já indiquei o banco para toda a família, nunca tive problema sério.", nota: 10 },
  { texto: "O aplicativo pede para atualizar toda semana e isso é cansativo.", nota: 5 },
  { texto: "Consegui aumentar meu limite sozinho analisando meu histórico, sem burocracia.", nota: 9 },
  { texto: "A demora para estornar uma compra contestada já passa de vinte dias.", nota: 2 },
  { texto: "Notificação de segurança me salvou de uma tentativa de golpe, muito obrigado.", nota: 10 },
  { texto: "O app deveria avisar antes de descontar a tarifa de manutenção.", nota: 6 },
  { texto: "Interface intuitiva, minha mãe de 70 anos aprendeu a usar sozinha.", nota: 10 },
  { texto: "Perdi o rendimento do mês porque o extrato não carregou corretamente.", nota: 3 },
  { texto: "Adoro que consigo bloquear e desbloquear o cartão na hora, sem ligar para ninguém.", nota: 9 },
  { texto: "O suporte via e-mail nunca responde, só resolvo indo até uma agência física.", nota: 2 },
  { texto: "Muito bom o cashback automático em compras do dia a dia.", nota: 9 },
  { texto: "O aplicativo fecha sozinho quando tento anexar comprovante em um chamado.", nota: 3 },
  { texto: "Adoro a transparência do extrato detalhado, dá para entender cada cobrança.", nota: 9 },
];

export function analiseDemo({ comentarios = [], contexto = "" }: { comentarios?: Comentario[]; contexto?: string } = {}): Omit<Analise, "nps"> {
  const total = Math.max(comentarios.length, 1);
  const tema = (contexto || "o produto").trim() || "o produto";

  const positivo = Math.max(1, Math.round(total * 0.4));
  const negativo = Math.max(1, Math.round(total * 0.37));
  const neutro = Math.max(0, total - positivo - negativo);

  return {
    resumo_executivo: `A maior parte dos comentários sobre ${tema} é positiva, puxada pela facilidade de uso do dia a dia, mas um grupo relevante reclama de estabilidade e de demora no suporte. O time de produto já tem sinal suficiente para priorizar: corrigir travamentos recorrentes e dar mais transparência a prazos. Sem isso, a base de detratores tende a crescer mesmo com elogios ao design.`,
    sentimento: { positivo, neutro, negativo },
    temas: [
      {
        tema: "Estabilidade do aplicativo",
        mencoes: Math.max(3, Math.round(total * 0.22)),
        sentimento_dominante: "negativo",
        exemplos: [
          "O app trava toda vez que tento fazer um Pix maior, preciso reabrir três vezes.",
          "App caiu durante uma transferência importante e o dinheiro ficou preso por dois dias.",
        ],
        acao_sugerida: "Priorizar correção dos travamentos no fluxo de transferências no próximo sprint.",
      },
      {
        tema: "Atendimento e suporte",
        mencoes: Math.max(3, Math.round(total * 0.18)),
        sentimento_dominante: "negativo",
        exemplos: [
          "Abri um chamado sobre uma cobrança errada e até agora, cinco dias depois, ninguém respondeu.",
          "Já abri três chamados sobre o mesmo problema e ninguém resolve de verdade.",
        ],
        acao_sugerida: "Definir SLA público de resposta e alertar o cliente sobre o andamento do chamado.",
      },
      {
        tema: "Facilidade de uso",
        mencoes: Math.max(3, Math.round(total * 0.16)),
        sentimento_dominante: "positivo",
        exemplos: [
          "Consigo resolver tudo em menos de um minuto, é o app mais simples que já usei de banco.",
          "Simples, rápido e sem letra miúda, é assim que eu gosto de banco.",
        ],
        acao_sugerida: "Manter o time de design envolvido nas próximas features para preservar a simplicidade.",
      },
      {
        tema: "Taxas e tarifas",
        mencoes: Math.max(2, Math.round(total * 0.12)),
        sentimento_dominante: "neutro",
        exemplos: [
          "As tarifas são justas, mas eu queria entender melhor onde elas aparecem na fatura.",
          "Fatura do cartão vem sem explicação clara das tarifas internacionais.",
        ],
        acao_sugerida: "Criar um resumo mensal de tarifas com explicação em linguagem simples.",
      },
      {
        tema: "Cartão e limite",
        mencoes: Math.max(2, Math.round(total * 0.1)),
        sentimento_dominante: "neutro",
        exemplos: [
          "Meu limite nunca aumenta mesmo usando o cartão há dois anos sem atraso.",
          "Demorou dois dias para aprovarem meu cartão adicional sem motivo aparente.",
        ],
        acao_sugerida: "Revisar critérios de aumento automático de limite para clientes com bom histórico.",
      },
      {
        tema: "Notificações e segurança",
        mencoes: Math.max(2, Math.round(total * 0.09)),
        sentimento_dominante: "positivo",
        exemplos: [
          "Adoro que recebo aviso na hora de qualquer movimentação, me sinto seguro usando o app.",
          "Notificação de segurança me salvou de uma tentativa de golpe, muito obrigado.",
        ],
        acao_sugerida: "Divulgar mais os recursos de segurança para reduzir a percepção de risco de novos usuários.",
      },
    ],
    elogios_frequentes: [
      "Aplicativo rápido e fácil de usar no dia a dia",
      "Abertura de conta e cartão sem burocracia",
      "Notificações em tempo real de cada movimentação",
      "Design limpo, sem poluição visual",
    ],
    reclamacoes_frequentes: [
      "Travamentos ao fazer transferências e Pix",
      "Suporte demora dias para responder chamados",
      "Limite de cartão não acompanha o tempo de uso",
      "Falta de clareza sobre tarifas cobradas",
    ],
    citacoes_marcantes: [
      { texto: "O app trava toda vez que tento fazer um Pix maior, preciso reabrir três vezes.", sentimento: "negativo" },
      { texto: "Consigo resolver tudo em menos de um minuto, é o app mais simples que já usei de banco.", sentimento: "positivo" },
      { texto: "Abri um chamado sobre uma cobrança errada e até agora, cinco dias depois, ninguém respondeu.", sentimento: "negativo" },
      { texto: "Adoro que recebo aviso na hora de qualquer movimentação, me sinto seguro usando o app.", sentimento: "positivo" },
    ],
    acoes_prioritarias: [
      {
        acao: "Corrigir os travamentos no fluxo de Pix e transferências",
        impacto: "alto",
        esforco: "médio",
        justificativa: "É o tema mais citado entre os comentários negativos e afeta a confiança no uso diário.",
      },
      {
        acao: "Criar alerta automático de status para chamados de suporte",
        impacto: "alto",
        esforco: "baixo",
        justificativa: "Reduz reclamações de silêncio no atendimento com esforço técnico pequeno.",
      },
      {
        acao: "Publicar resumo mensal de tarifas em linguagem simples",
        impacto: "médio",
        esforco: "baixo",
        justificativa: "Resolve a dúvida recorrente sobre cobranças sem exigir mudança de política comercial.",
      },
      {
        acao: "Revisar política de aumento automático de limite",
        impacto: "médio",
        esforco: "alto",
        justificativa: "Impacta a satisfação de clientes antigos, mas exige mudança em política de crédito.",
      },
      {
        acao: "Divulgar recursos de segurança em onboarding",
        impacto: "baixo",
        esforco: "baixo",
        justificativa: "Reforça um ponto já bem avaliado e ajuda a converter novos usuários.",
      },
    ],
  };
}

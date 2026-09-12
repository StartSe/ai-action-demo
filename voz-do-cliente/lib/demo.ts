// Respostas de exemplo usadas quando não há chave de IA configurada.
// As contagens são derivadas do número real de comentários enviados,
// para que a demonstração pareça coerente mesmo sem chamar a IA.
import type { Analise, Comentario } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

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
        exemplo: "O app trava toda vez que tento fazer um Pix maior, preciso reabrir três vezes.",
        acao_sugerida: "Priorizar correção dos travamentos no fluxo de transferências no próximo sprint.",
      },
      {
        tema: "Atendimento e suporte",
        mencoes: Math.max(3, Math.round(total * 0.18)),
        sentimento_dominante: "negativo",
        exemplo: "Abri um chamado sobre uma cobrança errada e até agora, cinco dias depois, ninguém respondeu.",
        acao_sugerida: "Definir SLA público de resposta e alertar o cliente sobre o andamento do chamado.",
      },
      {
        tema: "Facilidade de uso",
        mencoes: Math.max(3, Math.round(total * 0.16)),
        sentimento_dominante: "positivo",
        exemplo: "Consigo resolver tudo em menos de um minuto, é o app mais simples que já usei de banco.",
        acao_sugerida: "Manter o time de design envolvido nas próximas features para preservar a simplicidade.",
      },
      {
        tema: "Taxas e tarifas",
        mencoes: Math.max(2, Math.round(total * 0.12)),
        sentimento_dominante: "neutro",
        exemplo: "As tarifas são justas, mas eu queria entender melhor onde elas aparecem na fatura.",
        acao_sugerida: "Criar um resumo mensal de tarifas com explicação em linguagem simples.",
      },
      {
        tema: "Cartão e limite",
        mencoes: Math.max(2, Math.round(total * 0.1)),
        sentimento_dominante: "neutro",
        exemplo: "Meu limite nunca aumenta mesmo usando o cartão há dois anos sem atraso.",
        acao_sugerida: "Revisar critérios de aumento automático de limite para clientes com bom histórico.",
      },
      {
        tema: "Notificações e segurança",
        mencoes: Math.max(2, Math.round(total * 0.09)),
        sentimento_dominante: "positivo",
        exemplo: "Adoro que recebo aviso na hora de qualquer movimentação, me sinto seguro usando o app.",
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

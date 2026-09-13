// Respostas de exemplo usadas quando não há chave de IA configurada.
// O exemplo corresponde ao contrato em public/exemplo-contrato.txt (prestação de serviços de tecnologia).
import type { Analise } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

export function analiseDemo({ preocupacao = "" }: { papel?: string; preocupacao?: string } = {}): Analise {
  const foco = preocupacao
    ? ` Sobre a sua preocupação ("${preocupacao}"), veja as cláusulas destacadas abaixo e a caixa de perguntas ao final.`
    : "";
  return {
    tipo_contrato: "Contrato de prestação de serviços de tecnologia (desenvolvimento e sustentação de plataforma)",
    resumo_executivo: `Contrato de 24 meses, com R$ 48 mil mensais, para desenvolvimento e sustentação da plataforma de e-commerce da Grupo Aurora pela TechNova. Os pontos que mais pesam contra a contratante são a propriedade do código só após a quitação final, a multa de 30% sobre o saldo em caso de saída antecipada e a responsabilidade da fornecedora limitada a uma mensalidade. Antes de assinar, negocie a cessão progressiva do código, um SLA com penalidades e uma cláusula de proteção de dados de verdade.${foco}`,
    partes: [
      { nome: "Grupo Aurora Varejo S.A.", papel: "Contratante" },
      { nome: "TechNova Soluções Digitais Ltda.", papel: "Contratada" },
    ],
    objeto:
      'Desenvolvimento, evolução e sustentação da plataforma de comércio eletrônico da contratante, incluindo integrações com ERP e meios de pagamento. O escopo detalhado fica para ser definido "ao longo da execução".',
    essencial: {
      valor_mensal: { numero: "R$ 48.000/mês", detalhe: "Até o dia 5, contra nota fiscal. Reajuste anual pelo IGP-M ou índice que a contratada indicar." },
      prazo: { numero: "24 meses", detalhe: "Renovação automática por períodos iguais, salvo aviso com 90 dias de antecedência." },
      multa: { numero: "30% do saldo", detalhe: "Só para a contratante, se sair antes do fim. A fornecedora sai sem multa." },
    },
    nota_risco: 7,
    prazos_criticos: [
      { evento: "Aviso para evitar a renovação automática por mais 24 meses", prazo: "90 dias antes do fim da vigência" },
      { evento: "Pagamento da mensalidade (atraso gera multa de 2% mais juros)", prazo: "Até o dia 5 de cada mês" },
      { evento: "Homologação das entregas; depois disso o aceite é tácito", prazo: "5 dias úteis após cada entrega" },
      { evento: "Prazo para corrigir um descumprimento antes da rescisão por culpa", prazo: "30 dias após a notificação" },
      { evento: "Entrega de dados e código após o término, condicionada à quitação", prazo: "Até 60 dias após a rescisão" },
      { evento: "Proibição de contratar colaboradores da TechNova", prazo: "Durante o contrato e 12 meses depois" },
    ],
    clausulas_risco: [
      {
        clausula: "Cláusula 7 – Propriedade intelectual",
        trecho: "permanecerão de propriedade da CONTRATADA até a quitação integral de todos os valores devidos ao término do contrato",
        risco: "Durante 24 meses a Aurora paga pelo desenvolvimento mas não é dona do código. Em uma disputa ou saída, fica sem a plataforma que sustenta suas vendas.",
        severidade: "alta",
        sugestao_negociacao: "Cessão automática do código a cada entrega paga, com depósito do fonte em repositório da contratante.",
      },
      {
        clausula: "Cláusula 11 – Limitação de responsabilidade",
        trecho: "limitada ao valor de 1 (uma) mensalidade ... inclusive em casos de indisponibilidade da plataforma ou perda de dados",
        risco: "Um dia de loja fora do ar ou uma perda de dados pode custar muito mais que R$ 48 mil, e o contrato exclui lucros cessantes.",
        severidade: "alta",
        sugestao_negociacao: "Teto de 12 mensalidades e exclusão do limite em casos de dolo, culpa grave, vazamento de dados e violação de confidencialidade.",
      },
      {
        clausula: "Cláusula 10 – Rescisão",
        trecho: "multa equivalente a 30% (trinta por cento) do valor remanescente do contrato",
        risco: "Sair no mês 6 custa cerca de R$ 259 mil. A multa é só para a contratante; a fornecedora pode sair com aviso de 90 dias sem pagar nada.",
        severidade: "alta",
        sugestao_negociacao: "Multa recíproca, decrescente ao longo do prazo, e sem multa após 12 meses ou em caso de descumprimento de SLA.",
      },
      {
        clausula: "Cláusula 10 – Transição após o término",
        trecho: "em até 60 (sessenta) dias após a quitação de eventuais pendências financeiras",
        risco: "Qualquer valor em discussão trava a entrega do código e dos dados. A operação pode ficar refém enquanto a disputa dura.",
        severidade: "alta",
        sugestao_negociacao: "Entrega imediata dos dados e do código na rescisão, independentemente de pendências, com período de transição assistida de 90 dias.",
      },
      {
        clausula: "Cláusula 6 – Aceite tácito",
        trecho: "sendo consideradas aceitas tacitamente as entregas não contestadas nesse prazo",
        risco: "Cinco dias úteis é pouco para testar uma integração de pagamento. Um bug descoberto na semana seguinte vira hora extra a R$ 220.",
        severidade: "média",
        sugestao_negociacao: "Prazo de 15 dias úteis, critérios de aceite escritos no anexo e garantia de correção sem custo por 90 dias após o aceite.",
      },
      {
        clausula: "Cláusula 3 – Reajuste",
        trecho: "pelo IGP-M ou por índice que a CONTRATADA venha a indicar",
        risco: "A fornecedora pode escolher o índice mais alto a cada ano. O IGP-M já é volátil; o texto permite algo pior.",
        severidade: "média",
        sugestao_negociacao: "Reajuste anual pelo IPCA, aplicado só após 12 meses, com teto e sem troca unilateral de índice.",
      },
      {
        clausula: "Cláusula 4 – Níveis de serviço",
        trecho: "empregará seus melhores esforços para atender aos chamados",
        risco: '"Melhores esforços" não é compromisso. Há prazo de atendimento inicial, mas nenhum prazo de solução nem penalidade por descumprimento.',
        severidade: "média",
        sugestao_negociacao: "SLA com disponibilidade mínima de 99,5%, prazos de solução por severidade e desconto automático na fatura quando não cumprido.",
      },
      {
        clausula: "Cláusula 13 – Subcontratação",
        trecho: "poderá subcontratar parte dos serviços a seu exclusivo critério",
        risco: "Dados de clientes podem passar por terceiros que a Aurora não conhece nem aprovou.",
        severidade: "baixa",
        sugestao_negociacao: "Subcontratação só com aviso prévio, lista de subcontratados e as mesmas obrigações de sigilo e proteção de dados.",
      },
    ],
    obrigacoes_principais: [
      "Pagar R$ 48.000,00 até o dia 5 de cada mês, contra nota fiscal.",
      "Aprovar por e-mail qualquer hora adicional fora do escopo (R$ 220,00 por hora).",
      "Fornecer acessos, ambientes e informações necessários em tempo hábil.",
      "Designar um responsável técnico para acompanhar o contrato.",
      "Homologar cada entrega em até 5 dias úteis, sob pena de aceite tácito.",
      "Avisar com 90 dias de antecedência para não renovar automaticamente.",
      "Não contratar colaboradores da TechNova durante a vigência e por 12 meses após o término.",
    ],
    pontos_ausentes: [
      "SLA com metas de disponibilidade, prazos de solução e penalidades.",
      "Cláusula de proteção de dados detalhada: papéis de controlador e operador, comunicação de incidentes e regras para subcontratados.",
      "Plano de transição e saída (transferência de conhecimento, ambientes e credenciais).",
      "Garantia dos entregáveis após o aceite (correção de defeitos sem custo).",
      "Teto mensal para horas adicionais e critério de aprovação formal.",
      "Definição de quem é dono dos dados de clientes e pedidos processados na plataforma.",
      "Escopo mínimo e critérios de aceite no Anexo I (hoje o anexo é referido, mas não define nada).",
      "Seguro de responsabilidade civil ou garantia para cobrir incidentes graves.",
    ],
    perguntas_para_o_juridico: [
      "É possível condicionar a multa rescisória de 30% ao cumprimento do SLA pela contratada?",
      "Como estruturar a cessão progressiva do código-fonte sem depender de termo específico ao final?",
      "A cláusula de não solicitação (12 meses, multa de 12 salários) é executável nos termos atuais?",
      "Qual redação de proteção de dados precisamos exigir considerando dados de clientes e pagamentos?",
      "O foro em Campinas traz algum prejuízo prático para nós, com sede em São Paulo?",
      "Podemos exigir que a limitação de responsabilidade não se aplique a vazamento de dados?",
    ],
  };
}

const RESPOSTAS: { teste: RegExp; resposta: string }[] = [
  {
    teste: /rescis|cancel|encerr|sair|romper|multa/i,
    resposta:
      "Pela Cláusula 10, você pode rescindir sem motivo com aviso prévio de 90 dias, mas, se fizer isso antes do fim dos 24 meses, paga multa de 30% do valor remanescente. Saindo no mês 12, por exemplo, sobram 12 mensalidades (R$ 576 mil) e a multa seria de cerca de R$ 173 mil. Se a saída for por descumprimento da TechNova, é preciso notificar e dar 30 dias para correção; só depois a rescisão por culpa fica caracterizada, sem multa para você.\n\nAtenção: a multa vale só para a contratante. Vale pedir reciprocidade e uma redução progressiva ao longo do prazo. Confirme com o jurídico a caracterização de inadimplemento antes de notificar.",
  },
  {
    teste: /propriedade|código|codigo|fonte|intelectual|dono|licen/i,
    resposta:
      "A Cláusula 7 diz que código-fonte, documentação e demais entregáveis permanecem de propriedade da TechNova até a quitação integral ao término do contrato, quando seriam cedidos à Aurora mediante termo específico. Na prática, durante os 24 meses você paga pelo desenvolvimento sem ser dono do resultado, e componentes proprietários da fornecedora são apenas licenciados enquanto o contrato vigora.\n\nO ponto a negociar é a cessão automática a cada entrega paga, com o fonte depositado em repositório seu, e uma licença perpétua sobre os componentes proprietários usados na plataforma. Peça ao jurídico a redação do termo de cessão desde já, não ao final.",
  },
  {
    teste: /reajust|valor|preço|preco|pagamento|mensalidade|índice|indice|igp|hora/i,
    resposta:
      'A Cláusula 3 fixa R$ 48.000,00 por mês, pagos até o dia 5 contra nota fiscal, com reajuste anual pelo IGP-M "ou por índice que a CONTRATADA venha a indicar". Esse trecho permite à fornecedora escolher o índice, o que deixa o custo imprevisível. Horas fora do escopo custam R$ 220,00 mediante aprovação por e-mail, sem teto mensal.\n\nSugestão: trocar para IPCA, aplicado apenas após 12 meses e sem troca unilateral, e definir um teto de horas adicionais por mês com aprovação formal. O jurídico pode confirmar se a redação atual já permite contestar um índice indicado unilateralmente.',
  },
];

export function respostaDemo(pergunta = ""): string {
  const pronta = RESPOSTAS.find((r) => r.teste.test(pergunta));
  if (pronta) return pronta.resposta;
  return `Em modo demonstração, respondo com base no contrato de exemplo entre Grupo Aurora e TechNova. Sobre "${pergunta}": o contrato não trata desse ponto de forma específica. As cláusulas mais relevantes para a contratante são a 7 (propriedade do código só após quitação), a 10 (multa de 30% na saída antecipada) e a 11 (responsabilidade limitada a uma mensalidade). Com a IA conectada, a resposta é construída a partir do seu contrato real, citando o trecho que sustenta cada afirmação. Confirme os pontos com o seu departamento jurídico.`;
}

// Respostas de exemplo usadas quando não há chave de IA (ou de transcrição) configurada.
import type { Ata } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

const TRANSCRICAO_EXEMPLO = `Renata Cavalcanti: Bom dia a todos. Vamos abrir a reunião de diretoria de setembro. A pauta de hoje é o fechamento do terceiro trimestre, o lançamento da linha de snacks saudáveis, o orçamento de marketing para o último trimestre e um ponto de atenção que o Thiago trouxe sobre o fornecedor de embalagens. Marcelo, pode começar com os números?

Marcelo Duarte: Claro. Fechamos o trimestre com receita de 42 milhões, 6% acima do orçado. A margem bruta caiu meio ponto percentual por causa do custo de matéria-prima, mas ainda estamos dentro da faixa que prometemos ao conselho. O ponto de atenção é o caixa: consumimos mais capital de giro do que o previsto por causa do estoque extra que compramos para o lançamento de outubro. Proponho que a gente corte 10% do orçamento de marketing do quarto trimestre para recompor a posição de caixa até dezembro.

Juliana Prado: Eu entendo a preocupação, Marcelo, mas cortar marketing justamente no trimestre do lançamento me preocupa. Proponho um meio-termo: cortamos 10% do orçamento de mídia paga, mas mantemos o investimento em ativação nos pontos de venda.

Renata Cavalcanti: Faz sentido. Vamos fechar assim: corte de 10% em mídia paga, mantendo ativação em ponto de venda. Marcelo, você ajusta o orçamento e manda para o meu aval até sexta-feira, dia 18.

Thiago Almeida: Sobre a embalagem do lançamento: o fornecedor atual, a Envoplast, avisou que pode atrasar a entrega do novo filme biodegradável em até duas semanas. Já pedi uma cotação emergencial com a Bioempaque, 18% mais cara, como plano B. Confirmo a resposta deles até quarta-feira, dia 16.

Renata Cavalcanti: Combinado. Decisão: manter a data de lançamento de 15 de outubro, com plano de contingência de embalagem via Bioempaque se a Envoplast não confirmar até dia 16.

Patrícia Nunes: Sobre o congelamento de contratações: o time comercial está sem gerente de contas na região Sul desde julho, o que já atrasou renovações de contrato. Peço exceção para abrir a vaga agora.

Renata Cavalcanti: Aprovado. Patrícia, publique a vaga até dia 18 com meta de contratar até o fim de outubro. Por fim, a política de trabalho remoto segue pendente: Patrícia precisa de mais duas semanas para alinhar com os gerentes de área antes de trazer a proposta.`;

export function transcricaoDemo(): string {
  return TRANSCRICAO_EXEMPLO;
}

export function ataDemo({ titulo }: { titulo?: string } = {}): Ata {
  return {
    titulo: titulo || "Reunião de diretoria — Vetta Alimentos (setembro/2026)",
    resumo_executivo:
      "A diretoria fechou o terceiro trimestre com receita 6% acima do orçado, mas decidiu cortar 10% do orçamento de mídia paga do quarto trimestre para recompor o caixa consumido pelo estoque do lançamento de outubro. O lançamento da linha de snacks saudáveis segue confirmado para 15 de outubro, com plano de contingência para o risco de atraso na embalagem. Foi aprovada uma exceção ao congelamento de contratações para preencher a vaga de gerente de contas da região Sul, parada desde julho. A proposta de política de trabalho remoto ficou pendente para a próxima reunião.",
    decisoes: [
      {
        decisao: "Cortar 10% do orçamento de mídia paga do quarto trimestre, mantendo o investimento em ativação de ponto de venda.",
        contexto: "O caixa consumiu mais capital de giro do que o previsto por causa do estoque extra comprado para o lançamento de outubro.",
      },
      {
        decisao: "Manter a data de lançamento da linha de snacks saudáveis em 15 de outubro, com plano de contingência de embalagem via Bioempaque caso a Envoplast não confirme entrega.",
        contexto: "O fornecedor atual (Envoplast) sinalizou possível atraso de até duas semanas na entrega do filme biodegradável.",
      },
      {
        decisao: "Abrir exceção ao congelamento de contratações para a vaga de gerente de contas da região Sul.",
        contexto: "A posição está sem cobertura desde julho e a região responde por 12% da receita, com renovações de contrato já atrasadas.",
      },
    ],
    acoes: [
      { acao: "Ajustar o orçamento de marketing do quarto trimestre com o corte de 10% em mídia paga e enviar para aprovação.", responsavel: "Marcelo Duarte", prazo: "2026-09-18" },
      { acao: "Confirmar com a Bioempaque um plano de contingência de embalagem, a ser acionado se a Envoplast não confirmar entrega.", responsavel: "Thiago Almeida", prazo: "2026-09-16" },
      { acao: "Publicar a vaga de gerente de contas da região Sul.", responsavel: "Patrícia Nunes", prazo: "2026-09-18" },
      { acao: "Contratar o gerente de contas da região Sul.", responsavel: "Patrícia Nunes", prazo: "2026-10-31" },
      { acao: "Dar retorno final sobre o orçamento ajustado para o fechamento do mês no sistema.", responsavel: "Renata Cavalcanti", prazo: "2026-09-17" },
    ],
    riscos_e_bloqueios: [
      "Possível atraso de até duas semanas do fornecedor Envoplast na entrega do filme biodegradável, o que adiaria o lançamento de outubro.",
      "Custo 18% mais alto do fornecedor alternativo (Bioempaque), caso o plano de contingência seja acionado.",
      "Consumo de capital de giro acima do previsto por causa do estoque extra do lançamento.",
    ],
    pendencias: ["Proposta de política de trabalho remoto, a ser apresentada por Patrícia Nunes na próxima reunião."],
    proximos_passos:
      "A diretoria confirma o fornecedor de embalagem definitivo após o dia 16 de setembro e retoma a discussão da política de trabalho remoto assim que a proposta da Patrícia estiver pronta.",
    email_followup: {
      assunto: "Ata da reunião de diretoria — decisões e ações (setembro/2026)",
      corpo:
        "Olá a todos,\n\nSegue o resumo das decisões e ações combinadas na reunião de diretoria de 10 de setembro:\n\n- Corte de 10% no orçamento de mídia paga do quarto trimestre, mantendo o investimento em ponto de venda (Marcelo, até 18/09).\n- Lançamento da linha de snacks saudáveis mantido para 15 de outubro, com plano de contingência de embalagem via Bioempaque (Thiago, confirmação até 16/09).\n- Abertura de exceção ao congelamento de contratações para a vaga de gerente de contas da região Sul (Patrícia, vaga publicada até 18/09 e contratação prevista para o fim de outubro).\n- Política de trabalho remoto segue pendente e volta à pauta na próxima reunião.\n\nQualquer dúvida, me procurem.\n\nAbraços,\nRenata",
    },
  };
}

// Radar de exemplo usado quando não há chave de IA configurada (ou pelo atalho ?exemplo=1).
import type { Aresta, No, Radar, Sinal } from "./types";

export function esperar(ms = 1300) {
  return new Promise((r) => setTimeout(r, ms));
}

const TEMAS = ["Agentes de IA no atendimento ao cliente", "Regulação de inteligência artificial no Brasil", "Concorrência em pagamentos e carteiras digitais"];

/** Data ISO a "fracaoDoPeriodo" (0 a 1) de distância de hoje, sempre dentro do período pedido. */
function dataNoPeriodo(periodoDias: number, fracaoDoPeriodo: number): string {
  const dias = Math.max(1, Math.round(periodoDias * fracaoDoPeriodo));
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString();
}

/** Radar fictício, mas completo e coerente: 3 temas, 11 sinais, 27 nós, fontes plausíveis dentro do período. */
export function radarDemo(periodoDias = 30): Radar {
  const dia = (f: number) => dataNoPeriodo(periodoDias, f);

  const sinais: Sinal[] = [
    {
      id: "sinal-1",
      titulo: "Bancos digitais ampliam atendimento por agentes de IA",
      resumo: "Duas fintechs de peso trocaram parte do atendimento por chat por agentes de IA com acesso a sistemas internos, reduzindo o tempo médio de resposta.",
      forca: "alta",
      tendencia: "subindo",
      temas: [TEMAS[0]],
      fontes: [
        { titulo: "Fintechs escalam atendimento com agentes de IA no lugar de humanos", url: "", veiculo: "Valor Econômico", publicadoEm: dia(0.06) },
        { titulo: "Como bancos digitais estão automatizando o suporte com IA generativa", url: "", veiculo: "TechCrunch", publicadoEm: dia(0.18) },
      ],
      oQueFazer: "Mapear onde um agente de IA já resolveria boa parte dos atendimentos de hoje e desenhar um piloto de 90 dias num canal de baixo risco.",
    },
    {
      id: "sinal-2",
      titulo: "Projeto de regulação de IA volta à pauta do Senado",
      resumo: "O texto que trata de obrigações para sistemas de IA de alto risco retomou a tramitação, com previsão de votação nas próximas semanas.",
      forca: "alta",
      tendencia: "subindo",
      temas: [TEMAS[1]],
      fontes: [
        { titulo: "Comissão retoma discussão do marco regulatório de IA", url: "", veiculo: "Consultor Jurídico (Conjur)", publicadoEm: dia(0.1) },
        { titulo: "Senado pauta votação de projeto sobre inteligência artificial", url: "", veiculo: "Agência Senado", publicadoEm: dia(0.22) },
      ],
      oQueFazer: "Levar o texto para o jurídico avaliar o impacto nos usos de IA já em produção antes da votação.",
    },
    {
      id: "sinal-3",
      titulo: "Concorrente internacional de pagamentos anuncia entrada no Brasil",
      resumo: "Uma plataforma de pagamentos com forte presença na Ásia confirmou operação local, com foco inicial em pequenos varejistas.",
      forca: "alta",
      tendencia: "subindo",
      temas: [TEMAS[2]],
      fontes: [
        { titulo: "Gigante asiática de pagamentos confirma chegada ao Brasil", url: "", veiculo: "Bloomberg Línea", publicadoEm: dia(0.08) },
        { titulo: "Nova concorrente mira pequenos varejistas com taxas menores", url: "", veiculo: "Brazil Journal", publicadoEm: dia(0.3) },
      ],
      oQueFazer: "Simular o efeito de uma guerra de tarifas na margem do produto de pagamentos antes de o concorrente ganhar tração.",
    },
    {
      id: "sinal-4",
      titulo: "Adoção de agentes de voz cresce em centrais de atendimento",
      resumo: "Centrais de atendimento vêm testando agentes de voz para as primeiras etapas da ligação, escalando para humano só nos casos complexos.",
      forca: "media",
      tendencia: "subindo",
      temas: [TEMAS[0]],
      fontes: [
        { titulo: "Centrais de atendimento testam triagem por voz com IA", url: "", veiculo: "Época Negócios", publicadoEm: dia(0.14) },
        { titulo: "Discussão sobre agentes de voz em produção ganha tração", url: "", veiculo: "Reddit r/artificial", publicadoEm: dia(0.35) },
      ],
      oQueFazer: "Testar um piloto de atendimento por voz num fluxo simples (ex.: agendamento) antes de escalar para casos complexos.",
    },
    {
      id: "sinal-5",
      titulo: "União Europeia detalha regras para IA de alto risco",
      resumo: "Novas diretrizes esclarecem quais usos de IA entram na categoria de alto risco e quais obrigações de documentação passam a valer.",
      forca: "media",
      tendencia: "estavel",
      temas: [TEMAS[1]],
      fontes: [
        { titulo: "Bruxelas publica orientação sobre IA de alto risco", url: "", veiculo: "Reuters", publicadoEm: dia(0.2) },
        { titulo: "O que muda com o detalhamento das regras europeias de IA", url: "", veiculo: "The Information", publicadoEm: dia(0.42) },
      ],
      oQueFazer: "Conferir se algum uso interno de IA se enquadraria como 'alto risco' pelo critério europeu, mesmo operando só no Brasil.",
    },
    {
      id: "sinal-6",
      titulo: "Carteira digital chinesa testa cashback agressivo em São Paulo",
      resumo: "Uma carteira digital de capital chinês começou a oferecer cashback acima da média do mercado em bairros de alto tráfego de São Paulo.",
      forca: "alta",
      tendencia: "subindo",
      temas: [TEMAS[2]],
      fontes: [
        { titulo: "Carteira digital chinesa oferece cashback de até 15% em SP", url: "", veiculo: "InfoMoney", publicadoEm: dia(0.12) },
        { titulo: "Disputa por usuários de carteiras digitais esquenta em São Paulo", url: "", veiculo: "Brazil Journal", publicadoEm: dia(0.28) },
      ],
      oQueFazer: "Medir a sensibilidade a preço da base de clientes mais jovem antes de reagir com desconto.",
    },
    {
      id: "sinal-7",
      titulo: "Rodadas de investimento em IA de atendimento ficam maiores",
      resumo: "Startups que vendem agentes de IA para atendimento levantaram rodadas bem acima da média do setor nas últimas semanas.",
      forca: "media",
      tendencia: "subindo",
      temas: [TEMAS[0]],
      fontes: [
        { titulo: "Startup de agentes de atendimento levanta rodada robusta", url: "", veiculo: "TechCrunch", publicadoEm: dia(0.16) },
        { titulo: "Investidores apostam alto em IA para atendimento ao cliente", url: "", veiculo: "Exame", publicadoEm: dia(0.38) },
      ],
      oQueFazer: "Avaliar dois ou três fornecedores dessa nova geração antes do próximo ciclo de orçamento, mesmo sem decisão de compra.",
    },
    {
      id: "sinal-8",
      titulo: "Autoridade de dados abre consulta pública sobre uso de IA",
      resumo: "A consulta pública pede contribuições sobre tratamento de dados pessoais em sistemas de IA usados por empresas privadas.",
      forca: "baixa",
      tendencia: "estavel",
      temas: [TEMAS[1]],
      fontes: [
        { titulo: "Autoridade de dados abre consulta sobre IA e privacidade", url: "", veiculo: "Agência Brasil", publicadoEm: dia(0.24) },
        { titulo: "Empresas têm prazo para comentar regras de dados e IA", url: "", veiculo: "Consultor Jurídico (Conjur)", publicadoEm: dia(0.5) },
      ],
      oQueFazer: "Registrar a data limite da consulta e decidir se vale a empresa contribuir formalmente.",
    },
    {
      id: "sinal-9",
      titulo: "Rede de varejo integra carteira própria ao super-app",
      resumo: "Uma rede de varejo com presença nacional uniu sua carteira digital a um super-app único de compras e pagamentos.",
      forca: "media",
      tendencia: "subindo",
      temas: [TEMAS[2]],
      fontes: [
        { titulo: "Varejista nacional unifica pagamentos num só aplicativo", url: "", veiculo: "Exame", publicadoEm: dia(0.2) },
        { titulo: "Super-apps de varejo avançam sobre o espaço das fintechs", url: "", veiculo: "Brazil Journal", publicadoEm: dia(0.44) },
      ],
      oQueFazer: "Olhar se algum parceiro de varejo relevante para o negócio está caminhando na mesma direção.",
    },
    {
      id: "sinal-10",
      titulo: "Pesquisas mostram insatisfação recorrente com bots de atendimento",
      resumo: "Levantamentos recentes voltam a apontar frustração de clientes com respostas genéricas de bots, mesmo em empresas que investiram pesado em IA.",
      forca: "media",
      tendencia: "subindo",
      temas: [TEMAS[0]],
      fontes: [
        { titulo: "Clientes ainda reclamam de bots que não resolvem o problema", url: "", veiculo: "Época Negócios", publicadoEm: dia(0.26) },
        { titulo: "Discussão sobre limites dos bots de atendimento ganha força", url: "", veiculo: "Reddit r/technology", publicadoEm: dia(0.46) },
      ],
      oQueFazer: "Comparar a nota de satisfação do atendimento por IA com o humano antes de ampliar o escopo do bot.",
    },
    {
      id: "sinal-11",
      titulo: "Provedores de nuvem lançam pacotes prontos de agentes de IA",
      resumo: "Grandes provedores de nuvem passaram a oferecer pacotes prontos para montar agentes de atendimento com poucas linhas de configuração.",
      forca: "media",
      tendencia: "subindo",
      temas: [TEMAS[0]],
      fontes: [
        { titulo: "Repositório de referência para agentes de atendimento passa de 10 mil estrelas", url: "", veiculo: "GitHub", publicadoEm: dia(0.09) },
        { titulo: "Discussão técnica sobre pacotes prontos de agentes de IA viraliza", url: "", veiculo: "Hacker News", publicadoEm: dia(0.32) },
      ],
      oQueFazer: "Pedir para o time técnico avaliar se um pacote pronto reduz o tempo do piloto interno de atendimento.",
    },
  ];

  const nos: No[] = [
    { id: "tema-1", rotulo: TEMAS[0], tipo: "tema", peso: 10 },
    { id: "tema-2", rotulo: TEMAS[1], tipo: "tema", peso: 9 },
    { id: "tema-3", rotulo: TEMAS[2], tipo: "tema", peso: 9 },
    ...sinais.map((s) => ({ id: s.id, rotulo: s.titulo, tipo: "sinal" as const, peso: s.forca === "alta" ? 8 : s.forca === "media" ? 6 : 4 })),
    { id: "ator-1", rotulo: "OpenAI", tipo: "ator", peso: 6 },
    { id: "ator-2", rotulo: "Nubank", tipo: "ator", peso: 7 },
    { id: "ator-3", rotulo: "Itaú Unibanco", tipo: "ator", peso: 6 },
    { id: "ator-4", rotulo: "PicPay", tipo: "ator", peso: 5 },
    { id: "ator-5", rotulo: "Banco Central do Brasil (BCB)", tipo: "ator", peso: 7 },
    { id: "ator-6", rotulo: "Ant Group (Alipay+)", tipo: "ator", peso: 6 },
    { id: "ator-7", rotulo: "Autoridade Nacional de Proteção de Dados (ANPD)", tipo: "ator", peso: 6 },
    { id: "tech-1", rotulo: "Modelos de linguagem multimodais", tipo: "tecnologia", peso: 6 },
    { id: "tech-2", rotulo: "Agentes com uso de ferramentas (tool use)", tipo: "tecnologia", peso: 6 },
    { id: "tech-3", rotulo: "Autenticação biométrica", tipo: "tecnologia", peso: 4 },
    { id: "tech-4", rotulo: "Pix automático", tipo: "tecnologia", peso: 5 },
    { id: "tech-5", rotulo: "Protocolo MCP (Model Context Protocol)", tipo: "tecnologia", peso: 5 },
    { id: "tech-6", rotulo: "Infraestrutura de nuvem soberana", tipo: "tecnologia", peso: 4 },
  ];

  const arestas: Aresta[] = [
    { origem: "sinal-1", destino: "tema-1", relacao: "pertence a", peso: 5 },
    { origem: "sinal-1", destino: "ator-2", relacao: "protagoniza", peso: 4 },
    { origem: "sinal-1", destino: "ator-3", relacao: "reage a", peso: 3 },
    { origem: "sinal-1", destino: "tech-1", relacao: "usa", peso: 3 },
    { origem: "sinal-1", destino: "tech-2", relacao: "usa", peso: 3 },
    { origem: "sinal-2", destino: "tema-2", relacao: "pertence a", peso: 5 },
    { origem: "sinal-2", destino: "ator-5", relacao: "acompanha", peso: 3 },
    { origem: "sinal-3", destino: "tema-3", relacao: "pertence a", peso: 5 },
    { origem: "sinal-3", destino: "ator-6", relacao: "protagoniza", peso: 4 },
    { origem: "sinal-3", destino: "ator-4", relacao: "compete com", peso: 3 },
    { origem: "sinal-4", destino: "tema-1", relacao: "pertence a", peso: 4 },
    { origem: "sinal-4", destino: "tech-2", relacao: "usa", peso: 3 },
    { origem: "sinal-5", destino: "tema-2", relacao: "pertence a", peso: 4 },
    { origem: "sinal-6", destino: "tema-3", relacao: "pertence a", peso: 5 },
    { origem: "sinal-6", destino: "ator-6", relacao: "protagoniza", peso: 4 },
    { origem: "sinal-6", destino: "tech-3", relacao: "usa", peso: 2 },
    { origem: "sinal-7", destino: "tema-1", relacao: "pertence a", peso: 4 },
    { origem: "sinal-7", destino: "tech-1", relacao: "usa", peso: 3 },
    { origem: "sinal-8", destino: "tema-2", relacao: "pertence a", peso: 4 },
    { origem: "sinal-8", destino: "ator-7", relacao: "protagoniza", peso: 4 },
    { origem: "sinal-9", destino: "tema-3", relacao: "pertence a", peso: 4 },
    { origem: "sinal-9", destino: "tech-4", relacao: "usa", peso: 3 },
    { origem: "sinal-10", destino: "tema-1", relacao: "pertence a", peso: 4 },
    { origem: "sinal-10", destino: "sinal-1", relacao: "contrapõe", peso: 3 },
    { origem: "sinal-11", destino: "tema-1", relacao: "pertence a", peso: 4 },
    { origem: "sinal-11", destino: "tech-5", relacao: "usa", peso: 3 },
    { origem: "sinal-11", destino: "tech-6", relacao: "usa", peso: 2 },
    { origem: "sinal-11", destino: "sinal-7", relacao: "reforça", peso: 3 },
    { origem: "sinal-2", destino: "sinal-8", relacao: "reforça", peso: 3 },
    { origem: "sinal-3", destino: "sinal-6", relacao: "reforça", peso: 3 },
    { origem: "sinal-1", destino: "ator-1", relacao: "referencia", peso: 2 },
  ];

  const conexoes = [
    {
      titulo: "Bancos e fintechs correm para blindar o atendimento com IA antes da regulação apertar",
      explicacao: "A adoção de agentes de IA no atendimento (bancos, voz, novos aportes) avança no mesmo momento em que o projeto de regulação volta à pauta do Senado — quem não documentar como usa IA hoje corre o risco de ter que refazer processos depois.",
      nos: ["sinal-1", "sinal-2", "sinal-4", "sinal-7"],
    },
    {
      titulo: "Pagamentos digitais viram território de disputa entre players internacionais",
      explicacao: "A entrada de um concorrente internacional e o cashback agressivo de uma carteira chinesa em São Paulo miram o mesmo público e podem forçar uma resposta de preço das fintechs locais.",
      nos: ["sinal-3", "sinal-6", "ator-6", "ator-4"],
    },
    {
      titulo: "O risco reputacional dos agentes de atendimento ainda não tem resposta pronta",
      explicacao: "Enquanto a adoção de IA no atendimento acelera, pesquisas já mostram insatisfação recorrente com bots — o ritmo de expansão pode estar maior que a maturidade da experiência entregue.",
      nos: ["sinal-10", "sinal-1", "sinal-11"],
    },
  ];

  return { periodoDias, sinais, nos, arestas, conexoes };
}

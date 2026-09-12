// Respostas de exemplo usadas quando não há chave de IA configurada.
import type { PDI } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

export function pdiDemo({ nome = "Marina Costa" }: { nome?: string; cargo?: string } = {}): PDI {
  const primeiro = nome.split(" ")[0];
  return {
    resumo: `${primeiro} entrega com consistência e já influencia decisões fora da própria área. O próximo salto é sair da execução impecável para a liderança de resultados: definir metas, delegar e negociar prioridades com outras áreas.`,
    pontos_fortes: [
      { titulo: "Execução confiável", evidencia: "Campanhas entregues no prazo nos últimos três trimestres, com orçamento respeitado." },
      { titulo: "Visão de cliente", evidencia: "Trouxe insights de pesquisa que mudaram o posicionamento do produto principal." },
      { titulo: "Colaboração", evidencia: "É procurada por vendas e produto para alinhar mensagens e materiais." },
    ],
    lacunas: [
      { competencia: "Gestão por indicadores", impacto: "Dificulta mostrar o retorno das ações para a diretoria.", prioridade: "alta" },
      { competencia: "Delegação e desenvolvimento do time", impacto: "Concentra decisões e vira gargalo em períodos de pico.", prioridade: "alta" },
      { competencia: "Negociação com áreas parceiras", impacto: "Prioridades mudam sem contrapartida, comprometendo o planejamento.", prioridade: "média" },
    ],
    objetivos: [
      {
        titulo: "Liderar pelo resultado, não pela entrega",
        resultado_esperado: "Painel mensal de marketing com metas, resultados e aprendizados apresentado à diretoria.",
        indicador: "3 apresentações mensais realizadas até o fim do trimestre",
        acoes: [
          { prazo: "30 dias", acao: "Definir com a liderança as 5 métricas que importam para o negócio e montar a primeira versão do painel." },
          { prazo: "60 dias", acao: "Apresentar o painel na reunião de diretoria e coletar feedback sobre clareza e utilidade." },
          { prazo: "90 dias", acao: "Ajustar metas do time com base nos resultados e publicar o plano do próximo trimestre." },
        ],
      },
      {
        titulo: "Formar sucessores no time",
        resultado_esperado: "Dois analistas assumindo frentes completas com autonomia.",
        indicador: "2 projetos liderados por analistas sem intervenção direta",
        acoes: [
          { prazo: "30 dias", acao: "Mapear as atividades que só ela executa hoje e escolher duas para delegar." },
          { prazo: "60 dias", acao: "Fazer reuniões semanais de acompanhamento de 20 minutos com cada analista responsável." },
          { prazo: "90 dias", acao: "Registrar aprendizados e formalizar as novas responsabilidades na descrição de cargo." },
        ],
      },
      {
        titulo: "Negociar prioridades com clareza",
        resultado_esperado: "Acordos explícitos de escopo e prazo com vendas e produto.",
        indicador: "Zero mudanças de prioridade sem registro de impacto no trimestre",
        acoes: [
          { prazo: "30 dias", acao: "Criar um modelo simples de pedido de demanda com objetivo, prazo e impacto esperado." },
          { prazo: "60 dias", acao: "Conduzir a reunião quinzenal de prioridades com vendas usando o modelo." },
          { prazo: "90 dias", acao: "Levar à liderança os conflitos de prioridade recorrentes com proposta de solução." },
        ],
      },
    ],
    recursos: [
      { tipo: "Mentoria", nome: "Conversas quinzenais com a diretora comercial", motivo: "Acelera a fluência em indicadores de negócio e negociação." },
      { tipo: "Curso", nome: "Gestão de pessoas para novos líderes", motivo: "Base prática de delegação, feedback e acompanhamento." },
      { tipo: "Leitura", nome: "Measure What Matters (John Doerr)", motivo: "Método simples para transformar objetivos da empresa em metas do time." },
    ],
    conversa_sugerida: [
      "Qual resultado deste trimestre você mais gostaria de mostrar para a diretoria?",
      "O que você faz hoje que ninguém mais no time saberia fazer?",
      "Em quais momentos as prioridades mudaram sem que você fosse consultada?",
    ],
  };
}

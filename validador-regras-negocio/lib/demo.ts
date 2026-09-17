// Resposta de exemplo usada quando não há chave de IA configurada.
import type { ResultadoValidacao } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

export function validacaoDemo(): ResultadoValidacao {
  return {
    canvas: {
      segmentoClientes: "Academias e estúdios de treino personalizado com até 30 alunos, que hoje controlam agenda e cobrança em papel ou planilha.",
      propostaValor: "Aplicativo de agendamento de aulas e cobrança automática dos alunos, pronto para usar sem contratar ninguém de tecnologia.",
      canais: "Anúncios pagos no Instagram e indicação de academias que já são clientes.",
      relacionamentoClientes: "Suporte por WhatsApp em horário comercial, sem atendimento dedicado por conta.",
      fontesReceita: "Assinatura mensal de R$ 79 por academia, sem limite de alunos cadastrados.",
      recursosChave: "A própria plataforma de agendamento e um time de suporte de duas pessoas.",
      atividadesChave: "Manter a plataforma no ar, atender dúvidas e buscar novas academias para assinar.",
      parceriasChave: null,
      estruturaCustos: "Servidores na nuvem, folha do time de suporte e verba mensal de anúncios.",
    },
    inconsistencias: [
      {
        blocoA: "canais",
        blocoB: "fontesReceita",
        descricao: "Anúncios pagos custam caro por academia captada e a mensalidade de R$ 79 é baixa — pode levar muitos meses só para pagar o custo de trazer cada cliente.",
      },
      {
        blocoA: "recursosChave",
        blocoB: "atividadesChave",
        descricao: "Um time de apenas duas pessoas precisa manter a plataforma, atender o suporte e ainda prospectar novas academias — as três atividades juntas não cabem numa equipe tão pequena.",
      },
    ],
  };
}

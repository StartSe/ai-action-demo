// Respostas de exemplo usadas quando não há chave de IA configurada.
import type { AcaoProposta } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Texto de ata de exemplo, pré-carregável em "Colar ata" via "Preencher com um exemplo" e ?exemplo=1.
 * Escrito de propósito com casos ambíguos (ação 3 sem prazo, ação 5 sem dono): a extração de exemplo
 * abaixo (acoesPropostasDemo) respeita as mesmas regras da extração real — nunca inventa o que a ata
 * não deixa claro. */
export const ataExemplo = `Reunião de diretoria — 15/09/2026

Participantes: Marina Costa (Marketing), Bruno Alves (Vendas), Camila Rocha (Produto), Diego Martins (Financeiro).

Pauta: revisão do funil de vendas, contrato de mídia paga, backlog de produto e CAC por canal.

Decisões:
1. Marina vai revisar o funil de conversão do site e apresentar um plano até sexta-feira (18/09).
2. Bruno ficou de renegociar o contrato com o fornecedor de mídia paga até o fim do mês.
3. A equipe de produto vai priorizar o backlog de bugs críticos antes do próximo lançamento, ainda sem data definida.
4. Diego vai levantar o custo real de aquisição de cliente por canal e trazer os números na próxima reunião.
5. Ficou combinado revisar o posicionamento da marca no próximo trimestre, mas ainda não ficou claro quem vai liderar essa frente.`;

/** Extração de exemplo para ataExemplo: cada evidência é um trecho copiado literalmente do texto acima
 * (a mesma checagem que a extração real faz, ver lib/acoes.ts: validarEvidencia). Ações 3 e 5 mostram de
 * propósito o caso "não ficou claro": campo vazio em vez de um palpite. */
export function acoesPropostasDemo(): AcaoProposta[] {
  return [
    {
      titulo: "Revisar o funil de conversão do site e apresentar um plano",
      dono: "Marina Costa",
      prazo: "2026-09-18",
      evidenciaDono: "Marina vai revisar o funil de conversão do site",
      evidenciaPrazo: "até sexta-feira (18/09)",
    },
    {
      titulo: "Renegociar o contrato com o fornecedor de mídia paga",
      dono: "Bruno Alves",
      prazo: "2026-09-30",
      evidenciaDono: "Bruno ficou de renegociar o contrato com o fornecedor de mídia paga",
      evidenciaPrazo: "até o fim do mês",
    },
    {
      titulo: "Priorizar o backlog de bugs críticos antes do próximo lançamento",
      dono: "Equipe de Produto",
      prazo: "",
      evidenciaDono: "A equipe de produto vai priorizar o backlog de bugs críticos",
      evidenciaPrazo: "",
    },
    {
      titulo: "Levantar o custo real de aquisição de cliente por canal",
      dono: "Diego Martins",
      prazo: "",
      evidenciaDono: "Diego vai levantar o custo real de aquisição de cliente por canal",
      evidenciaPrazo: "",
    },
    {
      titulo: "Revisar o posicionamento da marca",
      dono: "",
      prazo: "",
      evidenciaDono: "",
      evidenciaPrazo: "",
    },
  ];
}

/** Ações plausíveis para o botão "Preencher com um exemplo" da lista vazia (não dependem de IA: viram
 * ações de verdade, editáveis e completáveis como qualquer outra). Prazos relativos a hoje, para sempre
 * ter pelo menos uma ação dentro da janela padrão de cobrança. */
export function acoesDemo(): { titulo: string; dono: string; diasPrazo: number | null }[] {
  return [
    { titulo: "Enviar a proposta revisada para o cliente Alfa", dono: "Marina Costa", diasPrazo: 2 },
    { titulo: "Fechar o contrato com o novo fornecedor de logística", dono: "Bruno Alves", diasPrazo: 6 },
    { titulo: "Consolidar o relatório de indicadores do trimestre", dono: "Diego Martins", diasPrazo: 20 },
    { titulo: "Definir o responsável pelo projeto de expansão", dono: "", diasPrazo: null },
  ];
}

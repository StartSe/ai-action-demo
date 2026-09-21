"use client";
// Os oito chips de sugestão por área (RF-02). Clicar substitui o texto do campo; nunca dispara a geração.

export const CHIPS_AREA: { area: string; texto: string }[] = [
  { area: "Vendas", texto: "Painel de vendas com receita do mês, ticket médio, taxa de conversão do funil, ranking de vendedores e tendência de receita nos últimos 6 meses." },
  { area: "Financeiro", texto: "Painel financeiro com receita, despesas, margem líquida, fluxo de caixa mensal e distribuição de gastos por categoria." },
  { area: "Marketing", texto: "Painel de marketing com custo por lead, custo de aquisição de cliente, retorno sobre anúncios, tráfego por canal nos últimos 6 meses e ranking de campanhas por conversão." },
  { area: "Operações", texto: "Painel de operações com nível de serviço cumprido, tempo médio de atendimento, chamados resolvidos por dia, satisfação (NPS) e distribuição de chamados por tipo." },
  { area: "SaaS", texto: "Painel de assinaturas com receita recorrente mensal, cancelamento, novos clientes, expansão de receita, meses de caixa e crescimento nos últimos 6 meses." },
  { area: "E-commerce", texto: "Painel de loja virtual com receita, ticket médio, taxa de conversão, produtos mais vendidos, vendas por estado e tendência de vendas dia a dia." },
  { area: "Agência", texto: "Painel de agência com receita por cliente, horas faturadas, ocupação da equipe, projetos em andamento e ranking de clientes por receita." },
  { area: "RH", texto: "Painel de pessoas com número de colaboradores, rotatividade, satisfação interna, distribuição por área, contratações e desligamentos e tempo médio de contratação." },
];

export function ChipsArea({ onEscolher, desabilitado = false, escolhido }: { onEscolher: (texto: string) => void; desabilitado?: boolean; escolhido?: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Sugestões por área">
      {CHIPS_AREA.map((chip) => {
        const ativo = escolhido === chip.texto;
        return (
          <button
            key={chip.area}
            type="button"
            disabled={desabilitado}
            onClick={() => onEscolher(chip.texto)}
            className={`px-3 py-1.5 rounded-chip text-[13px] font-semibold border transition-colors disabled:opacity-60 ${ativo ? "bg-accent-soft border-accent text-accent-ink" : "bg-surface border-line text-ink hover:bg-bg"}`}
          >
            {chip.area}
          </button>
        );
      })}
    </div>
  );
}

"use client";
// Seção "Orçamento planejado" do painel principal (dentro de Mais detalhes): cadastro do quanto a
// empresa planeja gastar por mês em cada ferramenta de IA. Lista curta editada por completo a cada
// "Salvar orçamento" (mesmo padrão de financas-ia/components/OrcamentoCategorias.tsx), guardada
// como JSON único via lib/orcamento.ts. Aqui vive dentro do painel principal, não em /setup, porque
// é o CFO quem mexe nisso no dia a dia — não é uma configuração de integração.
import { useEffect, useState } from "react";
import type { Orcamento } from "@/lib/types";

export function OrcamentoPlanejado({ onSalvo }: { onSalvo?: () => void }) {
  const [itens, setItens] = useState<Orcamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    fetch("/api/orcamento")
      .then((r) => r.json())
      .then((d) => setItens(d.itens || []))
      .finally(() => setCarregando(false));
  }, []);

  function atualizar(i: number, campo: keyof Orcamento, valor: string) {
    setSalvo(false);
    setItens((lista) => lista.map((item, idx) => (idx !== i ? item : { ...item, [campo]: campo === "valorMensalBRL" ? Number(valor) || 0 : valor })));
  }

  function adicionar() {
    setSalvo(false);
    setItens((lista) => [...lista, { item: "", valorMensalBRL: 0 }]);
  }

  function remover(i: number) {
    setSalvo(false);
    setItens((lista) => lista.filter((_, idx) => idx !== i));
  }

  async function salvar() {
    setSalvando(true);
    setSalvo(false);
    try {
      const itensValidos = itens.filter((i) => i.item.trim());
      const r = await fetch("/api/orcamento", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itens: itensValidos }) });
      const d = await r.json();
      setItens(d.itens || []);
      setSalvo(true);
      onSalvo?.();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <p className="text-muted text-sm mb-3">
        Quanto a empresa planeja gastar por mês em cada ferramenta. As leituras passam a avisar quando uma ferramenta estourar esse valor.
      </p>
      {carregando ? (
        <p className="text-muted text-sm">Carregando...</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2.5">
            {itens.map((item, i) => (
              <div key={i} className="flex items-center gap-2.5 max-md:flex-col max-md:items-stretch">
                <input
                  className="input flex-1"
                  placeholder="Ferramenta (ex.: ChatGPT Enterprise)"
                  value={item.item}
                  onChange={(e) => atualizar(i, "item", e.target.value)}
                />
                <input
                  className="input w-32 max-md:w-full"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Valor mensal"
                  value={item.valorMensalBRL || ""}
                  onChange={(e) => atualizar(i, "valorMensalBRL", e.target.value)}
                />
                <button type="button" className="btn-ghost !w-auto max-md:w-full" onClick={() => remover(i)}>
                  Remover
                </button>
              </div>
            ))}
            {itens.length === 0 && <p className="text-muted text-sm">Nenhum item cadastrado ainda.</p>}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" className="btn-ghost !w-auto" onClick={adicionar}>
              Adicionar item
            </button>
            <button type="button" className="btn-primary !w-auto" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando" : "Salvar orçamento"}
            </button>
            {salvo && <span className="text-ok text-sm font-semibold">Orçamento salvo.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

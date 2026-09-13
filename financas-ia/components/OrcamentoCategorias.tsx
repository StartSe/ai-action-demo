"use client";
// Cartão adicional do /setup: o orçamento mensal por categoria, cadastrado uma vez e usado para marcar,
// em cada leitura, as categorias que estouraram (gráfico de categorias e resumo mensal por rotina).
import { useEffect, useState } from "react";
import type { ItemOrcamento } from "@/lib/orcamento-calculo";

export function OrcamentoCategorias() {
  const [itens, setItens] = useState<ItemOrcamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    fetch("/api/orcamento")
      .then((r) => r.json())
      .then((d) => setItens(d.itens || []))
      .finally(() => setCarregando(false));
  }, []);

  function atualizar(i: number, campo: keyof ItemOrcamento, valor: string) {
    setSalvo(false);
    setItens((lista) =>
      lista.map((item, idx) =>
        idx !== i ? item : { ...item, [campo]: campo === "valorMensal" ? Number(valor) || 0 : valor }
      )
    );
  }

  function adicionar() {
    setSalvo(false);
    setItens((lista) => [...lista, { categoria: "", valorMensal: 0 }]);
  }

  function remover(i: number) {
    setSalvo(false);
    setItens((lista) => lista.filter((_, idx) => idx !== i));
  }

  async function salvar() {
    setSalvando(true);
    setSalvo(false);
    try {
      const itensValidos = itens.filter((i) => i.categoria.trim());
      const r = await fetch("/api/orcamento", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: itensValidos }),
      });
      const d = await r.json();
      setItens(d.itens || []);
      setSalvo(true);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section id="orcamento-por-categoria" className="card p-6 max-md:p-5">
      <h2 className="text-lg font-bold mb-1">Orçamento por categoria</h2>
      <p className="text-muted text-sm mb-4 max-w-[640px]">
        Cadastre quanto a empresa planeja gastar por mês em cada categoria. As leituras passam a avisar quando uma
        categoria estourar o orçamento.
      </p>

      {carregando ? (
        <p className="text-muted text-sm">Carregando...</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2.5">
            {itens.map((item, i) => (
              <div key={i} className="flex items-center gap-2.5 max-md:flex-col max-md:items-stretch">
                <input
                  className="input flex-1"
                  placeholder="Categoria (ex.: Marketing)"
                  value={item.categoria}
                  onChange={(e) => atualizar(i, "categoria", e.target.value)}
                />
                <input
                  className="input w-40 max-md:w-full"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Valor mensal"
                  value={item.valorMensal || ""}
                  onChange={(e) => atualizar(i, "valorMensal", e.target.value)}
                />
                <button type="button" className="btn-ghost !w-auto max-md:w-full" onClick={() => remover(i)}>
                  Remover
                </button>
              </div>
            ))}
            {itens.length === 0 && <p className="text-muted text-sm">Nenhuma categoria cadastrada ainda.</p>}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" className="btn-ghost !w-auto" onClick={adicionar}>
              Adicionar categoria
            </button>
            <button type="button" className="btn-primary !w-auto" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando" : "Salvar orçamento"}
            </button>
            {salvo && <span className="text-ok text-sm font-semibold">Orçamento salvo.</span>}
          </div>
        </div>
      )}
    </section>
  );
}

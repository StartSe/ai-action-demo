"use client";
// Seção "Lançar manualmente" do painel principal (dentro de Mais detalhes): registra uma fatura à
// mão via POST /api/faturas (lib/faturas.ts), enquanto o app ainda não lê notas de e-mail nem PDF
// sozinho (US-020/US-021).
import { useState, type FormEvent } from "react";

const VAZIO = { fornecedor: "", ferramenta: "", valor: "", moeda: "BRL", data: "" };

export function LancarManualmente({ onLancado }: { onLancado?: () => void }) {
  const [dados, setDados] = useState(VAZIO);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  const set = (campo: keyof typeof VAZIO) => (e: { target: { value: string } }) => {
    setSucesso(false);
    setDados((d) => ({ ...d, [campo]: e.target.value }));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    setSucesso(false);
    try {
      const r = await fetch("/api/faturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...dados, valor: Number(dados.valor) }),
      });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível lançar a fatura.");
      setDados(VAZIO);
      setSucesso(true);
      onLancado?.();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2.5">
      <p className="text-muted text-sm mb-1">Lance uma fatura à mão enquanto o app ainda não lê e-mail nem PDF sozinho.</p>
      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-2.5">
        <input className="input" placeholder="Fornecedor (ex.: OpenAI)" required value={dados.fornecedor} onChange={set("fornecedor")} />
        <input className="input" placeholder="Ferramenta (ex.: ChatGPT Enterprise)" required value={dados.ferramenta} onChange={set("ferramenta")} />
      </div>
      <div className="grid grid-cols-3 max-md:grid-cols-1 gap-2.5">
        <input className="input" type="number" min={0.01} step="0.01" placeholder="Valor" required value={dados.valor} onChange={set("valor")} />
        <select className="input" value={dados.moeda} onChange={set("moeda")}>
          <option value="BRL">Real (BRL)</option>
          <option value="USD">Dólar (USD)</option>
          <option value="EUR">Euro (EUR)</option>
        </select>
        <input className="input" type="date" required value={dados.data} onChange={set("data")} />
      </div>
      {erro && <p className="text-danger text-sm">{erro}</p>}
      {sucesso && <p className="text-ok text-sm font-semibold">Fatura lançada.</p>}
      <button type="submit" className="btn-primary !w-auto" disabled={enviando}>
        {enviando ? "Lançando" : "Lançar fatura"}
      </button>
    </form>
  );
}

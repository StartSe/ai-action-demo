"use client";
// Cartão adicional do /setup (US-072): mostra e permite ajustar, por operação, qual ferramenta do
// quadro conectado em "Quadro de tarefas (MCP)" o agente deve usar para criar, mover, comentar,
// arquivar e listar cartões. Só aparece quando essa integração já está configurada.
import { useEffect, useState } from "react";
import { MaisDetalhes } from "./ui";

type Operacao = "criar" | "mover" | "comentar" | "arquivar" | "listar";
type Mapa = Partial<Record<Operacao, string | null>>;
type FerramentaRemota = { nome: string; descricao?: string };
type Resposta = { configurado: boolean; ferramentas: FerramentaRemota[]; mapa: Mapa; error?: string };

const ROTULOS: Record<Operacao, string> = {
  criar: "Criar cartão",
  mover: "Mover cartão",
  comentar: "Comentar em um cartão",
  arquivar: "Arquivar cartão",
  listar: "Listar cartões do quadro",
};

const OPERACOES = Object.keys(ROTULOS) as Operacao[];

export function MapeamentoMCP() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [valores, setValores] = useState<Mapa>({});
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/mcp-tarefas/mapeamento")
      .then((r) => r.json())
      .then(setDados)
      .catch(() => setDados(null));
  }, []);

  if (!dados || !dados.configurado) return null;

  async function salvar() {
    setSalvando(true);
    setAviso(null);
    try {
      const mapaFinal: Mapa = { ...dados!.mapa, ...valores };
      const r = await fetch("/api/mcp-tarefas/mapeamento", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapa: mapaFinal }),
      });
      if (!r.ok) throw new Error("Falha ao salvar.");
      setDados((d) => (d ? { ...d, mapa: mapaFinal } : d));
      setValores({});
      setAviso("Mapeamento salvo.");
    } catch {
      setAviso("Não foi possível salvar agora.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section id="mcp-tarefas-mapeamento" className="card p-6 max-md:p-5">
      <h2 className="text-lg font-bold mb-1">Mapear as ações do quadro conectado</h2>
      <p className="text-muted text-sm mb-4 max-w-[640px]">
        O agente já tentou identificar, pelo nome e pela descrição de cada ação do quadro conectado, qual delas usar para criar, mover, comentar, arquivar e
        listar cartões. Revise e troque abaixo se alguma escolha não parecer certa.
      </p>
      {dados.error && <p className="text-danger text-sm mb-3">{dados.error}</p>}
      <MaisDetalhes titulo="Opções avançadas: mapeamento por ação">
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4">
          {OPERACOES.map((op) => (
            <div key={op} className="flex flex-col gap-1.5">
              <label htmlFor={`mapa-${op}`} className="text-[13px] font-semibold">
                {ROTULOS[op]}
              </label>
              <select
                id={`mapa-${op}`}
                className="input"
                value={valores[op] ?? dados.mapa[op] ?? ""}
                onChange={(e) => setValores((s) => ({ ...s, [op]: e.target.value || null }))}
              >
                <option value="">Nenhuma</option>
                {dados.ferramentas.map((f) => (
                  <option key={f.nome} value={f.nome} title={f.descricao}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap mt-4">
          <button type="button" className="btn-primary !w-auto" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando" : "Salvar mapeamento"}
          </button>
          {aviso && <span className="text-sm font-semibold text-muted">{aviso}</span>}
        </div>
      </MaisDetalhes>
    </section>
  );
}

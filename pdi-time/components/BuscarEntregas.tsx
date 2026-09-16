"use client";
// Botão "Buscar entregas no quadro", logo abaixo do campo "Entregas": lista os cartões já concluídos pela
// pessoa no quadro de tarefas conectado (app/api/pdi/entregas, lib/entregas-quadro.ts) e acrescenta ao campo.
// Três estados lidos de /api/status (integrations.mcpTarefas): sem quadro → link para conectar; com quadro →
// botão; carregando → nada (evita o botão "piscar" antes de saber). Mesmo padrão de LembrarCheckins.
import { useState } from "react";
import { Aviso, lerErro, type ErroLido } from "./ui";

type Retorno = { entregas: { titulo: string }[]; texto: string };

export function BuscarEntregas({ nome, conectado, onEntregas }: { nome: string; conectado: boolean | null; onEntregas: (texto: string) => void }) {
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<{ tom: "ok" | "warn" | "danger"; texto: string; acao?: ErroLido["acao"] } | null>(null);

  if (conectado === null) return null;

  if (!conectado) {
    return (
      <p className="text-[13px] mt-1.5">
        <a href="/setup#mcp-tarefas" className="btn-link">Buscar entregas no quadro do time</a>
        <span className="text-muted"> (conecte um quadro de tarefas)</span>
      </p>
    );
  }

  async function buscar() {
    setAviso(null);
    if (!nome.trim()) {
      setAviso({ tom: "warn", texto: "Informe o nome da pessoa antes de buscar as entregas no quadro." });
      return;
    }
    setBuscando(true);
    try {
      const r = await fetch("/api/pdi/entregas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome }) });
      if (!r.ok) {
        const lido = await lerErro(r);
        setAviso({ tom: "danger", texto: lido.mensagem, acao: lido.acao });
        return;
      }
      const d = (await r.json()) as Retorno;
      if (d.entregas.length === 0) {
        setAviso({ tom: "warn", texto: `Nenhum cartão concluído de ${nome.trim()} no quadro conectado. Confira o nome (igual ao do quadro) ou descreva as entregas à mão.` });
        return;
      }
      onEntregas(d.texto);
      setAviso({ tom: "ok", texto: `${d.entregas.length} ${d.entregas.length === 1 ? "entrega adicionada" : "entregas adicionadas"} ao campo. Revise e complete antes de gerar.` });
    } catch (e) {
      const lido = await lerErro(e);
      setAviso({ tom: "danger", texto: lido.mensagem });
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="mt-1.5 flex flex-col gap-2">
      <div>
        <button type="button" className="btn-link text-[13px]" onClick={buscar} disabled={buscando}>
          {buscando ? "Lendo o quadro" : "Buscar entregas no quadro do time"}
        </button>
      </div>
      {aviso && <Aviso tom={aviso.tom} acao={aviso.acao}>{aviso.texto}</Aviso>}
    </div>
  );
}

"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Generated, GenerationEvent, GenerationPhase } from "@/lib/flow-generator";
import { NODE_STYLE } from "@/lib/flow-presets";
import { Icon, Modal } from "./StudioUI";

const PHASE_LABELS = {
  interpreting: "Interpretando sua descrição…",
  planning: "Planejando o fluxo e as instruções…",
  creating: "Criando os blocos e as conexões…",
  repairing: "Ajustando os blocos e as conexões…",
  complete: "Fluxo concluído",
};

export function GeneratorDialog({ flowId, replaces, connected, onConnect, onClose, onApply }: {
  flowId: string; replaces: boolean; connected: boolean; onConnect: () => void;
  onClose: () => void; onApply: (g: Generated) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<GenerationPhase>("interpreting");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Generated | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function generate() {
    if (pending.current || !prompt.trim() || !connected) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError(""); setResult(null); setPhase("interpreting");
    try {
      const response = await fetch(`/api/flows/${flowId}/generate`, {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Não foi possível gerar o fluxo.");
      if (!response.body) throw new Error("Não foi possível acompanhar a geração. Tente novamente.");
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let buffer = "", generated: Generated | null = null;
      const receive = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as GenerationEvent;
        if ("error" in event) throw new Error(event.error);
        if ("phase" in event) setPhase(event.phase);
        if ("result" in event) generated = event.result;
      };
      try {
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split("\n"); buffer = lines.pop() || "";
          lines.forEach(receive);
          if (done) { receive(buffer); break; }
        }
      } finally { await reader.cancel(); reader.releaseLock(); }
      if (!generated) throw new Error("A geração foi interrompida. Tente novamente.");
      if (!controller.signal.aborted) setResult(generated);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Não foi possível gerar o fluxo.");
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const current = result ? 3 : phase === "interpreting" ? 0 : phase === "planning" ? 1 : 2;
  return (
    <Modal title="Gerar com IA" className="generator-dialog" onClose={() => { pending.current?.abort(); onClose(); }}>
      {busy || result ? (
        <div className={"generator-journey" + (result ? " complete" : "")} aria-busy={busy}>
          <div className="generator-mini-flow" aria-hidden="true">
            {(["start", "agent", "end"] as const).map((kind, index) => (
              <span key={kind} className="generator-mini-node" style={{ "--step": index } as CSSProperties}><Icon name={result ? "check" : kind} size={24} /></span>
            ))}
          </div>
          <strong className="generator-phase" role="status">{PHASE_LABELS[result ? "complete" : phase]}</strong>
          <ol className="generator-steps" aria-label="Etapas da geração">
            {["Interpretação", "Planejamento", "Blocos e conexões"].map((label, index) => (
              <li key={label} className={index < current ? "done" : index === current ? "active" : ""} aria-current={index === current ? "step" : undefined}>
                <span>{index < current ? <Icon name="check" size={12} /> : index + 1}</span>{label}
              </li>
            ))}
          </ol>
          {result && <>
            <div className="generator-summary">
              <strong>{result.name}</strong>
              <p>{result.graph.nodes.length} blocos · {result.graph.edges.length} conexões. Você pode ajustar tudo no canvas.</p>
              <div className="preset-chain">{result.graph.nodes.map((node) => (
                <span key={node.id} title={node.data.label} style={{ background: NODE_STYLE[node.data.kind].color }}><Icon name={node.data.kind} size={20} /></span>
              ))}</div>
            </div>
            {replaces && <p className="generator-warning">Os blocos atuais serão substituídos. Você pode desfazer antes de salvar.</p>}
            <div className="modal-actions">
              <button className="studio-button" onClick={() => setResult(null)}>Ajustar descrição</button>
              <button className="studio-button primary" onClick={() => { onApply(result); onClose(); }}><Icon name="check" size={16} />Colocar no quadro</button>
            </div>
          </>}
        </div>
      ) : (
        <form onSubmit={(event) => { event.preventDefault(); void generate(); }}>
          <div className="node-fields">
              <textarea aria-label="Descrição do fluxo" autoFocus rows={7} maxLength={4000} value={prompt}
                placeholder="Descreva o processo em uma ou duas frases. A IA desenha os blocos, as conexões e as instruções de cada agente."
                onChange={(event) => setPrompt(event.target.value)} />
          </div>
          {error && <p className="studio-error" role="alert">{error}</p>}
          {!connected && <p className="generator-warning">Conecte o ChatGPT ou o OpenRouter para gerar fluxos. <button type="button" onClick={onConnect}>Conectar</button></p>}
          <div className="modal-actions">
            <button type="submit" className="studio-button primary" disabled={!prompt.trim() || !connected}><Icon name="spark" size={16} />Gerar Fluxo</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

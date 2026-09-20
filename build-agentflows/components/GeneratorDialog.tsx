"use client";
import { useState } from "react";
import type { Generated } from "@/lib/flow-generator";
import { NODE_STYLE } from "@/lib/flow-presets";
import { Icon, Modal, request } from "./StudioUI";
const EXAMPLES = [
  "Triagem de solicitações de clientes: classificar a urgência, preparar a resposta e pedir aprovação do gestor antes de enviar",
  "Analisar um contrato recebido, listar os riscos e sugerir pontos de negociação",
  "Qualificar um lead a partir da descrição, decidir se é prioritário e sugerir a abordagem comercial",
];
// Diálogo "O que você quer construir?": pede ao ChatGPT um fluxo completo e mostra a prévia
// antes de colocar os blocos no quadro (o quadro atual é substituído).
export function GeneratorDialog({
  flowId,
  replaces,
  connected,
  onConnect,
  onClose,
  onApply,
}: {
  flowId: string;
  replaces: boolean;
  connected: boolean;
  onConnect: () => void;
  onClose: () => void;
  onApply: (g: Generated) => void;
}) {
  const [prompt, setPrompt] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<Generated | null>(null);
  async function generate() {
    setBusy(true);
    setError("");
    try {
      setResult(
        await request<Generated>(
          "/api/flows/" + flowId + "/generate",
          "POST",
          { prompt: prompt.trim() },
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível gerar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="O que você quer construir?" onClose={onClose}>
      {result ? (
        <div className="generator-result">
          <p className="modal-lead">
            Prévia do fluxo. Você poderá ajustar cada bloco depois.
          </p>
          <div className="generator-summary">
            <strong>{result.name}</strong>
            {result.description && <p>{result.description}</p>}
            <div className="preset-chain">
              {result.graph.nodes.map((n) => (
                <span
                  key={n.id}
                  title={n.data.label}
                  style={{ background: NODE_STYLE[n.data.kind].color }}
                >
                  <Icon name={n.data.kind} size={20} />
                </span>
              ))}
            </div>
            <ol>
              {result.graph.nodes.map((n) => (
                <li key={n.id}>{n.data.label}</li>
              ))}
            </ol>
          </div>
          {replaces && (
            <p className="generator-warning">
              Os blocos atuais do quadro serão substituídos. Você ainda pode
              desfazer antes de salvar.
            </p>
          )}
          <div className="modal-actions">
            <button
              className="studio-button"
              onClick={() => setResult(null)}
              disabled={busy}
            >
              Gerar de novo
            </button>
            <button
              className="studio-button primary"
              onClick={() => {
                onApply(result);
                onClose();
              }}
            >
              <Icon name="check" size={16} />
              Colocar no quadro
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="modal-lead">
            Descreva o processo em uma ou duas frases. O ChatGPT desenha os
            blocos, as conexões e as instruções de cada agente.
          </p>
          <div className="node-fields">
            <label>
              Descrição do fluxo
              <textarea
                autoFocus
                rows={4}
                maxLength={4000}
                value={prompt}
                disabled={busy}
                placeholder="Ex.: receber uma reclamação, classificar a gravidade e propor uma resposta para aprovação"
                onChange={(e) => setPrompt(e.target.value)}
              />
            </label>
          </div>
          <div className="generator-examples">
            {EXAMPLES.map((x) => (
              <button
                key={x}
                type="button"
                disabled={busy}
                onClick={() => setPrompt(x)}
              >
                {x}
              </button>
            ))}
          </div>
          {busy && (
            <div className="generator-progress" role="status">
              <span />
              Desenhando os blocos com o ChatGPT…
            </div>
          )}
          {error && (
            <p className="studio-error" role="alert">
              {error}
            </p>
          )}
          {!connected && (
            <p className="generator-warning">
              Conecte o ChatGPT para gerar fluxos.{" "}
              <button type="button" onClick={onConnect}>
                Conectar
              </button>
            </p>
          )}
          <div className="modal-actions">
            <button className="studio-button" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button
              className="studio-button primary"
              disabled={busy || !prompt.trim() || !connected}
              onClick={generate}
            >
              <Icon name="spark" size={16} />
              {busy ? "Gerando…" : "Gerar fluxo"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

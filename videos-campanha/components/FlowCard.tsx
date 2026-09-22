"use client";
/* eslint-disable @next/next/no-img-element -- User uploads and generated media. */
import { useEffect, useId, useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { MODELS, type Block, type Kind } from "@/lib/flow/model";
import Preview, { type MediaAsset } from "./FlowPreview";
import FlowIcon from "./FlowIcon";
import FlowCardMenu from "./FlowCardMenu";
function Generating({
  kind,
  status,
  asset,
  startedAt,
}: {
  kind: Kind;
  status?: string;
  asset?: MediaAsset;
  startedAt?: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  useEffect(() => {
    const start = startedAt ? Date.parse(startedAt) : Date.now();
    const t = setInterval(
      () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000))),
      1000,
    );
    return () => clearInterval(t);
  }, [startedAt]);
  const title =
    status === "sending"
      ? "Enviando ao modelo…"
      : kind === "video"
        ? "Gerando seu vídeo…"
        : kind === "transform"
          ? "Transformando sua imagem…"
          : "Gerando sua imagem…";
  const hint =
    elapsed >= 120
      ? "Ainda aguardando o resultado. Você não precisa enviar de novo."
      : "O tempo varia conforme o modelo e a fila. Avisaremos aqui quando terminar.";
  return (
    <div className="cf-generating">
      {asset &&
        (asset.kind === "video" ? (
          <video src={asset.url} muted preload="metadata" aria-hidden="true" />
        ) : (
          <img src={asset.url} alt="" aria-hidden="true" />
        ))}
      <svg
        className="cf-waves"
        viewBox="0 0 400 200"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`cfw1${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f7bfe6" stopOpacity=".7" />
            <stop offset="1" stopColor="#dccbfb" stopOpacity=".45" />
          </linearGradient>
          <linearGradient id={`cfw2${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffffff" stopOpacity=".85" />
            <stop offset="1" stopColor="#f3d2ef" stopOpacity=".5" />
          </linearGradient>
        </defs>
        <path
          d="M0 118 C70 60 150 175 250 108 S375 40 400 66 L400 200 L0 200 Z"
          fill={`url(#cfw1${uid})`}
        />
        <path
          d="M0 165 C90 105 200 205 300 142 S372 96 400 118 L400 200 L0 200 Z"
          fill={`url(#cfw2${uid})`}
        />
      </svg>
      <div className="cf-generating-body">
        <span className="cf-spark" aria-hidden="true">
          <i />
          <i />
          <svg viewBox="0 0 64 64">
            <defs>
              <linearGradient id={`cfs${uid}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#f22baa" />
                <stop offset="1" stopColor="#7b3fe4" />
              </linearGradient>
            </defs>
            <path
              d="M32 3 C34.5 21 43 29.5 61 32 C43 34.5 34.5 43 32 61 C29.5 43 21 34.5 3 32 C21 29.5 29.5 21 32 3 Z"
              fill={`url(#cfs${uid})`}
            />
            <path
              d="M32 14 C33.2 24.5 39.5 30.8 50 32 C39.5 33.2 33.2 39.5 32 50 C30.8 39.5 24.5 33.2 14 32 C24.5 30.8 30.8 24.5 32 14 Z"
              fill="#fff"
              opacity=".55"
            />
          </svg>
          <em />
          <em />
          <em />
        </span>
        <strong>{title}</strong>
        <small>
          {status === "sending"
            ? "Preparando a solicitação"
            : "Pedido recebido · aguardando resultado"}
        </small>
        <span className="cf-elapsed">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}{" "}
          decorridos
        </span>
        <span className="cf-progress" aria-hidden="true">
          <i />
        </span>
        <em>{hint}</em>
      </div>
    </div>
  );
}
export type FlowNodeData = Block["data"] & {
  asset?: MediaAsset;
  onRemove?: () => void;
  onCancel?: () => void;
  onRun?: () => void;
  onReview?: () => void;
  onBranch?: () => void;
  onDuplicate?: () => void;
  jobError?: string;
  startedAt?: string;
  locked?: boolean;
  readOnly?: boolean;
};
export default function CreativeNode({
  data,
  selected,
}: NodeProps<FlowNodeData>) {
  const loading = data.status === "pending" || data.status === "sending";
  const problem = ["failed", "uncertain", "submitting"].includes(
    data.status || "",
  );
  const state = loading
    ? "Gerando"
    : problem
      ? "Atenção"
      : data.dirty
        ? "Atualizar"
        : data.asset
          ? "Pronto"
          : "Aguardando";
  const model = MODELS.find((m) => m.id === data.model);
  return (
    <article
      aria-busy={loading}
      className={`cf-node ${selected ? "is-selected" : ""}`}
    >
      {data.kind !== "idea" && (
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={!data.readOnly}
        />
      )}
      <header>
        <span className={`cf-icon ${data.kind}`}>
          <FlowIcon name={data.kind} />
        </span>
        <strong>{data.title}</strong>
        {data.kind !== "idea" && (
          <span
            className={`cf-card-status ${loading ? "is-loading" : problem ? "is-error" : data.asset && !data.dirty ? "is-complete" : ""}`}
            role="status"
          >
            <i />
            {state}
          </span>
        )}
        {!data.readOnly && (
          <FlowCardMenu
            title={data.title}
            disabled={data.locked}
            canBranch={data.kind !== "output"}
            onRemove={data.onRemove}
            onBranch={data.onBranch}
            onDuplicate={data.onDuplicate}
          />
        )}
      </header>
      {data.kind === "idea" ? (
        <p className="cf-idea">
          {data.prompt || "Descreva sua campanha. O que vamos criar?"}
        </p>
      ) : loading ? (
        <Generating
          kind={data.kind}
          status={data.status}
          asset={data.asset}
          startedAt={data.startedAt}
        />
      ) : (
        <Preview asset={data.asset} autoPlay />
      )}
      {data.kind !== "idea" && data.prompt && (
        <p className="cf-card-prompt" title={data.prompt}>
          {data.prompt}
        </p>
      )}
      {problem && !data.readOnly && (
        <div className="cf-node-problem">
          <p>{data.jobError || "Esta geração precisa de atenção."}</p>
          <button
            className="nodrag nopan"
            onClick={(e) => {
              e.stopPropagation();
              data.onReview?.();
            }}
          >
            Ver como resolver
          </button>
        </div>
      )}
      <footer>
        {!["idea", "output"].includes(data.kind) && (
          <>
            <span className="cf-card-model" title={model?.name}>
              {model?.name}
            </span>
            <span>{data.ratio}</span>
            <span>
              {data.resolution || model?.resolutions[0]}
              {data.kind === "video" ? ` · ${data.duration}s` : ""}
            </span>
          </>
        )}
        {data.kind === "idea" && <span>O início de tudo</span>}
        {data.kind === "output" && (
          <span>
            {data.asset
              ? "Pronto para sua campanha"
              : "Conecte o resultado para entregar"}
          </span>
        )}
        {!data.readOnly && data.asset && (
          <a
            className="cf-card-download nodrag nopan"
            href={
              data.asset.url +
              (data.asset.url.startsWith("/api/flow-assets/")
                ? "?download=1"
                : "")
            }
            download
            title="Baixar arquivo"
            aria-label={`Baixar ${data.title}`}
            onClick={(e) => e.stopPropagation()}
          >
            <FlowIcon name="download" />
          </a>
        )}
      </footer>
      {!data.readOnly && !["idea", "output"].includes(data.kind) && (
        <div className="cf-node-actions">
          {loading ? (
            <button
              className="nodrag nopan"
              title="A execução para depois desta geração"
              onClick={(e) => {
                e.stopPropagation();
                data.onCancel?.();
              }}
            >
              Pausar sequência
            </button>
          ) : (
            <button
              className="nodrag nopan"
              disabled={
                data.locked ||
                ["uncertain", "submitting"].includes(data.status || "")
              }
              onClick={(e) => {
                e.stopPropagation();
                data.onRun?.();
              }}
            >
              <FlowIcon name="idea" />
              {data.status === "failed"
                ? "Tentar novamente"
                : data.asset
                  ? "Gerar novamente"
                  : "Gerar"}
            </button>
          )}
        </div>
      )}
      {data.kind !== "output" && (
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={!data.readOnly}
        />
      )}
    </article>
  );
}

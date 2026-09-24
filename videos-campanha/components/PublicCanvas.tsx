"use client";
import { useMemo } from "react";
import ReactFlow, { Background, Controls } from "reactflow";
import type { CanvasPreview } from "@/lib/flow/preview-model";
import CreativeNode from "./FlowCard";
import FlowIcon from "./FlowIcon";
const nodeTypes = { preview: CreativeNode };

export default function PublicCanvas({ canvas }: { canvas: CanvasPreview }) {
  const nodes = useMemo(
    () =>
      canvas.nodes.map((n) => ({
        ...n,
        data: { ...n.data, excluded: [], inherit: false, readOnly: true },
      })),
    [canvas],
  );
  return (
    <main
      className="cf-app cf-public-canvas"
      aria-label={`Preview de ${canvas.title}`}
    >
      <div className="cf-preview-label">
        <FlowIcon name="idea" />
        <div>
          <h1>{canvas.title}</h1>
          <span>Creative Flows · Somente visualização</span>
        </div>
      </div>
      <ReactFlow
        defaultNodes={nodes}
        defaultEdges={canvas.edges.map((e) => ({
          ...e,
          style: {
            stroke: "#dd239e",
            strokeWidth: 2,
            strokeDasharray: e.data.kind === "context" ? "6 5" : undefined,
          },
        }))}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.15}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        edgesFocusable={false}
        nodesFocusable={false}
        deleteKeyCode={null}
      >
        <Background color="#ded9e8" gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
      <p className="cf-preview-hint">
        Arraste o fundo para navegar · Use o zoom para explorar
      </p>
    </main>
  );
}

"use client";
import { useMemo, useEffect, type CSSProperties } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useReactFlow,
  useStore,
  type NodeProps,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { layoutTree } from "@/lib/layout";
import type { MindNode } from "@/lib/types";
import { Icon } from "./ui";
type Data = {
  label: string;
  note: string;
  color: string;
  root: boolean;
  side: "left" | "right";
  count: number;
  collapsed: boolean;
  toggle: () => void;
};
type MapNode = Node<Data>;
function TopicNode({ data, selected }: NodeProps<MapNode>) {
  return (
    <div
      className={
        "topic-node" +
        (data.root ? " root-node" : "") +
        (selected ? " selected" : "")
      }
      style={{ "--branch-color": data.color } as CSSProperties}
    >
      <Handle
        type="target"
        position={data.side === "right" ? Position.Left : Position.Right}
      />
      {data.root && (
        <span className="root-eyebrow">
          <Icon name="spark" size={12} />
          Ideia central
        </span>
      )}
      <strong>{data.label}</strong>
      {data.root ? (
        <>
          <Handle type="source" position={Position.Left} id="left" />
          <Handle type="source" position={Position.Right} id="right" />
        </>
      ) : (
        <Handle
          type="source"
          position={data.side === "right" ? Position.Right : Position.Left}
          id={data.side}
        />
      )}{" "}
      {data.count > 0 && (
        <button
          className="collapse-node nodrag nopan"
          title={data.collapsed ? "Expandir ramo" : "Recolher ramo"}
          aria-label={`${data.collapsed ? "Expandir" : "Recolher"} ${data.label}`}
          onClick={(e) => {
            e.stopPropagation();
            data.toggle();
          }}
        >
          {data.collapsed ? data.count : <Icon name="minus" size={10} />}
        </button>
      )}
    </div>
  );
}
const nodeTypes = { topic: TopicNode };
function Canvas({
  root,
  collapsed,
  onToggle,
  onSelect,
  selected,
  fitKey,
  focusId,
}: {
  root: MindNode;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  selected: string | null;
  fitKey: number;
  focusId: string | null;
}) {
  const flow = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const { nodes, edges } = useMemo(() => {
    const layout = layoutTree(root, collapsed);
    const nodes: MapNode[] = layout.map((n) => ({
      id: n.node.id,
      type: "topic",
      position: { x: n.x, y: n.y },
      selected: n.node.id === selected,
      data: {
        label: n.node.label,
        note: n.node.note,
        color: n.color,
        root: n.root,
        side: n.side,
        count: n.node.children.length,
        collapsed: n.collapsed,
        toggle: () => onToggle(n.node.id),
      },
    }));
    const edges: Edge[] = layout
      .filter((n) => n.parent)
      .map((n) => ({
        id: `${n.parent}-${n.node.id}`,
        source: n.parent!,
        target: n.node.id,
        sourceHandle: n.side,
        type: "default",
        style: { stroke: n.color, strokeWidth: 1.6, opacity: 0.7 },
      }));
    return { nodes, edges };
  }, [root, collapsed, onToggle, selected]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void flow.fitView({ padding: 0.15, duration: 300, maxZoom: 1 });
    }, 90);
    return () => clearTimeout(timer);
  }, [fitKey, flow, width, height]);
  useEffect(() => {
    if (focusId) {
      const n = flow.getNode(focusId);
      if (n)
        void flow.setCenter(n.position.x + 112, n.position.y + 38, {
          zoom: 1.15,
          duration: 400,
        });
    }
  }, [focusId, flow]);
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_e, node) => onSelect(node.id)}
      onPaneClick={() => onSelect("")}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
      minZoom={0.1}
      maxZoom={2}
      deleteKeyCode={null}
    >
      <Background color="#d5d0df" gap={22} size={1} />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => String(n.data.color)}
        maskColor="#f6f4fa99"
      />
    </ReactFlow>
  );
}
export function MapCanvas(props: Parameters<typeof Canvas>[0]) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

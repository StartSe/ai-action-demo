"use client";
import { useState } from "react";
import type { Note } from "@/lib/types";
import { Icon } from "./Icons";
export const COLORS = [
  "#9e91ff",
  "#59cfba",
  "#eba76d",
  "#79b9f5",
  "#e591c4",
  "#c3cf70",
  "#80d8df",
];
export function Graph({
  notes,
  open,
  expanded = false,
}: {
  notes: Note[];
  open: (n: Note) => void;
  expanded?: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<string | null>(null);
  const wiki = notes.filter((n) => n.kind === "wiki").slice(0, 28);
  const positions = wiki.map((n, i) => {
    const a =
      i * ((Math.PI * 2) / Math.max(wiki.length, 1)) - Math.PI / 2 + 0.22;
    const r = i % 3 === 0 ? 32 : i % 3 === 1 ? 39 : 28;
    return {
      n,
      x: 50 + Math.cos(a) * r,
      y: 49 + Math.sin(a) * (r * 0.87),
      color: COLORS[i % COLORS.length],
    };
  });
  const edges = positions.flatMap((p, i) =>
    positions
      .filter(
        (q, j) =>
          j > i &&
          (p.n.content.includes(`[[${q.n.title}]]`) ||
            q.n.content.includes(`[[${p.n.title}]]`)),
      )
      .map((q) => ({ p, q })),
  );
  return (
    <div className={`graph ${expanded ? "expanded" : ""}`}>
      <div className="graph-grid" />
      <div className="graph-label">
        <span className="live-dot" /> MEMÓRIA EM ÓRBITA
      </div>
      <div className="graph-space" style={{ transform: `scale(${zoom})` }}>
        <svg
          className="graph-lines"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="orbitGlow">
              <stop offset="0" stopColor="#9e91ff" stopOpacity=".18" />
              <stop offset="1" stopColor="#9e91ff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="50" cy="49" rx="29" ry="40" fill="url(#orbitGlow)" />
          <ellipse cx="50" cy="49" rx="22" ry="34" className="orbit" />
          <ellipse cx="50" cy="49" rx="32" ry="45" className="orbit outer" />
          {positions.map((p) => (
            <line
              key={p.n.id}
              x1="50"
              y1="49"
              x2={p.x}
              y2={p.y}
              stroke={p.color}
              strokeOpacity=".13"
              strokeWidth=".12"
            />
          ))}
          {edges.map(({ p, q }) => (
            <g key={p.n.id + q.n.id}>
              <path
                d={`M ${p.x} ${p.y} Q 50 49 ${q.x} ${q.y}`}
                fill="none"
                stroke={
                  hover === p.n.id || hover === q.n.id ? p.color : "#8880b9"
                }
                strokeOpacity={
                  hover === p.n.id || hover === q.n.id ? 0.85 : 0.32
                }
                strokeWidth=".16"
              />
              <circle r=".27" fill={p.color} opacity=".7">
                <animateMotion
                  dur={`${6 + (p.x % 5)}s`}
                  repeatCount="indefinite"
                  path={`M ${p.x} ${p.y} Q 50 49 ${q.x} ${q.y}`}
                />
              </circle>
            </g>
          ))}
        </svg>
        <div className="core">
          <div className="core-ring ring-one" />
          <div className="core-ring ring-two" />
          <div className="core-sphere">
            <Icon name="brain" size={40} />
          </div>
          <span>DAILY</span>
          <small>seu segundo cérebro</small>
        </div>
        {positions.map((p, i) => (
          <button
            key={p.n.id}
            className={`graph-node ${hover === p.n.id ? "hover" : ""}`}
            style={
              {
                left: `${p.x}%`,
                top: `${p.y}%`,
                "--node-color": p.color,
              } as React.CSSProperties
            }
            onClick={() => open(p.n)}
            onMouseEnter={() => setHover(p.n.id)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(p.n.id)}
            onBlur={() => setHover(null)}
          >
            <span
              className="node-dot"
              style={{ width: 12 + (i % 3) * 4, height: 12 + (i % 3) * 4 }}
            />
            <span>{p.n.title}</span>
          </button>
        ))}
      </div>
      {!wiki.length && (
        <div className="graph-empty">
          Cada ideia é o começo de uma conexão.
          <br />
          <small>Sua constelação nasce com a primeira memória.</small>
        </div>
      )}
      <div className="graph-bottom">
        <span>
          <i style={{ background: COLORS[0] }} /> Conhecimento{" "}
          <i style={{ background: COLORS[1] }} /> Conexões
        </span>
        <div>
          <button
            title="Diminuir mapa"
            aria-label="Diminuir mapa"
            onClick={() => setZoom((z) => Math.max(0.65, z - 0.15))}
          >
            <Icon name="minus" size={16} />
          </button>
          <button
            title="Restaurar mapa"
            aria-label="Restaurar mapa"
            onClick={() => setZoom(1)}
          >
            <Icon name="expand" size={16} />
          </button>
          <button
            title="Ampliar mapa"
            aria-label="Ampliar mapa"
            onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))}
          >
            <Icon name="plus" size={16} />
          </button>
        </div>
      </div>
      {wiki.length === 28 && (
        <span className="map-limit">
          28 páginas recentes · todas disponíveis na Wiki
        </span>
      )}
    </div>
  );
}

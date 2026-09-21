// Metadados visuais sem credenciais. A execução continua usando somente config.tools.
export type ToolCard = { id: string; kind: "tool" | "mcp"; target: string };
export function selectedTools(value: string): string[] {
  return [...new Set(value.split(",").map((v) => v.trim()).filter(Boolean)
    .map((v) => v.includes(":") ? v : `mcp:FERRAMENTAS:${v}`))];
}
export function belongsToCard(tool: string, card: ToolCard) {
  return !!card.target && (card.kind === "tool" ? tool === card.target : tool.startsWith(`mcp:${card.target}:`));
}
export function readToolCards(value: string, encoded = ""): ToolCard[] {
  const cards: ToolCard[] = [];
  try {
    const parsed: unknown = JSON.parse(encoded);
    if (Array.isArray(parsed)) for (const c of parsed) {
      if (!c || typeof c.id !== "string" || !c.id || !["tool", "mcp"].includes(c.kind) || typeof c.target !== "string") continue;
      if (cards.some((p) => p.id === c.id || (c.target && p.kind === c.kind && p.target === c.target))) continue;
      cards.push({ id: c.id, kind: c.kind, target: c.target });
    }
  } catch {}
  // Fluxos anteriores ganham um cartão por ferramenta e por servidor, sem mudar permissões.
  for (const id of selectedTools(value)) {
    const kind = id.startsWith("mcp:") ? "mcp" : "tool";
    const target = kind === "mcp" ? id.split(":")[1] : id;
    if (!cards.some((c) => c.kind === kind && c.target === target)) {
      let key = `saved-${kind}-${target}`;
      while (cards.some((c) => c.id === key)) key += "-";
      cards.push({ id: key, kind, target });
    }
  }
  return cards;
}
export function replaceToolCard(selected: string[], cards: ToolCard[], id: string, target: string | null) {
  const card = cards.find((c) => c.id === id);
  if (!card || card.target === target) return { selected, cards };
  if (target && cards.some((c) => c.id !== id && c.kind === card.kind && c.target === target)) return { selected, cards };
  const next = selected.filter((t) => !belongsToCard(t, card));
  if (target && card.kind === "tool") next.push(target);
  return {
    selected: [...new Set(next)],
    cards: target === null ? cards.filter((c) => c.id !== id) : cards.map((c) => c.id === id ? { ...c, target } : c),
  };
}

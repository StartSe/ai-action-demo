"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ToolGroup } from "@/lib/tools";
import { belongsToCard, readToolCards, replaceToolCard, selectedTools, type ToolCard as Card } from "@/lib/agent-tools";
import { Icon, request } from "./StudioUI";
import { ToolCard } from "./ToolCard";
import { ToolCredentialFields } from "./ToolCredentialFields";
import { McpToolCard } from "./McpToolCard";
import type { ToolServer } from "./ToolServers";
export function ToolPicker({ value, cardsValue = "", onChange }: {
  value: string; cardsValue?: string; onChange: (value: string, cards: string) => void;
}) {
  const [groups, setGroups] = useState<ToolGroup[] | null>(null), [servers, setServers] = useState<ToolServer[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null), generation = useRef(0);
  const selected = selectedTools(value), cards = readToolCards(value, cardsValue);
  const latest = useRef({ selected, cards });
  useEffect(() => { latest.current = { selected: selectedTools(value), cards: readToolCards(value, cardsValue) }; }, [value, cardsValue]);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setBusy(true);
    const [tools, connections] = await Promise.allSettled([
      request<ToolGroup[]>("/api/tools?server=interno"), request<ToolServer[]>("/api/conexoes/mcp"),
    ]);
    if (current !== generation.current) return;
    if (tools.status === "fulfilled") setGroups(tools.value);
    if (connections.status === "fulfilled") setServers(connections.value);
    setError(tools.status === "rejected" || connections.status === "rejected" ? "Não foi possível atualizar todas as conexões. Suas seleções foram preservadas. Tente novamente." : "");
    setBusy(false);
  }, []);
  useEffect(() => {
    const invalidate = () => { generation.current++; };
    const timer = setTimeout(() => void refresh(), 0);
    const focus = () => void refresh(); window.addEventListener("focus", focus);
    return () => { clearTimeout(timer); invalidate(); window.removeEventListener("focus", focus); };
  }, [refresh]);
  function commit(ids: string[], next: Card[]) {
    latest.current = { selected: [...new Set(ids)], cards: next };
    onChange(latest.current.selected.join(","), JSON.stringify(next));
  }
  function replace(id: string, target: string | null) {
    const next = replaceToolCard(latest.current.selected, latest.current.cards, id, target);
    commit(next.selected, next.cards);
  }
  function add(kind: Card["kind"]) {
    const id = crypto.randomUUID();
    commit(latest.current.selected, [...latest.current.cards, { id, kind, target: "" }]);
    requestAnimationFrame(() => root.current?.querySelector<HTMLSelectElement>(`[data-tool-card="${id}"] select`)?.focus());
  }
  const tools = (groups || []).flatMap((g) => g.tools);
  return <div className="tool-picker" ref={root}>
    <p>Adicione uma ferramenta ou servidor e configure cada cartão. Só as ações selecionadas ficam disponíveis para este agente.</p>
    {error && <div role="alert"><p className="studio-error">{error}</p><button type="button" className="studio-button" disabled={busy} onClick={() => void refresh()}>Tentar novamente</button></div>}
    {busy && !groups && <p role="status">Carregando ferramentas e conexões…</p>}
    {!cards.length && <div className="tool-empty"><Icon name="tool" size={24} /><strong>Nenhuma ferramenta adicionada</strong><p>Escolha o que o agente precisa para realizar seu trabalho.</p></div>}
    <div className="agent-tool-cards">{cards.map((card) => {
      if (card.kind === "mcp") return <div key={card.id} data-tool-card={card.id}><McpToolCard
        target={card.target} servers={servers} used={cards.filter((c) => c.kind === "mcp").map((c) => c.target)} selected={selected}
        onTarget={(target) => replace(card.id, target)} onRemove={() => replace(card.id, null)}
        onSelection={(ids) => commit([...latest.current.selected.filter((id) => !belongsToCard(id, card)), ...ids], latest.current.cards)}
        onServerSaved={(s) => setServers((all) => [...all.filter((o) => o.prefixo !== s.prefixo), s])}
        onServerDeleted={(target) => setServers((all) => all.filter((o) => o.prefixo !== target))}
      /></div>;
      const tool = tools.find((t) => t.id === card.target);
      const title = tool?.label || tool?.name || (card.target ? card.target.split(":").pop()! : "Nova ferramenta");
      return <div key={card.id} data-tool-card={card.id}><ToolCard kind="tool" title={title} initiallyOpen={!card.target}
        status={!card.target ? "Escolha uma ferramenta" : !tool ? "Conferir disponibilidade" : tool.configured === false ? "Configuração pendente" : "Pronta para usar"}
        onRemove={() => replace(card.id, null)}>
        <label>Ferramenta<select aria-label="Ferramenta" value={card.target} disabled={!groups} onChange={(e) => replace(card.id, e.target.value)}>
          <option value="">Escolha uma ferramenta</option>
          {[...new Set(tools.map((t) => t.category || "Outras"))].map((category) => <optgroup key={category} label={category}>
            {tools.filter((t) => (t.category || "Outras") === category).map((t) => <option key={t.id} value={t.id} disabled={selected.includes(t.id) && t.id !== card.target}>{t.label || t.name}{selected.includes(t.id) && t.id !== card.target ? " · já adicionada" : ""}</option>)}
          </optgroup>)}
          {card.target && !tool && <option value={card.target}>{title} · indisponível</option>}
        </select></label>
        {tool && <><p>{tool.description}</p><ToolCredentialFields key={tool.id} tool={tool} onSaved={setGroups} /></>}
        {card.target && !tool && groups && <p className="studio-error">Esta ferramenta não está disponível. Escolha outra ou remova o cartão.</p>}
      </ToolCard></div>;
    })}</div>
    <div className="tool-add-actions">
      <button type="button" className="studio-button" onClick={() => add("tool")}><Icon name="plus" size={16} />Adicionar ferramenta</button>
      <button type="button" className="studio-button" onClick={() => add("mcp")}><Icon name="plus" size={16} />Adicionar servidor MCP</button>
    </div>
    {!!cards.length && <small>A seleção vale apenas para este agente. Salve o bloco para aplicar.</small>}
  </div>;
}

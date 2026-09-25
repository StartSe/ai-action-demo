"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ToolGroup } from "@/lib/tools";
import { belongsToCard, readToolCards, replaceToolCard, selectedTools, type ToolCard as Card } from "@/lib/agent-tools";
import { Icon, request } from "./StudioUI";
import { ToolCard } from "./ToolCard";
import { ToolCredentialFields } from "./ToolCredentialFields";
import { McpToolCard } from "./McpToolCard";
import type { ToolServer } from "./ToolServers";
import type { SavedToolCredential } from "@/lib/tool-credential-store";
import { ToolCatalog } from "./ToolCatalog";
import { toolTitle } from "@/lib/tool-presentation";
export function ToolPicker({ value, cardsValue = "", onChange }: {
  value: string; cardsValue?: string; onChange: (value: string, cards: string) => void;
}) {
  const [groups, setGroups] = useState<ToolGroup[] | null>(null), [servers, setServers] = useState<ToolServer[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [credentials, setCredentials] = useState<SavedToolCredential[]>([]);
  const [catalog, setCatalog] = useState(false), [newCardId, setNewCardId] = useState("");
  const root = useRef<HTMLDivElement>(null), generation = useRef(0);
  const selected = selectedTools(value), cards = readToolCards(value, cardsValue);
  const latest = useRef({ selected, cards });
  useEffect(() => { latest.current = { selected: selectedTools(value), cards: readToolCards(value, cardsValue) }; }, [value, cardsValue]);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setBusy(true);
    const [tools, connections, accounts] = await Promise.allSettled([
      request<ToolGroup[]>("/api/tools?server=interno"), request<ToolServer[]>("/api/conexoes/mcp"),
      request<SavedToolCredential[]>("/api/tool-credentials"),
    ]);
    if (current !== generation.current) return;
    if (tools.status === "fulfilled") setGroups(tools.value);
    if (connections.status === "fulfilled") setServers(connections.value);
    if (accounts.status === "fulfilled") setCredentials(accounts.value);
    setError(tools.status === "rejected" || connections.status === "rejected" || accounts.status === "rejected" ? "Não foi possível atualizar todas as conexões. Suas seleções foram preservadas. Tente novamente." : "");
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
  function add(kind: Card["kind"], target = "") {
    if (target && latest.current.cards.some((card) => card.kind === kind && card.target === target)) return;
    const id = crypto.randomUUID();
    setNewCardId(id); setCatalog(false);
    commit(kind === "tool" && target ? [...latest.current.selected, target] : latest.current.selected, [...latest.current.cards, { id, kind, target }]);
    requestAnimationFrame(() => root.current?.querySelector<HTMLSelectElement>(`[data-tool-card="${id}"] select`)?.focus());
  }
  const tools = (groups || []).flatMap((g) => g.tools);
  return <div className="tool-picker" ref={root}>
    <p>Escolha as ferramentas e conecte as contas que este agente pode usar.</p>
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
      const title = tool ? toolTitle(tool) : (card.target ? card.target.split(":").pop()! : "Nova ferramenta");
      const account = credentials.find((c) => c.id === card.credentialId);
      const ready = card.credentialId ? !!account?.configured : tool?.configured !== false;
      return <div key={card.id} data-tool-card={card.id}><ToolCard kind="tool" title={title} initiallyOpen={!card.target || newCardId === card.id}
        status={!card.target ? "Escolha uma ferramenta" : !tool ? "Conferir disponibilidade" : !ready ? "Escolha uma conexão" : account ? `Conexão: ${account.name}` : "Pronta para usar"}
        onRemove={() => replace(card.id, null)}>
        <label>Ferramenta<select aria-label="Ferramenta" value={card.target} disabled={!groups} onChange={(e) => replace(card.id, e.target.value)}>
          <option value="">Escolha uma ferramenta</option>
          {[...new Set(tools.map((t) => t.category || "Outras"))].map((category) => <optgroup key={category} label={category}>
            {tools.filter((t) => (t.category || "Outras") === category).map((t) => <option key={t.id} value={t.id} disabled={selected.includes(t.id) && t.id !== card.target}>{toolTitle(t)}{selected.includes(t.id) && t.id !== card.target ? " · já adicionada" : ""}</option>)}
          </optgroup>)}
          {card.target && !tool && <option value={card.target}>{title} · indisponível</option>}
        </select></label>
        {tool && <><p>{tool.description}</p><ToolCredentialFields key={tool.id} tool={tool} credentialId={card.credentialId} credentials={credentials}
          onChange={(credentialId) => commit(latest.current.selected, latest.current.cards.map((c) => c.id === card.id ? { ...c, credentialId } : c))}
          onSaved={(credential) => { setCredentials((all) => [...all.filter((c) => c.id !== credential.id), credential]); void refresh(); }} /></>}
        {card.target && !tool && groups && <p className="studio-error">Esta ferramenta não está disponível. Escolha outra ou remova o cartão.</p>}
      </ToolCard></div>;
    })}</div>
    <div className="tool-add-actions">
      <button type="button" className="studio-button" disabled={!groups} onClick={() => setCatalog(true)}><Icon name="plus" size={16} />Adicionar ferramenta</button>
      <button type="button" className="tool-text-button" onClick={() => add("mcp")}>Conectar serviço por MCP</button>
    </div>
    {!!cards.length && <small>A seleção vale apenas para este agente. Ao fechar o bloco, salve o fluxo para aplicar.</small>}
    {catalog && <ToolCatalog tools={tools} selected={selected} onChoose={(id) => add("tool", id)} onServer={() => add("mcp")} onClose={() => setCatalog(false)} />}
  </div>;
}

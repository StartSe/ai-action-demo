"use client";
import { useEffect, useMemo, useState } from "react";
import { request } from "./StudioUI";
export type ChatModel = { id: string; name: string };
export type RouterModel = { id: string; nome: string; provedor: string };
const PREFIX = "openrouter:";
// Nome curto de um modelo salvo no bloco, para a pílula do bloco e a lista.
export const OPENROUTER_AUTO = PREFIX + "openrouter/auto";
export function modelLabel(model?: string) {
  if (!model) return "ChatGPT";
  if (model === OPENROUTER_AUTO) return "OpenRouter automático";
  if (model.startsWith(PREFIX)) {
    const id = model.slice(PREFIX.length);
    return id.includes("/") ? id.split("/").slice(1).join("/") : id;
  }
  return model;
}
export function modelProvider(model?: string) {
  return model?.startsWith(PREFIX) ? "OpenRouter" : "ChatGPT";
}
// Seletor de modelo: ChatGPT (assinatura, principal) e, quando conectado, os modelos do
// OpenRouter agrupados por provedor, com busca para os mais de 500 disponíveis.
export function ModelPicker({
  value,
  chatModels,
  onChange,
}: {
  value: string;
  chatModels: ChatModel[];
  onChange: (v: string) => void;
}) {
  const [router, setRouter] = useState<RouterModel[] | null>(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    let alive = true;
    void request<{ conectado: boolean; modelos: RouterModel[] }>(
      "/api/conexoes/modelos",
    )
      .then((r) => alive && setRouter(r.conectado ? r.modelos : []))
      .catch(() => alive && setRouter([]));
    return () => {
      alive = false;
    };
  }, []);
  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (router || []).filter(
        (m) => !q || (m.id + " " + m.nome).toLowerCase().includes(q),
      ),
    [router, q],
  );
  const groups = useMemo(() => {
    const map = new Map<string, RouterModel[]>();
    for (const m of filtered) map.set(m.provedor, [...(map.get(m.provedor) || []), m]);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);
  const known =
    !value ||
    value === OPENROUTER_AUTO ||
    chatModels.some((m) => m.id === value) ||
    (router || []).some((m) => PREFIX + m.id === value);
  return (
    <div className="model-picker">
      {router && router.length > 0 && (
        <input
          type="search"
          placeholder="Buscar entre os modelos do OpenRouter…"
          aria-label="Buscar modelo"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <optgroup label="ChatGPT · assinatura (principal)">
          <option value="">Automático · ChatGPT</option>
          {chatModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </optgroup>
        {router && router.length > 0 && (
          <optgroup label="OpenRouter · automático">
            <option value={OPENROUTER_AUTO}>
              Automático · OpenRouter escolhe o melhor modelo
            </option>
          </optgroup>
        )}
        {groups.map(([provider, models]) => (
          <optgroup key={provider} label={"OpenRouter · " + provider}>
            {models.map((m) => (
              <option key={m.id} value={PREFIX + m.id}>
                {m.nome}
              </option>
            ))}
          </optgroup>
        ))}
        {!known && <option value={value}>{value} · modelo salvo</option>}
      </select>
      <small>
        {router === null
          ? "Consultando conexões…"
          : router.length
            ? `${router.length} modelos do OpenRouter disponíveis além do ChatGPT.`
            : "Conecte o OpenRouter em Conexões para escolher entre mais de 500 modelos."}
      </small>
    </div>
  );
}

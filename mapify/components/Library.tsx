"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo, Icon, IconButton, ErrorBox, request } from "./ui";
import { CreateMap } from "./CreateMap";
import { Connections } from "./Connections";
import { AppVersion } from "./AppVersion";
import {
  colors,
  sourceLabels,
  type MapCard,
  type SourceKind,
  type ConnectionStatus,
} from "@/lib/types";
export function MiniMap({ index = 0 }: { index?: number }) {
  return (
    <svg viewBox="0 0 360 165" className="mini-map" aria-hidden="true">
      <defs>
        <pattern
          id={`dots-${index}`}
          width="14"
          height="14"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r=".6" fill="#d6d3df" />
        </pattern>
      </defs>
      <rect width="360" height="165" fill={`url(#dots-${index})`} />
      {[0, 1, 2, 3].map((n) => {
        const right = n > 1;
        const y = n % 2 ? 119 : 48;
        const color = colors[(n + index) % 6];
        return (
          <g key={n} stroke={color} fill="none">
            <path
              d={`M180 82 C${right ? 218 : 142} 82 ${right ? 206 : 154} ${y} ${right ? 236 : 124} ${y}`}
            />
            <rect
              x={right ? 236 : 53}
              y={y - 10}
              width="71"
              height="20"
              rx="5"
              fill={color + "12"}
              strokeWidth=".8"
            />
            <path
              d={`M${right ? 246 : 63} ${y - 2}h40m-40 5h27`}
              opacity=".5"
            />
            {[0, 1].map((l) => (
              <path
                key={l}
                d={`M${right ? 307 : 53} ${y} Q${right ? 321 : 39} ${y} ${right ? 321 : 39} ${y + (l ? -20 : 20)}h${right ? 22 : -22}`}
                opacity=".55"
              />
            ))}
          </g>
        );
      })}
      <rect x="132" y="65" width="96" height="34" rx="8" fill="#8260d7" />
      <path
        d="M151 77h58m-49 9h39"
        stroke="#fff"
        strokeWidth="2"
        opacity=".85"
      />
    </svg>
  );
}
export function Library({
  youtubeResult,
}: {
  youtubeResult?: { connected?: boolean; error?: string };
}) {
  const router = useRouter();
  const [maps, setMaps] = useState<MapCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [create, setCreate] = useState<SourceKind | null>(null);
  const [connections, setConnections] = useState(!!youtubeResult);
  const [connectionSection, setConnectionSection] = useState<"ai" | "youtube">(
    "ai",
  );
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [list, setList] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    request<MapCard[]>("/api/maps")
      .then(setMaps)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const refreshConnection = useCallback(() => {
    request<ConnectionStatus>("/api/connections")
      .then((s) =>
        setConnected(s.provider === "chatgpt" ? s.chatgpt : s.openrouter),
      )
      .catch(() => setConnected(false));
  }, []);
  useEffect(() => {
    refresh();
    refreshConnection();
  }, [refresh, refreshConnection]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("exemplo"))
      router.replace("/maps/exemplo");
  }, [router]);
  const openMap = useCallback(
    (id: string) => router.push(`/maps/${id}`),
    [router],
  );
  const visible = maps
    .filter(
      (m) =>
        (filter === "all" ||
          (filter === "favorite" && m.favorite) ||
          filter === m.kind) &&
        `${m.title} ${m.summary}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title)
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand-link">
          <Logo />
        </Link>
        <button
          className="primary new-map"
          onClick={() => setCreate("youtube")}
        >
          <Icon name="plus" size={18} />
          Novo mapa
        </button>
        <span className="nav-label">Seu espaço</span>
        <nav>
          <button
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            <Icon name="grid" />
            Todos os mapas<span>{maps.length}</span>
          </button>
          <button
            className={filter === "favorite" ? "active" : ""}
            onClick={() => setFilter("favorite")}
          >
            <Icon name="star" />
            Favoritos
          </button>
        </nav>
        <span className="nav-label">Explorar por fonte</span>
        <nav>
          {(Object.keys(sourceLabels) as SourceKind[]).map((k) => (
            <button
              key={k}
              className={filter === k ? "active" : ""}
              onClick={() => setFilter(k)}
            >
              <span className={`source-icon ${k}`}>
                <Icon name={k} />
              </span>
              {sourceLabels[k]}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <Icon name="spark" />
            <strong>Suas ideias, ampliadas.</strong>
            <p>Conecte sua IA e transforme conteúdo em clareza.</p>
            <button onClick={() => setConnections(true)}>
              {connected ? "Gerenciar conexão" : "Conectar minha IA"}
              <Icon name="chevron" size={14} />
            </button>
          </div>
          <button className="account-link" onClick={() => setConnections(true)}>
            <span className={"status-dot" + (connected ? " online" : "")} />
            Configurações
            <Icon name="settings" size={17} />
          </button>
          <div className="sidebar-footer">
            <small>Feito para pensar melhor</small>
            <IconButton
              icon="logout"
              label="Sair da conta"
              onClick={async () => {
                await request("/api/auth", "DELETE");
                router.push("/entrar");
                router.refresh();
              }}
            />
          </div>
        </div>
      </aside>
      <main className="library-main">
        <header className="library-top">
          <div>
            <span className="breadcrumb">Meu espaço</span>
            <span className="breadcrumb-divider">/</span>
            <strong>
              {filter === "favorite" ? "Favoritos" : "Biblioteca"}
            </strong>
          </div>
          <div className="library-top-actions">
            <AppVersion />
            <button
              className="connection-pill"
              onClick={() => setConnections(true)}
            >
              <span className={"status-dot" + (connected ? " online" : "")} />
              {connected ? "IA conectada" : "Conectar IA"}
              <Icon name="link" size={15} />
            </button>
          </div>
        </header>
        <div className="library-content">
          <section className="welcome">
            <div>
              <span className="eyebrow">
                <span />
                Conecte ideias. Descubra possibilidades.
              </span>
              <h1>
                Grandes ideias começam
                <br />
                com <em>uma nova conexão.</em>
              </h1>
              <p>
                Transforme vídeos, documentos e páginas em mapas mentais.
                <br className="desktop-only" /> Menos tempo organizando. Mais
                espaço para entender.
              </p>
            </div>
            <div className="welcome-visual">
              <span className="orbit orbit-one" />
              <span className="orbit orbit-two" />
              <div className="idea-core">
                <Icon name="map" size={38} />
              </div>
              <span className="floating-source floating-a">
                <Icon name="youtube" />
                Vídeos
              </span>
              <span className="floating-source floating-b">
                <Icon name="pdf" />
                Documentos
              </span>
              <span className="floating-source floating-c">
                <Icon name="web" />
                Páginas
              </span>
              <span className="tiny-spark">
                <Icon name="spark" size={22} />
              </span>
            </div>
          </section>
          <section
            className="source-cards"
            aria-label="Criar mapa a partir de uma fonte"
          >
            {[
              {
                kind: "youtube",
                title: "Um vídeo, muitas ideias",
                sub: "Do YouTube direto para o mapa.",
              },
              {
                kind: "pdf",
                title: "Veja além das páginas",
                sub: "Dê uma nova forma aos seus PDFs.",
              },
              {
                kind: "web",
                title: "Conecte o que você lê",
                sub: "Artigos, produtos e landing pages.",
              },
              {
                kind: "text",
                title: "Tire as ideias do papel",
                sub: "Cole um texto. Encontre a estrutura.",
              },
            ].map((s) => (
              <button
                key={s.kind}
                className="source-card"
                onClick={() => setCreate(s.kind as SourceKind)}
              >
                <span className={`source-tile ${s.kind}`}>
                  <Icon name={s.kind} size={23} />
                </span>
                <strong>{s.title}</strong>
                <p>{s.sub}</p>
                <span className="source-card-action">
                  {sourceLabels[s.kind as SourceKind]}
                  <Icon name="plus" size={15} />
                </span>
              </button>
            ))}
          </section>
          <section className="maps-section">
            <div className="section-heading">
              <div>
                <h2>
                  {filter === "favorite"
                    ? "Seus favoritos"
                    : filter === "all"
                      ? "Seus mapas"
                      : `Mapas de ${sourceLabels[filter as SourceKind]}`}
                </h2>
                <span>
                  {visible.length} {visible.length === 1 ? "mapa" : "mapas"}
                </span>
              </div>
              <button
                className="text-button"
                onClick={() => openMap("exemplo")}
              >
                <Icon name="play" size={15} />
                Explorar exemplo
              </button>
            </div>
            <div className="library-tools">
              <label className="search-field">
                <Icon name="search" size={18} />
                <input
                  aria-label="Buscar mapas"
                  placeholder="Busque uma ideia, encontre um mapa…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <select
                aria-label="Ordenar mapas"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="recent">Mais recentes</option>
                <option value="name">Ordem alfabética</option>
              </select>
              <div className="view-toggle">
                <IconButton
                  icon="grid"
                  label="Visualização em grade"
                  active={!list}
                  onClick={() => setList(false)}
                />
                <IconButton
                  icon="list"
                  label="Visualização em lista"
                  active={list}
                  onClick={() => setList(true)}
                />
              </div>
            </div>
            <ErrorBox error={error} />
            {loading ? (
              <div className="empty-state">
                <span className="spinner" />
                Carregando seus mapas…
              </div>
            ) : visible.length ? (
              <div className={"map-grid" + (list ? " as-list" : "")}>
                {visible.map((map, i) => (
                  <article key={map.id} className="map-card">
                    <button
                      className="map-preview"
                      onClick={() => openMap(map.id)}
                      aria-label={`Abrir ${map.title}`}
                    >
                      <MiniMap index={i} />
                      <span className={`preview-badge ${map.kind}`}>
                        <Icon name={map.kind} size={13} />
                        {sourceLabels[map.kind]}
                      </span>
                    </button>
                    <div className="map-card-body">
                      <button
                        className="map-card-title"
                        onClick={() => openMap(map.id)}
                      >
                        {map.title}
                      </button>
                      <p>{map.summary}</p>
                      <div className="map-card-meta">
                        <span>
                          <Icon name="map" size={13} />
                          {map.nodes} tópicos
                        </span>
                        <span>
                          {new Date(map.updatedAt).toLocaleDateString("pt-BR", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                        <IconButton
                          icon="star"
                          label={
                            map.favorite
                              ? "Remover dos favoritos"
                              : "Adicionar aos favoritos"
                          }
                          active={map.favorite}
                          onClick={async () => {
                            try {
                              const m = await request<{ revision: number }>(
                                `/api/maps/${map.id}`,
                              );
                              await request(`/api/maps/${map.id}`, "PUT", {
                                revision: m.revision,
                                favorite: !map.favorite,
                              });
                              refresh();
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span className="empty-symbol">
                  <Icon name={search ? "search" : "map"} size={30} />
                </span>
                <h3>
                  {search
                    ? "Nenhum mapa encontrado"
                    : filter === "favorite"
                      ? "Suas melhores ideias, sempre por perto"
                      : "Um novo jeito de enxergar suas ideias"}
                </h3>
                <p>
                  {search
                    ? "Tente buscar por outro termo."
                    : filter === "favorite"
                      ? "Marque a estrela de um mapa para encontrá-lo aqui."
                      : "Crie seu primeiro mapa ou explore um exemplo interativo."}
                </p>
                {!search && filter === "all" && (
                  <div>
                    <button
                      className="primary"
                      onClick={() => setCreate("youtube")}
                    >
                      <Icon name="plus" size={16} />
                      Criar meu primeiro mapa
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const m = await request<{ id: string }>(
                            "/api/maps",
                            "POST",
                            {},
                          );
                          openMap(m.id);
                        } catch (e) {
                          setError((e as Error).message);
                          setBusy(false);
                        }
                      }}
                    >
                      Usar mapa de exemplo
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
          <footer className="library-footer">
            <Icon name="book" size={14} />
            Cada conexão é uma nova forma de aprender.
            <span>Mapia / StartSe</span>
          </footer>
        </div>
      </main>
      {create && (
        <CreateMap
          initial={create}
          onClose={() => setCreate(null)}
          onCreated={openMap}
          onConnect={(section = "ai") => {
            setCreate(null);
            setConnectionSection(section);
            setConnections(true);
          }}
        />
      )}
      {connections && (
        <Connections
          youtubeResult={youtubeResult}
          initialSection={connectionSection}
          onClose={() => {
            setConnections(false);
            setConnectionSection("ai");
            if (youtubeResult) window.history.replaceState(null, "", "/");
          }}
          onSaved={refreshConnection}
        />
      )}
    </div>
  );
}

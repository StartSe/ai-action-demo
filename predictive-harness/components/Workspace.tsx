"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Mensagem } from "@/lib/types";
import { Dados, type PlanilhaComSugestoes } from "./Dados";
import { Conversa } from "./Conversa";
import { Harness } from "./Harness";
import { Icon, IconButton, Logo, request } from "./ui";
type Status = { ai: boolean; demo: boolean; harness: boolean; integrations: { chatgpt: boolean; openrouter: boolean; jev: boolean } };
export function Workspace() {
  const params = useSearchParams();
  const router = useRouter();
  const exemplo = params.get("exemplo") === "1";
  const captura = params.get("captura") === "1";
  const [status, setStatus] = useState<Status | null>(null);
  const [planilhas, setPlanilhas] = useState<PlanilhaComSugestoes[]>([]);
  const [ativaId, setAtivaId] = useState<string | null>(null);
  const [conversa, setConversa] = useState<{ id: string; lista: Mensagem[] } | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [painel, setPainel] = useState<"conversa" | "dados" | "harness">("conversa");
  const [mostrarHarness, setMostrarHarness] = useState(true);
  const [erro, setErro] = useState("");
  useEffect(() => {
    void request<Status>("/api/status").then(setStatus).catch(() => setStatus(null));
    void request<{ planilhas: PlanilhaComSugestoes[] }>("/api/planilhas")
      .then((r) => {
        setPlanilhas(r.planilhas);
        const demo = r.planilhas.find((p) => p.demo);
        setAtivaId((exemplo && demo ? demo : r.planilhas[0])?.id || null);
      })
      .catch((e) => setErro(e.message));
  }, [exemplo]);
  useEffect(() => {
    if (!ativaId) return;
    let vivo = true;
    void request<{ mensagens: Mensagem[] }>(`/api/planilhas/${ativaId}/conversa`)
      .then((r) => {
        if (!vivo) return;
        setConversa({ id: ativaId, lista: r.mensagens });
        setSelecionada([...r.mensagens].reverse().find((m) => m.papel === "assistente")?.id || null);
      })
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [ativaId]);
  const mensagens = conversa && conversa.id === ativaId ? conversa.lista : [];
  const setMensagens = (lista: Mensagem[]) => ativaId && setConversa({ id: ativaId, lista });
  const ativa = planilhas.find((p) => p.id === ativaId) || null;
  const atualizar = useCallback((lista: PlanilhaComSugestoes[], selecionar?: string) => {
    setPlanilhas(lista);
    if (selecionar) setAtivaId(selecionar);
    else if (!lista.some((p) => p.id === ativaId)) setAtivaId(lista[0]?.id || null);
  }, [ativaId]);
  const msgSelecionada = mensagens.find((m) => m.id === selecionada) || null;
  const classes = ["workspace", mostrarHarness ? "" : "sem-harness", painel === "dados" ? "mostrar-dados" : painel === "harness" ? "mostrar-harness" : ""].filter(Boolean).join(" ");
  return (
    <div className="app">
      <header className="topbar">
        <Link href="/" aria-label="Início"><Logo compact /></Link>
        <div className="grow">
          {ativa && <span className="titulo">· {ativa.nome}</span>}
          {status && (
            <span className={"chip " + (status.harness ? "ok" : "warn")}>
              <Icon name={status.harness ? "check" : "info"} size={12} /> {status.harness ? "Harness ligado" : status.integrations.jev ? "Jev pronto · falta o modelo de conversa" : status.ai ? "Modelo pronto · falta o OpenRouter (Jev)" : "Demonstração"}
            </span>
          )}
        </div>
        <IconButton icon="table" label="Dados" active={painel === "dados"} onClick={() => setPainel(painel === "dados" ? "conversa" : "dados")} />
        <IconButton icon="harness" label="Decisões do harness" active={painel === "harness" || mostrarHarness} onClick={() => { setMostrarHarness((v) => painel === "harness" ? v : !v); setPainel(painel === "harness" ? "conversa" : window.innerWidth <= 1100 ? "harness" : painel); }} />
        <Link className="secondary" href="/configuracoes"><Icon name="settings" size={16} /><span className="rotulo">Configurações</span></Link>
        <IconButton icon="logout" label="Sair" onClick={() => void fetch("/api/auth", { method: "DELETE" }).then(() => { router.push("/entrar"); router.refresh(); })} />
      </header>
      <div className={classes}>
        <section className="coluna dados">
          <header><h2><Icon name="table" size={16} /> Dados</h2></header>
          <div className="rolagem">
            {erro && <div className="error-box">{erro}</div>}
            <Dados planilhas={planilhas} ativa={ativa} jevDisponivel={!!status?.integrations.jev} onSelecionar={(id) => { setAtivaId(id); setPainel("conversa"); }} onAtualizar={atualizar} />
          </div>
        </section>
        <section className="coluna conversa">
          {ativa ? (
            <Conversa
              key={ativa.id}
              planilha={ativa}
              mensagens={mensagens}
              harnessPronto={!!status?.harness}
              conversaPronta={!!status?.ai}
              selecionada={selecionada}
              onSelecionar={setSelecionada}
              onVerDecisoes={(id) => { setSelecionada(id); setMostrarHarness(true); if (window.innerWidth <= 1100) setPainel("harness"); }}
              onMensagens={setMensagens}
              autoPergunta={exemplo && ativa.demo ? ativa.sugestoes[0] || null : null}
              semRolagem={captura}
            />
          ) : (
            <div className="rolagem"><div className="vazio"><h3>Carregando…</h3></div></div>
          )}
        </section>
        <section className="coluna harness">
          <header>
            <h2><Icon name="harness" size={16} /> Harness</h2>
            {msgSelecionada && <small className="muted">decisões desta resposta</small>}
          </header>
          <div className="rolagem"><Harness mensagem={msgSelecionada} /></div>
        </section>
      </div>
    </div>
  );
}

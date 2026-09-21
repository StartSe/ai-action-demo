"use client";
// Tela de trabalho do agente de FP&A: três colunas (Base e premissas · Conversa · Como cheguei aqui).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { DadosBase, Mensagem } from "@/lib/types";
import type { ChavePremissa } from "@/lib/fpa";
import { Base } from "./Base";
import { Conversa } from "./Conversa";
import { ComoCheguei } from "./ComoCheguei";
import { Icon, IconButton, Logo, request } from "./ui";
import { AppVersion } from "./AppVersion";
type Status = { ai: boolean; demo: boolean; harness: boolean; integrations: { chatgpt: boolean; openrouter: boolean; jev: boolean } };
export function Workspace() {
  const params = useSearchParams();
  const router = useRouter();
  const exemplo = params.get("exemplo") === "1";
  const captura = params.get("captura") === "1";
  const [status, setStatus] = useState<Status | null>(null);
  const [base, setBase] = useState<DadosBase | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[] | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [produto, setProduto] = useState<string | null>(null);
  const [painel, setPainel] = useState<"conversa" | "base" | "harness">("conversa");
  const [mostrarHarness, setMostrarHarness] = useState(true);
  const [erro, setErro] = useState("");
  const aplicarBase = useCallback((b: DadosBase) => {
    setBase(b);
    setProduto((atual) => (atual && b.produtos.some((p) => p.nome === atual) ? atual : b.produtos[0]?.nome || null));
  }, []);
  const carregarBase = useCallback(async () => {
    try {
      aplicarBase(await request<DadosBase>("/api/base"));
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [aplicarBase]);
  useEffect(() => {
    void request<Status>("/api/status").then(setStatus).catch(() => setStatus(null));
    void request<DadosBase>("/api/base").then(aplicarBase).catch((e: Error) => setErro(e.message));
    void request<{ mensagens: Mensagem[] }>("/api/base/conversa")
      .then((r) => {
        setMensagens(r.mensagens);
        setSelecionada([...r.mensagens].reverse().find((m) => m.papel === "assistente")?.id || null);
      })
      .catch((e) => setErro(e.message));
  }, [aplicarBase]);
  const lista = mensagens || [];
  const msgSelecionada = lista.find((m) => m.id === selecionada) || null;
  async function recalcular(id: string, ajustes: Partial<Record<ChavePremissa, string>>, salvar: boolean) {
    const r = await request<{ mensagem: Mensagem }>("/api/base/recalcular", "POST", { mensagemId: id, ajustes, salvar });
    setMensagens(lista.map((m) => (m.id === id ? r.mensagem : m)));
    if (salvar) await carregarBase();
  }
  const classes = ["workspace", mostrarHarness ? "" : "sem-harness", painel === "base" ? "mostrar-dados" : painel === "harness" ? "mostrar-harness" : ""].filter(Boolean).join(" ");
  return (
    <div className="app">
      <header className="topbar">
        <Link href="/" aria-label="Início"><Logo compact /></Link>
        <div className="grow">
          <span className="titulo">· Agente de FP&A</span>
          <AppVersion />
          {status && (
            <span className={"chip " + (status.harness ? "ok" : "warn")}>
              <Icon name={status.harness ? "check" : "info"} size={12} /> {status.harness ? "Harness ligado" : status.integrations.jev ? "Jev pronto · falta o modelo de conversa" : status.ai ? "Modelo pronto · falta o OpenRouter (Jev)" : "Demonstração"}
            </span>
          )}
        </div>
        <IconButton icon="table" label="Base e premissas" active={painel === "base"} onClick={() => setPainel(painel === "base" ? "conversa" : "base")} />
        <IconButton icon="harness" label="Como cheguei aqui" active={painel === "harness" || mostrarHarness} onClick={() => { setMostrarHarness((v) => painel === "harness" ? v : !v); setPainel(painel === "harness" ? "conversa" : window.innerWidth <= 1100 ? "harness" : painel); }} />
        <Link className="secondary" href="/configuracoes"><Icon name="settings" size={16} /><span className="rotulo">Configurações</span></Link>
        <IconButton icon="logout" label="Sair" onClick={() => void fetch("/api/auth", { method: "DELETE" }).then(() => { router.push("/entrar"); router.refresh(); })} />
      </header>
      <div className={classes}>
        <section className="coluna dados">
          <header><h2><Icon name="table" size={16} /> Base e premissas</h2></header>
          <div className="rolagem">
            {erro && <div className="error-box">{erro}</div>}
            <Base base={base} jevDisponivel={!!status?.integrations.jev} produtoSelecionado={produto} onProduto={setProduto} onAtualizar={carregarBase} />
          </div>
        </section>
        <section className="coluna conversa">
          {mensagens ? (
            <Conversa
              base={base}
              mensagens={lista}
              harnessPronto={!!status?.harness}
              conversaPronta={!!status?.ai}
              selecionada={selecionada}
              onSelecionar={setSelecionada}
              onVerDecisoes={(id) => { setSelecionada(id); setMostrarHarness(true); if (window.innerWidth <= 1100) setPainel("harness"); }}
              onMensagens={setMensagens}
              onBaseMudou={carregarBase}
              autoPergunta={exemplo && base?.demo ? base.sugestoes[1]?.texto || base.sugestoes[0]?.texto || null : null}
              semRolagem={captura}
            />
          ) : (
            <div className="rolagem"><div className="vazio"><h3>Carregando…</h3></div></div>
          )}
        </section>
        <section className="coluna harness">
          <header>
            <h2><Icon name="harness" size={16} /> Como cheguei aqui</h2>
            {msgSelecionada && <small className="muted">desta resposta</small>}
          </header>
          <div className="rolagem"><ComoCheguei mensagem={msgSelecionada} onRecalcular={recalcular} /></div>
        </section>
      </div>
    </div>
  );
}

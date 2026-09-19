"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";

export function ConectarLivekit({ aoConectar, configurada, porAmbiente }: { aoConectar: () => void; configurada: boolean; porAmbiente: boolean }) {
  const [autorizacao, setAutorizacao] = useState<{ url: string; expira: number } | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState(false);
  const geracao = useRef(0);
  const aoConcluir = useEffectEvent(() => aoConectar());
  useEffect(() => {
    if (!autorizacao) return;
    let ativa = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function consultar() {
      if (!ativa) return;
      if (Date.now() >= autorizacao!.expira) {
        setAutorizacao(null); setErro(true); setMensagem("A autorização expirou. Clique em conectar para tentar novamente."); return;
      }
      try {
        const r = await fetch("/api/setup/livekit-cloud", { method: "PUT", signal: controller.signal });
        const dados = await r.json();
        if (!ativa) return;
        if (!r.ok) throw new Error(dados.error || "Não foi possível verificar a autorização.");
        if (dados.conectada) {
          setAutorizacao(null); setErro(false); setMensagem("Projeto conectado. As credenciais foram salvas."); aoConcluir(); return;
        }
      } catch (e) {
        if (!ativa) return;
        setAutorizacao(null); setErro(true); setMensagem(e instanceof Error ? e.message : "Não foi possível verificar a autorização."); return;
      }
      timer = setTimeout(consultar, 4000);
    }
    timer = setTimeout(consultar, 4000);
    return () => { ativa = false; clearTimeout(timer); controller.abort(); };
  }, [autorizacao]);
  useEffect(() => () => { geracao.current++; }, []);
  async function conectar() {
    const tentativa = ++geracao.current;
    setIniciando(true); setMensagem(""); setErro(false);
    const janela = window.open("about:blank", "_blank");
    if (janela) { janela.opener = null; janela.document.body.textContent = "Preparando a conexão com o LiveKit…"; }
    try {
      const r = await fetch("/api/setup/livekit-cloud", { method: "POST" });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados.error || "Não foi possível iniciar a conexão.");
      if (tentativa !== geracao.current) { janela?.close(); return; }
      setAutorizacao(dados);
      if (janela) janela.location.href = dados.url;
    } catch (e) {
      janela?.close();
      if (tentativa !== geracao.current) return;
      setErro(true); setMensagem(e instanceof Error ? e.message : "Não foi possível iniciar a conexão.");
    } finally { if (tentativa === geracao.current) setIniciando(false); }
  }
  async function cancelar() {
    try {
      const r = await fetch("/api/setup/livekit-cloud", { method: "DELETE" });
      if (!r.ok) throw new Error("Não foi possível cancelar. Tente novamente.");
      geracao.current++; setAutorizacao(null); setMensagem("Tentativa cancelada neste app."); setErro(false);
    } catch (e) { setErro(true); setMensagem(e instanceof Error ? e.message : "Não foi possível cancelar."); }
  }
  return <div className="mb-5 rounded-xl bg-bg p-4">
    {autorizacao ? <>
      <p role="status" className="text-sm mb-3">Autorize no LiveKit e escolha o projeto. Esta tela confirma a conexão automaticamente.</p>
      <div className="flex flex-wrap gap-3">
        <a className="btn-primary !w-auto" href={autorizacao.url} target="_blank" rel="noreferrer">Abrir autorização no LiveKit</a>
        <button type="button" className="btn-ghost !w-auto" onClick={() => void cancelar()}>Cancelar conexão</button>
      </div>
    </> : <>
      <button type="button" className="btn-primary !w-auto" disabled={iniciando || porAmbiente} onClick={() => void conectar()}>{iniciando ? "Preparando conexão…" : configurada ? "Conectar outro projeto LiveKit" : "Autorizar LiveKit Cloud"}</button>
      <p className="text-sm text-muted mt-2">{porAmbiente ? "As credenciais estão definidas no ambiente do servidor." : "Entre na sua conta e escolha o projeto, sem copiar as chaves."}</p>
    </>}
    {mensagem && <p role={erro ? "alert" : "status"} className={`text-sm mt-3 ${erro ? "text-danger" : "text-muted"}`}>{mensagem}</p>}
    <p className="text-xs text-muted mt-3">As credenciais são salvas de forma cifrada neste servidor após a autorização.</p>
  </div>;
}

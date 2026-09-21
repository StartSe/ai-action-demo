"use client";
import { useEffect, useState, type ReactNode } from "react";
import { CopyButton } from "./ui";

type Preferencia = { provedor: "openrouter" | "chatgpt"; modelo: string; provedorFixo: boolean; modeloFixo: boolean };
type Conexao = {
  account: { email?: string; planType?: string } | null;
  login: { verificationUrl: string; userCode: string } | null;
  error: string | null;
  models: { id: string; name: string }[];
};
async function pedido<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Não foi possível atualizar a conexão.");
  return d;
}

export function ConexaoIA({ children, aoSalvar }: { children: ReactNode; aoSalvar: () => void }) {
  const [preferencia, setPreferencia] = useState<Preferencia>();
  const [conexao, setConexao] = useState<Conexao>();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let ativo = true;
    pedido<Preferencia>("/api/ia").then(d => { if (ativo) setPreferencia(d); }).catch(e => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, [tentativa]);
  useEffect(() => {
    if (preferencia?.provedor !== "chatgpt") return;
    let ativo = true;
    let timer: ReturnType<typeof setTimeout>;
    let conectada: boolean | undefined;
    const carregar = async () => {
      try {
        const d = await pedido<Conexao>("/api/chatgpt");
        if (!ativo) return;
        setConexao(d);
        if (conectada !== Boolean(d.account)) {
          conectada = Boolean(d.account);
          window.dispatchEvent(new Event("radar-conexoes"));
        }
        timer = setTimeout(carregar, 2500);
      } catch (e) {
        if (ativo) setErro((e as Error).message);
      }
    };
    void carregar();
    return () => { ativo = false; clearTimeout(timer); };
  }, [preferencia?.provedor, tentativa]);
  async function agir(fn: () => Promise<void>) {
    setOcupado(true); setErro("");
    try { await fn(); aoSalvar(); }
    catch (e) { setErro((e as Error).message); }
    finally { setOcupado(false); }
  }
  async function escolher(provedor: Preferencia["provedor"], modelo?: string) {
    await agir(async () => setPreferencia(await pedido<Preferencia>("/api/ia", "PUT", { provedor, ...(modelo === undefined ? {} : { modelo }) })));
  }
  const provedorFixo = preferencia?.provedorFixo;
  const modeloFixo = preferencia?.modeloFixo;
  return <div>
    <div className="p-4 space-y-3 text-sm">
      <p className="text-muted">Escolha a conta que vai analisar seus temas.</p>
      <fieldset className="flex flex-wrap gap-4" disabled={ocupado || !preferencia || provedorFixo}>
        <legend className="sr-only">Provedor de inteligência artificial</legend>
        {(["openrouter", "chatgpt"] as const).map(p => <label key={p} className="flex gap-2 items-center cursor-pointer"><input type="radio" name="provedor-ia" checked={preferencia?.provedor === p} onChange={() => escolher(p)} />{p === "chatgpt" ? "ChatGPT" : "OpenRouter"}</label>)}
      </fieldset>
      {provedorFixo && <p className="text-xs text-muted">A escolha da conta está definida pela equipe técnica.</p>}
      {erro && <div role="alert"><p className="text-danger">{erro}</p><button className="btn-link" onClick={() => { setErro(""); setTentativa(t => t + 1); }}>Tentar novamente</button></div>}
      {preferencia?.provedor === "chatgpt" && <div className="space-y-3">
        <p>Use sua assinatura ChatGPT. O uso segue o acesso e os limites da sua conta.</p>
        {!conexao && <p role="status">Verificando conexão…</p>}
        {conexao?.error && <p role="alert" className="text-danger">{conexao.error}</p>}
        {conexao?.account ? <>
          <p className="text-ok">Conectado: {conexao.account.email || "Conta ChatGPT"}{conexao.account.planType ? ` · ${conexao.account.planType}` : ""}</p>
          <label className="block font-semibold">Modelo<select className="input mt-1" value={preferencia.modelo} disabled={ocupado || modeloFixo} onChange={e => escolher("chatgpt", e.target.value)}>
            <option value="">Automático</option>
            {preferencia.modelo && !conexao.models.some(m => m.id === preferencia.modelo) && <option value={preferencia.modelo}>{preferencia.modelo} · indisponível</option>}
            {conexao.models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select></label>
          <button className="btn-ghost" disabled={ocupado} onClick={() => agir(async () => { await pedido("/api/chatgpt", "DELETE", {}); setConexao(await pedido<Conexao>("/api/chatgpt")); })}>Desconectar ChatGPT</button>
        </> : conexao?.login ? <>
          <p>Abra a página oficial e informe este código:</p>
          <strong className="block text-2xl tracking-widest">{conexao.login.userCode}</strong>
          <CopyButton texto={() => conexao.login!.userCode} rotulo="Copiar código" />
          <a className="btn-primary !w-auto" href={conexao.login.verificationUrl} target="_blank" rel="noreferrer">Entrar no ChatGPT</a>
          <p role="status">Aguardando sua autorização…</p>
          <button className="btn-link" disabled={ocupado} onClick={() => agir(async () => { await pedido("/api/chatgpt", "DELETE", { cancel: true }); setConexao(await pedido<Conexao>("/api/chatgpt")); })}>Cancelar conexão</button>
        </> : <button className="btn-primary" disabled={ocupado || !conexao} onClick={() => agir(async () => { const login = await pedido<Conexao["login"]>("/api/chatgpt", "POST"); setConexao(c => c ? { ...c, login, error: null } : c); })}>{ocupado ? "Preparando conexão…" : "Conectar com ChatGPT"}</button>}
        <p className="text-xs text-muted">Se solicitado, habilite o login por código de dispositivo nas configurações de segurança do ChatGPT. A conta conectada atende às análises desta instalação.</p>
      </div>}
    </div>
    {preferencia?.provedor === "openrouter" && children}
  </div>;
}

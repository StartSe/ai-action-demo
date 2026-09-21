"use client";
// Cartão "Motor de inteligência artificial" de /setup: escolhe entre OpenRouter (chave, cartão genérico logo
// abaixo) e ChatGPT (assinatura, login por código de dispositivo pelo Codex App Server — lib/chatgpt.ts).
// Desenho do radar-sinais. Leitura de captura continua pelo OpenRouter: o cartão avisa quando o ChatGPT é
// o escolhido e não há chave do OpenRouter.
import { useEffect, useState } from "react";
import { Aviso, CopyButton, lerErro } from "./ui";

type Preferencia = { provedor: "openrouter" | "chatgpt"; modelo: string; provedorFixo: boolean; modeloFixo: boolean };
type Conexao = {
  account: { email?: string; planType?: string } | null;
  login: { verificationUrl: string; userCode: string } | null;
  error: string | null;
  models: { id: string; name: string }[];
};

async function pedido<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!r.ok) throw new Error((await lerErro(r)).mensagem);
  return r.json();
}

export function ConexaoIA() {
  const [preferencia, setPreferencia] = useState<Preferencia | null>(null);
  const [conexao, setConexao] = useState<Conexao | null>(null);
  const [visao, setVisao] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    pedido<Preferencia>("/api/ia").then((d) => { if (ativo) setPreferencia(d); }).catch(async (e) => { if (ativo) setErro((await lerErro(e)).mensagem); });
    fetch("/api/status").then((r) => r.json()).then((s) => { if (ativo) setVisao(Boolean(s.vision)); }).catch(() => {});
    return () => { ativo = false; };
  }, [tentativa]);

  // Com o ChatGPT escolhido, consulta a conexão a cada 2,5 s (o login por código é concluído em outra aba).
  useEffect(() => {
    if (preferencia?.provedor !== "chatgpt") return;
    let ativo = true;
    let timer: ReturnType<typeof setTimeout>;
    const carregar = async () => {
      try {
        const d = await pedido<Conexao>("/api/chatgpt");
        if (!ativo) return;
        setConexao(d);
        timer = setTimeout(carregar, 2500);
      } catch (e) {
        if (ativo) setErro((await lerErro(e)).mensagem);
      }
    };
    void carregar();
    return () => { ativo = false; clearTimeout(timer); };
  }, [preferencia?.provedor, tentativa]);

  async function agir(fn: () => Promise<void>) {
    setOcupado(true);
    setErro("");
    try {
      await fn();
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    } finally {
      setOcupado(false);
    }
  }

  async function escolher(provedor: Preferencia["provedor"], modelo?: string) {
    await agir(async () => setPreferencia(await pedido<Preferencia>("/api/ia", "PUT", { provedor, ...(modelo === undefined ? {} : { modelo }) })));
  }

  return (
    <section id="ia" className="card p-6 max-md:p-5">
      <h2 className="text-lg font-bold mb-1">Motor de inteligência artificial</h2>
      <p className="text-muted text-sm mb-4 max-w-[640px]">Quem escreve e edita os seus sites: a chave do OpenRouter (cartão &ldquo;Inteligência artificial&rdquo;, acima) ou a sua assinatura do ChatGPT.</p>

      <fieldset className="flex flex-wrap gap-5 mb-4" disabled={ocupado || !preferencia || preferencia.provedorFixo}>
        <legend className="sr-only">Motor de inteligência artificial</legend>
        {(["openrouter", "chatgpt"] as const).map((p) => (
          <label key={p} className="flex gap-2 items-center cursor-pointer text-[15px]">
            <input type="radio" name="motor-ia" checked={preferencia?.provedor === p} onChange={() => escolher(p)} />
            {p === "chatgpt" ? "ChatGPT (assinatura)" : "OpenRouter (chave)"}
          </label>
        ))}
      </fieldset>
      {preferencia?.provedorFixo && <p className="text-muted text-[12.5px] mb-3">A escolha do motor foi definida pela equipe técnica.</p>}
      {erro && (
        <div className="mb-3 flex flex-col gap-2" role="alert">
          <Aviso tom="danger">{erro}</Aviso>
          <button type="button" className="btn-link text-[13px] self-start" onClick={() => { setErro(""); setTentativa((t) => t + 1); }}>Tentar novamente</button>
        </div>
      )}

      {preferencia?.provedor === "chatgpt" && (
        <div className="flex flex-col gap-3 max-w-[560px]">
          <p className="text-[14.5px]">Use a sua assinatura do ChatGPT. O uso segue o acesso e os limites da sua conta.</p>
          {!conexao && !erro && <p className="text-muted text-sm" role="status">Verificando a conexão...</p>}
          {conexao?.error && <Aviso tom="danger">{conexao.error}</Aviso>}
          {conexao?.account ? (
            <>
              <Aviso tom="ok">Conectado: {conexao.account.email || "conta ChatGPT"}{conexao.account.planType ? ` · ${conexao.account.planType}` : ""}</Aviso>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                Modelo
                <select className="input" value={preferencia.modelo} disabled={ocupado || preferencia.modeloFixo} onChange={(e) => escolher("chatgpt", e.target.value)}>
                  <option value="">Automático</option>
                  {preferencia.modelo && !conexao.models.some((m) => m.id === preferencia.modelo) && <option value={preferencia.modelo}>{preferencia.modelo} · indisponível</option>}
                  {conexao.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <div>
                <button type="button" className="btn-ghost" disabled={ocupado} onClick={() => agir(async () => { await pedido("/api/chatgpt", "DELETE", {}); setConexao(await pedido<Conexao>("/api/chatgpt")); })}>Desconectar o ChatGPT</button>
              </div>
            </>
          ) : conexao?.login ? (
            <div className="flex flex-col gap-3">
              <p>Abra a página oficial do ChatGPT e informe este código:</p>
              <div className="flex items-center gap-3 flex-wrap">
                <strong className="text-2xl tracking-widest font-mono" data-codigo>{conexao.login.userCode}</strong>
                <CopyButton texto={() => conexao.login!.userCode} rotulo="Copiar o código" />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <a className="btn-primary !w-auto" href={conexao.login.verificationUrl} target="_blank" rel="noreferrer">Entrar no ChatGPT</a>
                <button type="button" className="btn-link text-[13.5px]" disabled={ocupado} onClick={() => agir(async () => { await pedido("/api/chatgpt", "DELETE", { cancel: true }); setConexao(await pedido<Conexao>("/api/chatgpt")); })}>Cancelar a conexão</button>
              </div>
              <p className="text-muted text-sm" role="status">Aguardando a sua autorização...</p>
            </div>
          ) : conexao ? (
            <div>
              <button type="button" className="btn-primary !w-auto" disabled={ocupado} onClick={() => agir(async () => { const login = await pedido<Conexao["login"]>("/api/chatgpt", "POST"); setConexao((c) => (c ? { ...c, login, error: null } : c)); })}>
                {ocupado ? "Preparando a conexão..." : "Conectar com o ChatGPT"}
              </button>
            </div>
          ) : null}
          <p className="text-muted text-[12.5px]">Se pedido, habilite o login por código de dispositivo nas configurações de segurança do ChatGPT. A conta conectada atende aos sites desta instalação.</p>
          {visao === false && (
            <Aviso>Para ler capturas de referência, conecte também o OpenRouter no cartão &ldquo;Inteligência artificial&rdquo;, acima: o ChatGPT cuida dos textos, das edições e do agente; a leitura da imagem passa pelo OpenRouter.</Aviso>
          )}
        </div>
      )}
      {preferencia?.provedor === "openrouter" && <p className="text-muted text-[13px]">Conecte a chave no cartão &ldquo;Inteligência artificial&rdquo;, acima.</p>}
    </section>
  );
}

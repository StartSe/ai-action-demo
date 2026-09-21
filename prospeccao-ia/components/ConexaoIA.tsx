"use client";
// Escolha da conta de IA em /setup: OpenRouter (chave ou conexão em um clique, o cartão compartilhado da
// suíte, passado em `children`) ou uma assinatura ChatGPT (login por código de dispositivo no Codex App
// Server oficial, lib/chatgpt.ts). A escolha fica em AI_PROVIDER (app/api/ia/route.ts) e governa lib/ai.ts
// inteiro: qualificação, hipótese de dor, estratégia, mensagens e a leitura de produto. Uma conta nunca
// substitui a outra em caso de erro; a pessoa decide qual usa.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CopyButton } from "./ui";

type Provedor = "openrouter" | "chatgpt";
type Preferencia = { provedor: Provedor; modelo: string; provedorFixo: boolean; modeloFixo: boolean };
type Conexao = {
  account: { email?: string; planType?: string } | null;
  login: { verificationUrl: string; userCode: string } | null;
  error: string | null;
  models: { id: string; name: string }[];
};

const PROVEDORES: { id: Provedor; rotulo: string; descricao: string }[] = [
  { id: "openrouter", rotulo: "OpenRouter", descricao: "Chave ou conexão em um clique; modelos gratuitos e pagos" },
  { id: "chatgpt", rotulo: "ChatGPT", descricao: "Sua assinatura, com login por código" },
];

async function pedido<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Não foi possível atualizar a conexão.");
  return d as T;
}

export function ConexaoIA({ children, aoMudar }: { children: ReactNode; aoMudar: () => void }) {
  const [preferencia, setPreferencia] = useState<Preferencia | null>(null);
  const [conexao, setConexao] = useState<Conexao | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0);
  // Quem embrulha passa uma função nova a cada render; a ref evita reiniciar o acompanhamento abaixo.
  const aoMudarRef = useRef(aoMudar);
  useEffect(() => { aoMudarRef.current = aoMudar; }, [aoMudar]);

  useEffect(() => {
    let ativo = true;
    pedido<Preferencia>("/api/ia").then((d) => { if (ativo) setPreferencia(d); }).catch((e) => { if (ativo) setErro((e as Error).message); });
    return () => { ativo = false; };
  }, [tentativa]);

  // Com ChatGPT escolhido, acompanha a conexão a cada 2,5 s: é assim que a tela percebe a autorização
  // concluída na página da OpenAI (outra aba) sem a pessoa precisar recarregar.
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
        if (conectada !== undefined && conectada !== Boolean(d.account)) aoMudarRef.current();
        conectada = Boolean(d.account);
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
    try { await fn(); aoMudarRef.current(); }
    catch (e) { setErro((e as Error).message); }
    finally { setOcupado(false); }
  }
  function escolher(provedor: Provedor, modelo?: string) {
    return agir(async () => setPreferencia(await pedido<Preferencia>("/api/ia", "PUT", { provedor, ...(modelo === undefined ? {} : { modelo }) })));
  }

  const fixo = preferencia?.provedorFixo ?? false;
  const atual = preferencia?.provedor;
  const conta = conexao?.account ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">Conta de IA</span>
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-2" role="radiogroup" aria-label="Conta de IA">
          {PROVEDORES.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={atual === p.id}
              disabled={ocupado || !preferencia || fixo}
              className={`text-left px-4 py-3 rounded-field border transition-colors cursor-pointer disabled:cursor-default ${atual === p.id ? "border-accent bg-accent-soft" : "border-line bg-white hover:bg-bg"}`}
              onClick={() => { if (atual !== p.id) void escolher(p.id); }}
            >
              <span className="block font-semibold text-sm">{p.rotulo}</span>
              <span className="block text-[12.5px] text-muted">{p.descricao}</span>
            </button>
          ))}
        </div>
        {fixo && <span className="text-[12.5px] text-muted">A escolha da conta foi definida pela equipe técnica no ambiente do servidor.</span>}
      </div>

      {erro && (
        <div role="alert" className="text-sm text-danger">
          {erro}{" "}
          <button type="button" className="btn-link text-[13px]" onClick={() => { setErro(""); setTentativa((t) => t + 1); }}>Tentar novamente</button>
        </div>
      )}

      {atual === "openrouter" && children}

      {atual === "chatgpt" && preferencia && (
        <div className="flex flex-col gap-3 text-sm">
          {!conexao && !erro && <p role="status" className="text-muted">Verificando a conexão com o ChatGPT…</p>}
          {conexao?.error && <p role="alert" className="text-danger">{conexao.error}</p>}
          {conta ? (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="chip-positivo">Conectado{conta.email ? ` · ${conta.email}` : ""}{conta.planType ? ` · ${conta.planType}` : ""}</span>
                <button type="button" className="btn-ghost !w-auto" disabled={ocupado} onClick={() => agir(async () => { await pedido("/api/chatgpt", "DELETE", {}); setConexao(await pedido<Conexao>("/api/chatgpt")); })}>
                  {ocupado ? "Aguarde…" : "Desconectar"}
                </button>
              </div>
              <div className="flex flex-col gap-1.5 max-w-[440px]">
                <label htmlFor="modelo-chatgpt" className="text-[13px] font-semibold">Modelo</label>
                <select id="modelo-chatgpt" className="input" value={preferencia.modelo} disabled={ocupado || preferencia.modeloFixo} onChange={(e) => void escolher("chatgpt", e.target.value)}>
                  <option value="">Automático (a conta escolhe)</option>
                  {preferencia.modelo && !(conexao?.models ?? []).some((m) => m.id === preferencia.modelo) && <option value={preferencia.modelo}>{preferencia.modelo} · indisponível nesta conta</option>}
                  {(conexao?.models ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <span className="text-[12.5px] text-muted">Os modelos listados são os da sua assinatura; o uso segue os limites do seu plano.</span>
              </div>
            </>
          ) : conexao?.login ? (
            <div className="card shadow-none bg-bg p-4 flex flex-col gap-3">
              <p className="font-semibold">Abra a página da OpenAI e informe este código:</p>
              <strong className="block text-[28px] leading-none tracking-[0.18em] font-extrabold">{conexao.login.userCode}</strong>
              <div className="flex items-center gap-3 flex-wrap">
                <a className="btn-primary !w-auto" href={conexao.login.verificationUrl} target="_blank" rel="noreferrer">Entrar no ChatGPT</a>
                <CopyButton texto={() => conexao.login?.userCode ?? ""} rotulo="Copiar código" />
                <button type="button" className="btn-link text-[13px]" disabled={ocupado} onClick={() => agir(async () => { await pedido("/api/chatgpt", "DELETE", { cancel: true }); setConexao(await pedido<Conexao>("/api/chatgpt")); })}>Cancelar</button>
              </div>
              <p role="status" className="text-[13px] text-muted">Aguardando sua autorização. Esta página atualiza sozinha quando a conta entrar.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 items-start">
              <button type="button" className="btn-primary !w-auto max-md:!w-full" disabled={ocupado || !conexao} onClick={() => agir(async () => { const login = await pedido<Conexao["login"]>("/api/chatgpt", "POST"); setConexao((c) => (c ? { ...c, login, error: null } : c)); })}>
                {ocupado ? "Preparando conexão…" : "Conectar com ChatGPT"}
              </button>
              <p className="text-[12.5px] text-muted">Você autoriza na própria OpenAI, por um código de dispositivo. Nenhuma chave é copiada e a sessão fica só neste servidor.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

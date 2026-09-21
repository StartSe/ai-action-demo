"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { StatusConexoes } from "@/lib/types";
import { ChatGPTUsage } from "./ChatGPTUsage";
import { Icon, Logo, ErrorBox, request, fmtMs, fmtUsd, fmtPct } from "./ui";
type TesteJev = { ok: boolean; latenciaMs: number; caminho: string; modelo: string; tokens: number; custoUsd: number; respostas: Record<string, { tipo: string; escolha?: string; pontuacao?: number; sim?: number; confianca: number | null }>; bruto: unknown };
export function Configuracoes() {
  const params = useSearchParams();
  const [status, setStatus] = useState<StatusConexoes | null>(null);
  const [erro, setErro] = useState(params.get("erro") || "");
  const [sucesso, setSucesso] = useState(params.get("conectado") === "openrouter" ? "OpenRouter conectado. O Jev já pode decidir; teste abaixo." : "");
  const [busy, setBusy] = useState("");
  const [chave, setChave] = useState("");
  const [provider, setProvider] = useState<"chatgpt" | "openrouter">("chatgpt");
  const [model, setModel] = useState("");
  const [modelForte, setModelForte] = useState("");
  const [teste, setTeste] = useState<TesteJev | null>(null);
  const carregar = useCallback(async (prov?: string) => {
    const s = await request<StatusConexoes>("/api/conexoes" + (prov ? `?provider=${prov}` : ""));
    setStatus(s);
    if (!prov) {
      setProvider(s.provider);
      setModel(s.model);
      setModelForte(s.modelForte);
    }
    return s;
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void carregar().catch((e) => setErro(e.message)), 0);
    return () => clearTimeout(t);
  }, [carregar]);
  useEffect(() => {
    if (!status?.chatgpt.login) return;
    const t = setInterval(() => void carregar(provider).catch(() => {}), 2500);
    return () => clearInterval(t);
  }, [status?.chatgpt.login, carregar, provider]);
  async function agir(nome: string, fn: () => Promise<void>) {
    setBusy(nome);
    setErro("");
    setSucesso("");
    try {
      await fn();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const s = status;
  return (
    <div className="pagina">
      <header className="topbar">
        <Link href="/" aria-label="Início"><Logo compact /></Link>
        <div className="grow"><span className="titulo">· Configurações</span></div>
        <Link className="secondary" href="/"><Icon name="arrow" size={16} /><span className="rotulo">Voltar à análise</span></Link>
      </header>
      <main className="pagina-conteudo">
        <h1>Conexões</h1>
        <p>O harness precisa das duas: o ChatGPT (ou um modelo do OpenRouter) para pensar e escrever, e o OpenRouter para o Jev decidir e verificar.</p>
        <ErrorBox error={erro} />
        {sucesso && <p className="success" role="status">{sucesso}</p>}
        {s && (
          <div className="chip" style={{ marginBottom: 6 }}>
            <Icon name={s.harnessPronto ? "check" : "info"} size={12} /> {s.harnessPronto ? "Harness ligado: conversa e decisões prontas" : !s.openrouter.conectado ? "Falta o OpenRouter (Jev)" : "Falta o modelo da conversa"}
          </div>
        )}
        <div className="secao-titulo"><Icon name="spark" size={18} /><div><h2>Modelos de IA</h2><p>Conecte as contas. O modelo da conversa é escolhido mais abaixo.</p></div></div>
        <div className="cartoes">
          <section className={"cartao" + (s?.chatgpt.conectado ? " conectado" : "")}>
            <header>
              <h3><Icon name="spark" size={18} /> ChatGPT</h3>
              {s?.chatgpt.conectado && <span className="chip ok"><Icon name="check" size={12} /> conectado</span>}
            </header>
            <p>Sua assinatura, pelo Codex App Server oficial, com login por código de dispositivo. É a IA que raciocina, escreve e, nas próximas versões, executa código e busca na web.</p>
            {s?.chatgpt.conectado ? (
              <>
                <p><strong style={{ color: "var(--ink)" }}>{s.chatgpt.email || "Conta conectada"}</strong>{s.chatgpt.plano ? ` · plano ${s.chatgpt.plano}` : ""}</p>
                <ChatGPTUsage />
                <div className="acoes">
                  <button className="secondary" disabled={!!busy} onClick={() => void agir("chatgpt", async () => { await request("/api/chatgpt", "DELETE", {}); await carregar(provider); })}>Desconectar</button>
                </div>
              </>
            ) : s?.chatgpt.login ? (
              <div className="device-login">
                <p>Abra o link e confirme este código:</p>
                <code>{s.chatgpt.login.userCode}</code>
                <a className="primary" href={s.chatgpt.login.verificationUrl} target="_blank" rel="noreferrer">Entrar no ChatGPT</a>
                <small>Aguardando confirmação… Se solicitado, habilite login por código de dispositivo nas configurações de segurança do ChatGPT.</small>
                <button className="text-button" onClick={() => void agir("chatgpt", async () => { await request("/api/chatgpt", "DELETE", { cancel: true }); await carregar(provider); })}>Cancelar</button>
              </div>
            ) : (
              <div className="acoes">
                <button className="primary" disabled={!!busy || !s} onClick={() => void agir("chatgpt", async () => { await request("/api/chatgpt", "POST", {}); await carregar(provider); })}>
                  {busy === "chatgpt" ? "Gerando código…" : "Conectar ChatGPT"}
                </button>
                {s?.chatgpt.erro && <small className="muted">{s.chatgpt.erro}</small>}
              </div>
            )}
          </section>
          <section className={"cartao" + (s?.openrouter.conectado ? " conectado" : "")}>
            <header>
              <h3><Icon name="link" size={18} /> OpenRouter</h3>
              {s?.openrouter.conectado && <span className="chip ok"><Icon name="check" size={12} /> conectado{s.openrouter.origem === "env" ? " · ambiente" : ""}</span>}
            </header>
            <p>Obrigatório: é onde vive o Jev. Também dá acesso a centenas de modelos de conversa. O consumo é cobrado na sua conta do OpenRouter.</p>
            {s?.openrouter.conectado ? (
              <>
                <p><strong style={{ color: "var(--ink)" }}>Chave {s.openrouter.mascarado}</strong></p>
                <div className="acoes">
                  {s.openrouter.origem !== "env" && (
                    <button className="secondary" disabled={!!busy} onClick={() => void agir("openrouter", async () => { await request("/api/conexoes/openrouter", "DELETE"); setTeste(null); await carregar(provider); })}>Desconectar</button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="acoes">
                  <a className="primary" href="/api/conexoes/openrouter"><Icon name="link" size={16} /> Conectar com OpenRouter</a>
                  <small className="muted">Autoriza em um clique e volta para aqui.</small>
                </div>
                <label>
                  Ou cole uma chave
                  <input type="password" value={chave} onChange={(e) => setChave(e.target.value)} autoComplete="off" placeholder="sk-or-…" />
                </label>
                <div className="acoes">
                  <button className="secondary" disabled={!!busy || !chave.trim()} onClick={() => void agir("chave", async () => { await request("/api/conexoes", "PUT", { key: chave.trim() }); setChave(""); setSucesso("Chave do OpenRouter salva."); await carregar(provider); })}>Salvar chave</button>
                  <a className="text-link" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">Obter uma chave</a>
                </div>
              </>
            )}
            <div className="subcartao">
              <h4><Icon name="harness" size={16} /> Decisões rápidas (Jev)</h4>
              <p>Modelo {s?.jev.modelo || "typesafe/jev-1.13"} pelo OpenRouter, em beta. O teste faz uma chamada real e pequena: confirma endereço, chave e formato.</p>
              <div className="acoes">
                <button className="secondary" disabled={!!busy || !s?.openrouter.conectado} onClick={() => void agir("jev", async () => { setTeste(await request<TesteJev>("/api/conexoes/jev/testar", "POST", {})); await carregar(provider); })}>
                  {busy === "jev" ? <><span className="spinner" /> Decidindo…</> : "Testar decisão"}
                </button>
                {s?.jev.ultimoTeste && !teste && <small className="muted">Último teste em {new Date(s.jev.ultimoTeste.quando).toLocaleString("pt-BR")}: {fmtMs(s.jev.ultimoTeste.latenciaMs)}.</small>}
              </div>
              {teste && (
                <div className="teste-jev reveal">
                  <div className="stat"><small>Tempo</small><strong>{fmtMs(teste.latenciaMs)}</strong></div>
                  <div className="stat"><small>Custo</small><strong>{fmtUsd(teste.custoUsd)} · {teste.tokens} tokens</strong></div>
                  <div className="stat" style={{ gridColumn: "1 / -1" }}><small>Endereço que respondeu</small><strong style={{ fontSize: 12 }}>{teste.caminho} · {teste.modelo}</strong></div>
                  <table>
                    <thead><tr><th>Pergunta</th><th>Tipo</th><th>Resposta</th><th>Confiança</th></tr></thead>
                    <tbody>
                      {Object.entries(teste.respostas).map(([k, r]) => (
                        <tr key={k}><td>{k}</td><td>{r.tipo}</td><td>{r.escolha ?? (r.pontuacao !== undefined ? r.pontuacao.toFixed(2) : r.sim !== undefined ? `${fmtPct(r.sim)} sim` : "sem resposta")}</td><td>{r.confianca !== null ? fmtPct(r.confianca) : "—"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <details style={{ gridColumn: "1 / -1" }}>
                    <summary>Ver resposta completa do OpenRouter</summary>
                    <pre>{JSON.stringify(teste.bruto, null, 2)}</pre>
                  </details>
                </div>
              )}
            </div>
          </section>
        </div>
        <div className="secao-titulo"><Icon name="chat" size={18} /><div><h2>Modelo da conversa</h2><p>Quem escreve as respostas. O Jev não entra aqui: ele só decide.</p></div></div>
        <section className="cartao largo">
          <div className="provider-tabs">
            {(["chatgpt", "openrouter"] as const).map((p) => (
              <button key={p} className={provider === p ? "selected" : ""} disabled={!!busy} onClick={() => { setProvider(p); setModel(""); setModelForte(""); void carregar(p).catch((e) => setErro(e.message)); }}>
                <Icon name={p === "chatgpt" ? "spark" : "link"} />
                {p === "chatgpt" ? "ChatGPT" : "OpenRouter"}
                <small>{p === "chatgpt" ? "Sua assinatura" : "Um modelo do catálogo"}</small>
              </button>
            ))}
          </div>
          <div className="form-row">
            <label>
              Modelo padrão
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="">Automático</option>
                {model && !s?.modelos.some((m) => m.id === model) && <option value={model}>{model}</option>}
                {s?.modelos.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <small>Responde a maioria das perguntas.</small>
            </label>
            <label>
              Modelo para análises complexas <span className="muted">(opcional)</span>
              <select value={modelForte} onChange={(e) => setModelForte(e.target.value)}>
                <option value="">Usar o modelo padrão</option>
                {modelForte && !s?.modelos.some((m) => m.id === modelForte) && <option value={modelForte}>{modelForte}</option>}
                {s?.modelos.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <small>Entra quando a triagem do Jev marca a pergunta como complexa.</small>
            </label>
          </div>
          {s?.erro && <p className="muted">{s.erro}</p>}
          {provider === "chatgpt" && s && !s.chatgpt.conectado && <p className="muted">Conecte o ChatGPT acima para listar os modelos.</p>}
          {provider === "openrouter" && s && !s.openrouter.conectado && <p className="muted">Conecte o OpenRouter acima para listar os modelos.</p>}
          <div className="acoes">
            <button className="primary" disabled={!!busy || !s} onClick={() => void agir("salvar", async () => { await request("/api/conexoes", "PUT", { provider, model, modelForte }); setSucesso("Modelo da conversa salvo."); await carregar(provider); })}>
              {busy === "salvar" ? "Salvando…" : "Salvar modelo da conversa"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

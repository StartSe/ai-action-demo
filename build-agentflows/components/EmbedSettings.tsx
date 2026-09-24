"use client";
import { useEffect, useState } from "react";
import type { EmbedSettings as Settings } from "@/lib/embed-protocol";
import { request } from "./StudioUI";
export function EmbedSettings({ flowId, published, origin }: { flowId: string; published: boolean; origin: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sites, setSites] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [rotate, setRotate] = useState(false);
  useEffect(() => { let alive = true; request<{ settings: Settings; hasKey: boolean }>(`/api/flows/${flowId}/embed`).then(r => { if (alive) { setSettings(r.settings); setSites(r.settings.origins.join("\n")); setHasKey(r.hasKey); } }).catch(e => { if (alive) setError(e.message); }); return () => { alive = false; }; }, [flowId]);
  async function act(fn: () => Promise<void>) { setBusy(true); setError(""); setNotice(""); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); } finally { setBusy(false); } }
  async function copy(text: string) { await act(async () => { await navigator.clipboard.writeText(text); setNotice("Copiado."); }); }
  const snippet = `<script src="${origin}/embed.js"></script>\n<script>\n  Agentflows.mount({\n    url: ${JSON.stringify(origin)},\n    flowId: ${JSON.stringify(flowId)},\n    getToken: async () => {\n      const response = await fetch('/api/chat-access', { method: 'POST' });\n      if (!response.ok) throw new Error('Entre na aplicação para conversar.');\n      return response.json();\n    }\n  });\n</script>`;
  return <section className="integration-section">
    <h3>Uma conversa dentro do seu site</h3><p>As pessoas podem pedir melhorias, compartilhar imagens e acompanhar o trabalho sem sair da aplicação. A conversa continua quando a página é recarregada.</p>
    {error && <p className="studio-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!published && <p className="generator-warning">Publique este fluxo antes de ativar o chat no site.</p>}
    {settings && <><div className="node-fields">
      <label>Título do chat<input value={settings.title} maxLength={80} onChange={e => setSettings({...settings,title:e.target.value})}/></label>
      <label>Mensagem de boas-vindas<textarea value={settings.welcome} maxLength={500} onChange={e => setSettings({...settings,welcome:e.target.value})}/></label>
      <label>Endereços dos sites<textarea value={sites} onChange={e => setSites(e.target.value)} placeholder="https://minha-aplicacao.com"/><small>Um endereço por linha, sem caminho após o domínio.</small></label>
      <label style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" style={{width:"auto"}} checked={settings.enabled} disabled={!published} onChange={e => setSettings({...settings,enabled:e.target.checked})}/> Ativar chat nestes sites</label>
    </div><div className="studio-actions"><button className="studio-button primary" disabled={busy} onClick={() => void act(async () => { const result = await request<Settings>(`/api/flows/${flowId}/embed`, "PUT", {...settings, origins:sites.split(/\n/).map(s => s.trim()).filter(Boolean)}); setSettings(result); setNotice("Configuração salva."); })}>Salvar chat</button><a className="studio-button" href={`/embed-preview/${flowId}`} target="_blank" rel="noreferrer">Testar em uma página</a></div>
    <details className="integration-section"><summary style={{cursor:"pointer",fontWeight:600}}>Instalação e opções para desenvolvedores</summary><p>Instale o script uma vez no layout principal. O servidor da aplicação identifica o usuário e fornece um acesso temporário ao chat.</p>
      <p><a href="/embed-integration.md" target="_blank" rel="noreferrer">Guia de instalação e ações da página ↗</a></p>
      <pre className="integration-code" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{snippet}</pre><button className="studio-button" onClick={() => void copy(snippet)}>Copiar instalação</button>
      <h4>Chave do servidor</h4><p>Use somente no backend da aplicação. Nunca inclua esta chave no script do site. Trocar a chave invalida os acessos anteriores.</p>
      {key && <div className="generated-code"><code style={{overflowWrap:"anywhere"}}>{key}</code><button className="studio-button" onClick={() => void copy(key)}>Copiar chave</button></div>}
      {rotate ? <div className="connection-hint"><p>As conversas precisarão reconectar com a nova chave. Deseja continuar?</p><button className="studio-button danger" disabled={busy} onClick={() => void act(async () => { const r = await request<{key:string}>(`/api/flows/${flowId}/embed`, "POST", {}); setKey(r.key); setHasKey(true); setRotate(false); })}>Trocar chave</button><button className="studio-button" onClick={() => setRotate(false)}>Voltar</button></div> : <button className="studio-button" disabled={busy} onClick={() => hasKey ? setRotate(true) : void act(async () => { const r = await request<{key:string}>(`/api/flows/${flowId}/embed`, "POST", {}); setKey(r.key); setHasKey(true); })}>{hasKey ? "Trocar chave do servidor" : "Gerar chave do servidor"}</button>}
      <h4>Limites por tarefa</h4><div className="node-fields"><label>Tempo de trabalho (minutos)<input type="number" min={1} max={60} value={settings.maxMinutes} onChange={e => setSettings({...settings,maxMinutes:Number(e.target.value)})}/></label><label>Ações na página<input type="number" min={1} max={30} value={settings.maxCommands} onChange={e => setSettings({...settings,maxCommands:Number(e.target.value)})}/></label></div><small>Salve o chat para aplicar. Esperas em blocos de aprovação não consomem tempo de trabalho. Retomadas após interrupção são limitadas a duas por tarefa.</small>
    </details></>}
  </section>;
}

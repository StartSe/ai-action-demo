"use client";
import { useEffect, useState } from "react";
import type { EmbedSettings as Settings } from "@/lib/embed-protocol";
import { AllowedOrigins } from "./AllowedOrigins";
import { EmbedInstallation } from "./EmbedInstallation";
import { FeedbackToast } from "./FeedbackToast";
import { request } from "./StudioUI";
export function EmbedSettings({ flowId, published, origin }: { flowId: string; published: boolean; origin: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sites, setSites] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { let alive = true; request<{ settings: Settings }>(`/api/flows/${flowId}/embed`).then(r => { if (alive) { setSettings(r.settings); setSites(r.settings.origins); } }).catch(e => { if (alive) setError(e.message); }); return () => { alive = false; }; }, [flowId]);
  async function act(fn: () => Promise<void>) { setBusy(true); setError(""); setNotice(""); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); } finally { setBusy(false); } }

  return <section className="integration-section embed-settings">
    <h3>Uma conversa dentro do seu site</h3><p>As pessoas podem pedir melhorias, compartilhar imagens e acompanhar o trabalho sem sair da aplicação. A conversa continua quando a página é recarregada.</p>
    {error && <p className="studio-error" role="alert">{error}</p>}{notice && <FeedbackToast message={notice} onDismiss={() => setNotice("")}/>}
    {!published && <p className="generator-warning">Salve o fluxo no editor antes de ativar o chat no site.</p>}
    {settings && <><div className="node-fields">
      <label>Título do chat<input value={settings.title} maxLength={80} onChange={e => setSettings({...settings,title:e.target.value})}/></label>
      <label>Mensagem de boas-vindas<textarea value={settings.welcome} maxLength={500} onChange={e => setSettings({...settings,welcome:e.target.value})}/></label>
      <label>Visualização da conversa<select value={settings.displayMode || "detailed"} onChange={e => setSettings({...settings,displayMode:e.target.value as "detailed" | "simple"})}>
        <option value="detailed">Detalhada · progresso e atividades</option>
        <option value="simple">Simplificada · resposta final</option>
      </select><small>Pedidos de aprovação e erros aparecem nos dois modos.</small></label>
      <AllowedOrigins origins={sites} onChange={setSites} disabled={busy}
        description="Escolha em quais sites este chat pode ser aberto. As permissões globais de Segurança também se aplicam."
        emptyText="Nenhum domínio adicionado. Localhost e 127.0.0.1 são aceitos por padrão, em qualquer porta." />

    </div><div className="studio-actions"><button className="studio-button primary" disabled={busy || !published} onClick={() => void act(async () => { const result = await request<Settings>(`/api/flows/${flowId}/embed`, "PUT", {...settings, enabled:true, origins:sites.map(s => s.trim())}); setSettings(result); setSites(result.origins); setNotice("Configurações do chat salvas."); })}>Salvar chat</button><a className="studio-button" href={`/embed-preview/${flowId}`} target="_blank" rel="noopener noreferrer" title="Abrir preview em uma nova aba">Testar em uma página</a></div>
    <details className="integration-section"><summary style={{cursor:"pointer",fontWeight:600}}>Instalação e opções para desenvolvedores</summary><p>Instale o script uma vez no layout principal. O servidor da aplicação identifica o usuário e fornece um acesso temporário ao chat.</p>
      <EmbedInstallation origin={origin} flowId={flowId} onCopy={() => setNotice("")}/>
      <h4>Limites por tarefa</h4><div className="node-fields"><label>Tempo de trabalho (minutos)<input type="number" min={1} max={60} value={settings.maxMinutes} onChange={e => setSettings({...settings,maxMinutes:Number(e.target.value)})}/></label><label>Ações na página<input type="number" min={1} max={30} value={settings.maxCommands} onChange={e => setSettings({...settings,maxCommands:Number(e.target.value)})}/></label></div><small>Salve o chat para aplicar. Esperas em blocos de aprovação não consomem tempo de trabalho. Retomadas após interrupção são limitadas a duas por tarefa.</small>
    </details></>}
  </section>;
}

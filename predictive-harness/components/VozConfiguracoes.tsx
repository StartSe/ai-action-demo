"use client";
import { useEffect, useState } from "react";
import { ErrorBox, Icon, request } from "./ui";
import { useAudio, type StatusVoz } from "./useVoz";
export function VozConfiguracoes() {
  const [status, setStatus] = useState<StatusVoz | null>(null);
  const [chave, setChave] = useState("");
  const [voz, setVoz] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const audio = useAudio();
  async function carregar() {
    const s = await request<StatusVoz>("/api/voz"); setStatus(s); setVoz(s.vozId);
    if (s.conectado) setStatus(await request<StatusVoz>("/api/voz?vozes=1"));
  }
  useEffect(() => { const t = setTimeout(() => void carregar().catch(e => setErro(e.message)), 0); return () => clearTimeout(t); }, []);
  async function salvar(dados: Record<string, unknown>) {
    setBusy(true); setErro(""); setSucesso(""); audio.parar();
    try { await request("/api/voz", "PUT", dados); setChave(""); await carregar(); setSucesso(dados.desconectar ? "ElevenLabs desconectada." : dados.chave ? "Credencial conectada. Escolha e salve a voz padrão." : "Voz padrão salva."); }
    catch(e) { setErro((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="cartao largo" id="voz"><header><h3><Icon name="mic" size={18} /> Conversa por voz · ElevenLabs</h3><span className={"chip " + (status?.conectado ? "ok" : "neutral")}>{status?.conectado ? "Conectada" : "Opcional"}</span></header>
    <p>Converse com o Jev enquanto os gráficos e cenários se atualizam na tela. Português do Brasil; consumo na sua conta ElevenLabs.</p>
    <ErrorBox error={erro} />{sucesso && <p className="success" role="status">{sucesso}</p>}
    {!status?.conectado ? <><label>Credencial da ElevenLabs<input type="password" value={chave} autoComplete="off" placeholder="Cole sua chave de API" onChange={e => setChave(e.target.value)} /></label><div className="acoes"><button className="primary" disabled={busy || !chave.trim()} onClick={() => void salvar({ chave })}>{busy ? "Conectando…" : "Conectar ElevenLabs"}</button><a className="text-link" href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noreferrer">Obter credencial</a></div><small className="muted">Permissões necessárias: leitura de vozes, Text to Speech e ElevenLabs Agents (leitura/escrita de agentes e ferramentas, e acesso a conversas). A chave fica cifrada no servidor.</small></> : <>
      <p>Credencial {status.mascarado}{status.origem === "env" ? " · definida no ambiente" : ""}</p>
      <label>Voz padrão em português (pt-BR)<select value={voz} disabled={busy} onChange={e => { audio.parar(); setVoz(e.target.value); }}><option value="">Selecione uma voz</option>{status.vozId && !status.vozes?.some(v => v.id === status.vozId) && <option value={status.vozId}>{status.vozNome} · salva</option>}{status.vozes?.map(v => <option key={v.id} value={v.id}>{v.nome}{v.brasileira ? " · Brasil" : " · português"}</option>)}</select></label>
      <small className="muted">Vozes com sotaque brasileiro aparecem primeiro. Ouça a prévia para escolher. Se a lista estiver vazia, adicione uma voz em português na sua conta ElevenLabs.</small>
      <div className="acoes"><button className="primary" disabled={busy || !voz} onClick={() => void salvar({ vozId: voz })}>Salvar voz padrão</button><button className="secondary" disabled={busy || !voz} onClick={() => { if (audio.tocando) audio.parar(); else void audio.ouvir("previa", { previa: true, vozId: voz }).catch(e => setErro(e.message)); }}><Icon name={audio.tocando ? "stop" : "volume"} size={16} />{audio.tocando ? audio.preparando ? "Cancelar prévia" : "Parar prévia" : "Ouvir prévia"}</button><button className="text-button" disabled={busy} onClick={() => void carregar().catch(e => setErro(e.message))}>Atualizar vozes</button>{status.origem !== "env" && <button className="text-button danger-text" disabled={busy} onClick={() => void salvar({ desconectar: true })}>Desconectar</button>}</div>
    </>}
    <p>Ao iniciar, o app prepara um agente privado na sua conta ElevenLabs. O agente recebe áudio, contexto e resultados calculados; as análises ficam no histórico. A gravação de voz do agente é desativada. A sessão é cobrada na sua conta ElevenLabs, além das análises nos provedores já conectados. Encerre para desligar o microfone.</p>
  </section>;
}

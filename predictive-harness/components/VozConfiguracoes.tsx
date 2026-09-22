"use client";
import { useEffect, useState } from "react";
import { ErrorBox, Icon, request } from "./ui";
import { useAudio, type StatusVoz } from "./useVoz";
export function VozConfiguracoes() {
  const [status, setStatus] = useState<StatusVoz | null>(null);
  const [chave, setChave] = useState("");
  const [voz, setVoz] = useState("");
  const [busy, setBusy] = useState(false);
  const [trocando, setTrocando] = useState(false);
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
    try {
      const s = await request<StatusVoz>("/api/voz", "PUT", dados);
      setStatus(s); setChave(""); setTrocando(false); await carregar();
      setSucesso(dados.desconectar ? "ElevenLabs desconectada." : dados.chave ? "Credencial salva e acesso às vozes validado. Escolha e salve a voz para verificar a conversa." : s.conversa?.estado === "pronta" ? "Voz salva. Agente preparado e acesso à sessão verificado." : "Voz salva. A conversa ainda precisa do ajuste indicado nesta seção.");
    } catch(e) { setErro((e as Error).message); }
    finally { setBusy(false); }
  }
  async function verificar() {
    setBusy(true); setErro(""); setSucesso(""); audio.parar();
    try {
      const s = await request<StatusVoz>("/api/voz", "POST", { verificar: true });
      setStatus(s);
      if (s.conversa?.estado === "pronta") setSucesso("Agente preparado e acesso à sessão verificado. Você já pode iniciar a conversa. O teste não abriu o microfone nem gerou áudio.");
    } catch(e) { setErro((e as Error).message); }
    finally { setBusy(false); }
  }
  const pronta = status?.conversa?.estado === "pronta";
  const falhou = status?.conversa?.estado === "erro";
  const rotulo = !status?.conectado ? "Opcional" : pronta ? "Acesso à conversa verificado" : falhou ? "Conversa indisponível" : "Conversa não verificada";
  return <section className="cartao largo" id="voz"><header><h3><Icon name="mic" size={18} /> Conversa por voz · ElevenLabs</h3><span className={"chip " + (pronta ? "ok" : falhou ? "warn" : "neutral")}>{rotulo}</span></header>
    <p>Converse com o Jev enquanto os gráficos e cenários se atualizam na tela. Português do Brasil; consumo na sua conta ElevenLabs.</p>
    <ErrorBox error={erro || status?.conversa?.mensagem || ""} />{sucesso && <p className={falhou ? "muted small" : "success"} role="status">{sucesso}</p>}
    {(!status?.conectado || trocando) && <><label>Credencial da ElevenLabs<input type="password" value={chave} autoComplete="off" placeholder="Cole sua chave de API" onChange={e => setChave(e.target.value)} /></label><div className="acoes"><button className="primary" disabled={busy || !chave.trim()} onClick={() => void salvar({ chave })}>{busy ? "Validando…" : trocando ? "Salvar credencial" : "Conectar ElevenLabs"}</button>{trocando && <button className="secondary" disabled={busy} onClick={() => { setTrocando(false); setChave(""); }}>Cancelar</button>}</div></>}
    {status?.conectado && !trocando && <>
      <p>Credencial salva {status.mascarado}{status.origem === "env" ? " · definida no ambiente" : ""}</p>
      <label>Voz padrão em português (pt-BR)<select value={voz} disabled={busy} onChange={e => { audio.parar(); setVoz(e.target.value); }}><option value="">Selecione uma voz</option>{status.vozId && !status.vozes?.some(v => v.id === status.vozId) && <option value={status.vozId}>{status.vozNome} · salva</option>}{status.vozes?.map(v => <option key={v.id} value={v.id}>{v.nome}{v.brasileira ? " · Brasil" : " · português"}</option>)}</select></label>
      <small className="muted">Vozes com sotaque brasileiro aparecem primeiro. Ouça a prévia para escolher. Se a lista estiver vazia, adicione uma voz em português na sua conta ElevenLabs.</small>
      <div className="acoes"><button className="primary" disabled={busy || !voz} onClick={() => void salvar({ vozId: voz })}>{busy ? "Verificando…" : "Salvar voz padrão"}</button><button className="secondary" disabled={busy || !voz} onClick={() => { if (audio.tocando) audio.parar(); else void audio.ouvir("previa", { previa: true, vozId: voz }).catch(e => setErro(e.message)); }}><Icon name={audio.tocando ? "stop" : "volume"} size={16} />{audio.tocando ? audio.preparando ? "Cancelar prévia" : "Parar prévia" : "Ouvir prévia"}</button><button className="text-button" disabled={busy} onClick={() => void carregar().catch(e => setErro(e.message))}>Atualizar vozes</button></div>
      <div className="acoes"><button className="secondary" disabled={busy || !status.vozId || voz !== status.vozId} onClick={() => void verificar()}>Verificar conversa por voz</button>{status.origem !== "env" && <><button className="text-button" disabled={busy} onClick={() => { setTrocando(true); setErro(""); setSucesso(""); }}>Trocar credencial</button><button className="text-button danger-text" disabled={busy} onClick={() => void salvar({ desconectar: true })}>Desconectar</button></>}</div>
      <small className="muted">Listar vozes e ouvir a prévia não verificam o acesso à conversa. A verificação prepara o agente e autoriza uma sessão, sem abrir o microfone nem gerar áudio.{voz !== status.vozId && " Salve a voz escolhida antes de verificar."}</small>
    </>}
    <p className="small">Na chave da ElevenLabs, habilite <strong>Voices: Read</strong>, <strong>Text to Speech</strong> e <strong>ElevenLabs Agents / Conversational AI: Read e Write</strong>. Após ajustar as permissões, clique em Verificar conversa por voz. <a className="text-link" href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noreferrer">Gerenciar chaves na ElevenLabs</a></p>
    <p>O app prepara um agente privado na sua conta ElevenLabs. O agente recebe áudio, contexto e resultados calculados; as análises ficam no histórico. A gravação de voz do agente é desativada. Conversas ao vivo são cobradas na sua conta ElevenLabs, além das análises nos provedores já conectados. Encerre para desligar o microfone.</p>
  </section>;
}

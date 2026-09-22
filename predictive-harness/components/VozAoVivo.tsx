"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { DadosBase, Mensagem } from "@/lib/types";
import { Cartoes } from "./Cartoes";
import { Markdown } from "./Markdown";
import { SessaoVoz, type EstadoVoz } from "./SessaoVoz";
import { ErrorBox, Icon } from "./ui";
export function VozAoVivo({ conversaId, base, mensagens, onTurno, onClose, onVerDecisoes }: {
  conversaId: string; base: DadosBase | null; mensagens: Mensagem[];
  onTurno: (texto: string, signal: AbortSignal) => Promise<Mensagem>;
  onClose: () => void; onVerDecisoes: (id: string) => void;
}) {
  const [fase, setFase] = useState<EstadoVoz>("conectando");
  const [muda, setMuda] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [texto, setTexto] = useState({ papel: "assistente", texto: "" });
  const [erro, setErro] = useState("");
  const [exibida, setExibida] = useState<string | null>(() => [...mensagens].reverse().find(m => m.papel === "assistente")?.id || null);
  const ref = useRef<SessaoVoz | null>(null);
  const analises = mensagens.filter(m => m.papel === "assistente");
  const atual = analises.find(m => m.id === exibida) || analises.at(-1);
  const ferramenta = useEffectEvent(async (nome: string, params: Record<string, unknown>, signal: AbortSignal) => {
    if (nome === "mostrar_analise") {
      const m = analises.find(m => m.id === params.mensagemId);
      if (!m) throw new Error("A análise solicitada não pertence a esta conversa.");
      setExibida(m.id); return JSON.stringify({ mensagemId: m.id, texto: m.texto, cartoes: m.cartoes, recalculada: !!m.fpa?.recalculadoEm });
    }
    if (nome !== "analisar_dados") throw new Error("Ferramenta não disponível.");
    if (typeof params.pergunta !== "string" || !params.pergunta.trim() || params.pergunta.length > 2000) throw new Error("Reformule a pergunta com até 2.000 caracteres.");
    setCalculando(true); setErro("");
    try {
      const resposta = await onTurno(params.pergunta, signal);
      if (!signal.aborted) setExibida(resposta.id);
      return JSON.stringify({ mensagemId: resposta.id, texto: resposta.texto, cartoes: resposta.cartoes, proximasPerguntas: resposta.sugestoes, aviso: "Os cartões na tela foram atualizados pelo motor. Use somente estes números." });
    } catch(e) { if (!signal.aborted) setErro((e as Error).message); throw e; }
    finally { if (!signal.aborted) setCalculando(false); }
  });
  useEffect(() => {
    const s = new SessaoVoz({ estado: setFase, erro: setErro, texto: (papel, texto) => setTexto({ papel, texto }), ferramenta: (nome, params, signal) => ferramenta(nome, params, signal) });
    ref.current = s;
    const t = setTimeout(() => void s.iniciar(conversaId), 0);
    return () => { clearTimeout(t); s.fechar(); };
  }, [conversaId]);
  useEffect(() => {
    if (atual) ref.current?.atualizarContexto(JSON.stringify({ evento: "analise_exibida", mensagemId: atual.id, cartoes: atual.cartoes, recalculada: !!atual.fpa?.recalculadoEm }));
  }, [atual]);
  const rotulo = fase === "conectando" ? "Conectando ao Jev…" : fase === "encerrada" ? "Sessão encerrada" : calculando ? "Analisando seus dados…" : fase === "falando" ? "Jev está falando" : muda ? "Microfone pausado" : "Estou ouvindo";
  function encerrar() { ref.current?.fechar(); onClose(); }
  return <div className="voice-workspace" aria-label="Conversa por voz com dados interativos">
    <div className="voice-analysis rolagem">
      <div className="voice-analysis-heading"><span className="eyebrow">ANÁLISE AO VIVO</span>{analises.length > 0 && <select aria-label="Análise exibida" value={atual?.id || ""} onChange={e => setExibida(e.target.value)}>{analises.map((m, i) => <option key={m.id} value={m.id}>{i + 1}. {mensagens[mensagens.indexOf(m) - 1]?.texto.slice(0, 85) || "Análise"}</option>)}</select>}</div>
      {atual ? <article className="voice-result"><Cartoes cartoes={atual.cartoes || []} /><details className="voice-reading"><summary>Leitura da análise</summary>{atual.fpa?.recalculadoEm && <p className="recalculation-note">Os cartões têm os valores atualizados. A leitura abaixo é anterior ao recálculo.</p>}<Markdown texto={atual.texto} /></details><button className="text-button" onClick={() => onVerDecisoes(atual.id)}><Icon name="harness" size={15} />Premissas e cálculos</button></article> : <div className="voice-empty"><Icon name="gauge" size={32} /><h2>Seus dados entram na conversa</h2><p>Peça uma análise. Os gráficos e cenários aparecem aqui enquanto conversamos.</p><div className="voice-products">{base?.produtos.map(p => <span key={p.nome}>{p.nome}</span>)}</div></div>}
    </div>
    <div className="voice-dock">
      <ErrorBox error={erro} />
      {fase === "encerrada" && erro && <a className="text-link" href={`/configuracoes?conversa=${encodeURIComponent(conversaId)}#voz`}>Revisar conexão de voz</a>}
      <div className="voice-dock-content"><div className={`voice-orb ${fase}${muda ? " muted" : ""}`} aria-hidden="true"><span /><Icon name="waveform" size={25} /></div><div className="voice-live-caption"><strong role="status">{rotulo}</strong><p>{texto.texto || (fase === "encerrada" ? "O microfone está desligado. Volte ao chat ou revise a conexão." : "Fale naturalmente. O chat volta ao encerrar.")}</p></div><div className="voice-controls"><button className="icon-button" disabled={fase === "conectando" || fase === "encerrada"} title={muda ? "Ativar microfone" : "Pausar microfone"} aria-label={muda ? "Ativar microfone" : "Pausar microfone"} aria-pressed={muda} onClick={() => { ref.current?.silenciar(!muda); setMuda(!muda); }}><Icon name={muda ? "micOff" : "mic"} size={20} /></button><button className="voice-end" onClick={encerrar}><Icon name="close" size={18} /><span>{fase === "encerrada" ? "Voltar ao chat" : "Encerrar"}</span></button></div></div>
      {fase !== "conectando" && fase !== "encerrada" && <button className="text-button audio-unlock" onClick={() => void ref.current?.ativarSom().catch(() => setErro("Não foi possível ativar o som neste navegador."))}>Ativar som</button>}
    </div>
  </div>;
}

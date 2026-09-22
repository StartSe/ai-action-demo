"use client";
// Coluna central: a conversa com o agente de FP&A. Estado vazio com as quatro categorias de pergunta
// estratégica, balões com cartões tipados e as próximas perguntas ranqueadas pelo Jev.
import { useEffect, useRef, useState } from "react";
import type { CategoriaPergunta, DadosBase, Mensagem } from "@/lib/types";
import { ROTULO_CATEGORIA } from "@/lib/types";
import type { ChavePremissa } from "@/lib/fpa";
import { useAudio, useGravacao, type StatusVoz } from "./useVoz";
import { Markdown } from "./Markdown";
import { Cartoes } from "./Cartoes";
import { Icon, ErrorBox, request, fmtMs } from "./ui";

const DESCRICAO_CATEGORIA: Record<CategoriaPergunta, string> = {
  diagnostico: "Onde está a melhor margem, o que pesa mais",
  cenario: "Se abrirmos uma turma, o que muda na margem",
  meta_reversa: "Quanto cabe gastar mantendo a meta",
  risco: "Com quantos alunos deixa de se pagar",
  descritiva: "O que a base mostra",
  conceito: "O que significa um termo",
  outra: "",
};
const ICONE_CATEGORIA: Record<CategoriaPergunta, string> = { diagnostico: "gauge", cenario: "spark", meta_reversa: "coins", risco: "shield", descritiva: "table", conceito: "info", outra: "chat" };

export function Conversa({ base, mensagens, harnessPronto, conversaPronta, selecionada, onSelecionar, onVerDecisoes, onMensagens, onBaseMudou, autoPergunta, semRolagem, conversaId, onBusy, onConectores }: {
  conversaId: string;
  onBusy: (busy: boolean) => void;
  onConectores: () => void;
  base: DadosBase | null;
  mensagens: Mensagem[];
  harnessPronto: boolean;
  conversaPronta: boolean;
  selecionada: string | null;
  onSelecionar: (id: string) => void;
  onVerDecisoes: (id: string) => void;
  onMensagens: (m: Mensagem[]) => void;
  onBaseMudou: () => Promise<void>;
  autoPergunta: string | null;
  semRolagem: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [voz, setVoz] = useState<StatusVoz | null>(null);
  const [modoVoz, setModoVoz] = useState(false);
  const [transcrita, setTranscrita] = useState(false);
  const audio = useAudio();
  const gravacao = useGravacao(t => { setTexto(anterior => [anterior, t].filter(Boolean).join(" ")); setTranscrita(true); }, setError);
  useEffect(() => { void request<StatusVoz>("/api/voz").then(setVoz).catch(() => {}); }, []);
  useEffect(() => { onBusy(busy || gravacao.solicitando || gravacao.gravando || gravacao.transcrevendo); }, [busy, gravacao.solicitando, gravacao.gravando, gravacao.transcrevendo, onBusy]);
  useEffect(() => () => onBusy(false), [onBusy]);
  const fim = useRef<HTMLDivElement>(null);
  const autoEnviado = useRef(false);
  async function enviar(pergunta: string) {
    const p = pergunta.trim();
    if (!p || busy || gravacao.solicitando || gravacao.gravando || gravacao.transcrevendo) return;
    if (p.length > 2000) { setError("A pergunta deve ter até 2.000 caracteres."); return; }
    audio.parar(); setTranscrita(false);
    setBusy(true);
    setError("");
    setTexto("");
    try {
      const r = await request<{ pergunta: Mensagem; resposta: Mensagem }>("/api/base/conversa", "POST", { pergunta: p, conversaId });
      onMensagens([...mensagens, r.pergunta, r.resposta]);
      onSelecionar(r.resposta.id);
      if (modoVoz && voz?.vozId) void audio.ouvir(r.resposta.id, { mensagemId: r.resposta.id, conversaId }).catch(e => setError(e.message));
    } catch (e) {
      setError((e as Error).message);
      setTexto(p);
    } finally {
      setBusy(false);
    }
  }
  async function usarPremissas(produto: string, valores: Partial<Record<ChavePremissa, number>>, pergunta: string) {
    for (const [chave, valor] of Object.entries(valores)) await request("/api/base/premissas", "PUT", { produto, chave, valor });
    await onBaseMudou();
    await enviar(pergunta);
  }
  useEffect(() => {
    if (!autoPergunta || autoEnviado.current || mensagens.length) return;
    autoEnviado.current = true;
    // Sem cleanup de propósito: em next dev o Strict Mode roda setup → cleanup → setup e mataria o timer.
    setTimeout(() => void enviar(autoPergunta), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPergunta]);
  useEffect(() => {
    if (!semRolagem) fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens.length, busy, semRolagem]);
  const ultima = [...mensagens].reverse().find((m) => m.papel === "assistente");
  const seguintes = ultima?.sugestoes?.length ? ultima.sugestoes : [];
  const iniciais = base?.sugestoes || [];
  const pronto = harnessPronto && conversaPronta;
  const semBase = !!base && !base.matriculas;
  return (
    <>
      <div className="rolagem">
        {!pronto && base && (
          <div className="aviso-demo">
            <span>
              <Icon name="info" size={14} /> {base.demo ? "Modo demonstração: as perguntas sugeridas são calculadas aqui mesmo, com a base de exemplo." : "Sem a IA conectada, a base só mostra produtos e premissas."}
            </span>
            <a href={`/configuracoes?conversa=${conversaId}`}>Conectar ChatGPT e OpenRouter</a>
          </div>
        )}
        {!mensagens.length && !busy ? (
          <div className="vazio reveal">
            <span className="welcome-mark"><Icon name="spark" size={32} /></span><span className="eyebrow">DADOS, CONTEXTO E UMA BOA CONVERSA</span><h3>Qual é a próxima decisão?</h3>
            <p>{semBase ? "Sou o Jev, seu analista estratégico. Selecione uma planilha em Conectores para começarmos pelos seus dados." : `Sou o Jev, seu analista estratégico. Vamos explorar os ${base ? base.produtos.length : 0} produtos da base, testar cenários e entender o que move seus resultados.`}</p>
            {semBase && <button className="primary" onClick={onConectores}><Icon name="upload" size={16} /> Escolher minhas fontes</button>}
            <div className="categorias">
              {iniciais.map((s) => (
                <button key={s.texto} className="categoria" disabled={busy} onClick={() => void enviar(s.texto)}>
                  <span className="ic"><Icon name={ICONE_CATEGORIA[s.categoria]} size={18} /></span>
                  <span className="rotulo">{ROTULO_CATEGORIA[s.categoria]}</span>
                  <span className="desc">{DESCRICAO_CATEGORIA[s.categoria]}</span>
                  <span className="pergunta">{s.texto}</span>
                </button>
              ))}
            </div>
            {base && !base.custos && !semBase && <p className="muted small">Sem planilha de custos, os cenários usam custo fixo e variável informados por você. Você pode informar no Livro de premissas ou quando o agente pedir.</p>}
          </div>
        ) : (
          <div className="mensagens">
            {mensagens.map((m) => (
              <div className={"mensagem " + m.papel} key={m.id}>
                {m.papel === "assistente" ? (
                  <div className={"balao" + (selecionada === m.id ? " selecionada" : "")} onClick={() => onSelecionar(m.id)}>
                    <span className="message-author">Jev</span>
                    {m.fpa?.recalculadoEm && <p className="recalculation-note">Os cartões foram recalculados. A leitura abaixo se refere aos valores anteriores.</p>}
                    <Markdown texto={m.texto} />
                    {m.cartoes && m.cartoes.length > 0 && <Cartoes cartoes={m.cartoes} onUsarPremissas={pronto ? usarPremissas : undefined} />}
                  </div>
                ) : (
                  <div className="balao">{m.texto}</div>
                )}
                {m.papel === "assistente" && (
                  <div className="meta">
                    {m.categoria && m.categoria !== "outra" && <span className="chip neutral">{ROTULO_CATEGORIA[m.categoria]}</span>}
                    {m.exemplo && <span className="chip warn">resposta de exemplo</span>}
                    {m.harness && <span>{m.harness.chamadasJev} decisões do Jev · {fmtMs(m.harness.latenciaTotalMs)}</span>}
                    {m.decisoes?.some((d) => d.baixaConfianca) && <span className="chip warn">alguma decisão com baixa confiança</span>}
                    <button className="text-button" style={{ padding: 0 }} onClick={() => onVerDecisoes(m.id)}><Icon name="harness" size={13} /> Como cheguei aqui</button>
                    {voz?.conectado && voz.vozId && <button className="text-button" onClick={() => { if (audio.tocando === m.id) audio.parar(); else void audio.ouvir(m.id, { mensagemId: m.id, conversaId }).catch(e => setError(e.message)); }}><Icon name={audio.tocando === m.id ? "stop" : "volume"} size={13} />{audio.tocando === m.id ? audio.preparando ? "Cancelar áudio" : "Parar áudio" : "Ouvir resposta"}</button>}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="mensagem assistente">
                <div className="balao pensando"><span className="spinner" /> Triando, especificando, calculando e verificando…</div>
              </div>
            )}
            {!busy && seguintes.length > 0 && (
              <div className="sugestoes">
                {seguintes.map((s) => (
                  <button key={s} disabled={busy} onClick={() => void enviar(s)}>{s}</button>
                ))}
              </div>
            )}
            <div ref={fim} />
          </div>
        )}
      </div>
      <div className="compor">
        <ErrorBox error={error} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enviar(texto);
          }}
        >
          <textarea
            aria-label="Mensagem para Jev"
            maxLength={2000}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={pronto ? "Pergunte ao Jev ou use o microfone…" : base?.demo ? "Escolha uma pergunta sugerida ou conecte a IA para perguntar qualquer coisa" : "Conecte a IA em Configurações para perguntar"}
            rows={1}
            disabled={busy || gravacao.solicitando || gravacao.gravando || gravacao.transcrevendo}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar(texto);
              }
            }}
          />
          {voz?.conectado ? <button type="button" className={"voice-button" + (gravacao.gravando ? " recording" : "")} disabled={busy || gravacao.solicitando || gravacao.transcrevendo} aria-label={gravacao.gravando ? "Concluir gravação" : "Gravar pergunta"} title={gravacao.gravando ? "Concluir gravação" : "Gravar pergunta"} onClick={() => { audio.parar(); if (gravacao.gravando) gravacao.parar(); else void gravacao.gravar(); }}><Icon name={gravacao.gravando ? "stop" : "mic"} size={20} /></button> : <a className="voice-button" href={`/configuracoes?conversa=${conversaId}#voz`} aria-label="Configurar conversa por voz" title="Conectar ElevenLabs para usar voz"><Icon name="mic" size={20} /></a>}
          <button className="primary" disabled={busy || gravacao.solicitando || gravacao.gravando || gravacao.transcrevendo || !texto.trim()} aria-label="Enviar">
            <Icon name="send" size={18} /><span>Perguntar</span>
          </button>
        </form>
        <div className="composer-status" aria-live="polite">
          {gravacao.solicitando ? <span>Aguardando acesso ao microfone…</span> : gravacao.gravando ? <><span className="recording-dot" /> Gravando · {gravacao.segundos}s / 60s <button className="text-button" onClick={() => gravacao.parar(true)}>Descartar</button></> : gravacao.transcrevendo ? <><span className="spinner" /> Transcrevendo sua pergunta…</> : transcrita ? <span>Revise a transcrição e envie quando estiver pronta.</span> : <span>Enter para enviar · Shift + Enter para uma nova linha</span>}
          {voz?.conectado && voz.vozId && <label className="marcar"><input type="checkbox" checked={modoVoz} onChange={e => { setModoVoz(e.target.checked); if (!e.target.checked) audio.parar(); }} /> Ouvir respostas automaticamente</label>}
        </div>
        <small className="composer-footnote">Cálculos verificáveis, premissas visíveis. <a href={`/configuracoes?conversa=${conversaId}#politica-dados`}>Uso dos dados e modelos</a></small>
      </div>
    </>
  );
}

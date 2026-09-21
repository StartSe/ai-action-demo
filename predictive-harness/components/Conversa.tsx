"use client";
import { useEffect, useRef, useState } from "react";
import type { Mensagem } from "@/lib/types";
import type { PlanilhaComSugestoes } from "./Dados";
import { Markdown } from "./Markdown";
import { Icon, ErrorBox, request, fmtMs } from "./ui";
export function Conversa({ planilha, mensagens, harnessPronto, conversaPronta, selecionada, onSelecionar, onVerDecisoes, onMensagens, autoPergunta, semRolagem }: {
  planilha: PlanilhaComSugestoes;
  mensagens: Mensagem[];
  harnessPronto: boolean;
  conversaPronta: boolean;
  selecionada: string | null;
  onSelecionar: (id: string) => void;
  onVerDecisoes: (id: string) => void;
  onMensagens: (m: Mensagem[]) => void;
  autoPergunta: string | null;
  semRolagem: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  const autoEnviado = useRef(false);
  async function enviar(pergunta: string) {
    const p = pergunta.trim();
    if (!p || busy) return;
    setBusy(true);
    setError("");
    setTexto("");
    try {
      const r = await request<{ pergunta: Mensagem; resposta: Mensagem }>(`/api/planilhas/${planilha.id}/conversa`, "POST", { pergunta: p });
      onMensagens([...mensagens, r.pergunta, r.resposta]);
      onSelecionar(r.resposta.id);
    } catch (e) {
      setError((e as Error).message);
      setTexto(p);
    } finally {
      setBusy(false);
    }
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
  async function limpar() {
    if (!mensagens.length || !window.confirm("Limpar esta conversa?")) return;
    await request(`/api/planilhas/${planilha.id}/conversa`, "DELETE");
    onMensagens([]);
  }
  const ultima = [...mensagens].reverse().find((m) => m.papel === "assistente");
  const sugestoes = ultima?.sugestoes?.length ? ultima.sugestoes : mensagens.length ? [] : planilha.sugestoes;
  return (
    <>
      <div className="rolagem">
        {!harnessPronto && (
          <div className="aviso-demo">
            <span>
              <Icon name="info" size={14} /> {planilha.demo ? "Modo demonstração: as perguntas sugeridas têm respostas calculadas aqui mesmo." : "Sem a IA conectada, esta planilha só mostra o perfil."}
            </span>
            <a href="/configuracoes">Conectar ChatGPT e OpenRouter</a>
          </div>
        )}
        {!mensagens.length && !busy ? (
          <div className="vazio reveal">
            <h3>Pergunte sobre {planilha.nome}</h3>
            <p>{planilha.linhas.toLocaleString("pt-BR")} linhas e {planilha.colunas.length} colunas prontas. A pergunta passa pela triagem do Jev, a resposta pelo modelo de linguagem, e os números pela verificação.</p>
            <div className="sugestoes">
              {sugestoes.map((s) => (
                <button key={s} disabled={busy} onClick={() => void enviar(s)}>{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mensagens">
            {mensagens.map((m) => (
              <div className={"mensagem " + m.papel} key={m.id}>
                <div className={"balao" + (m.papel === "assistente" && selecionada === m.id ? " selecionada" : "")} onClick={() => m.papel === "assistente" && onSelecionar(m.id)} role={m.papel === "assistente" ? "button" : undefined} tabIndex={m.papel === "assistente" ? 0 : undefined} onKeyDown={(e) => e.key === "Enter" && m.papel === "assistente" && onSelecionar(m.id)}>
                  {m.papel === "assistente" ? <Markdown texto={m.texto} /> : m.texto}
                </div>
                {m.papel === "assistente" && (
                  <div className="meta">
                    {m.exemplo && <span className="chip warn">resposta de exemplo</span>}
                    {m.harness && <span>{m.harness.chamadasJev} decisões do Jev · {fmtMs(m.harness.latenciaTotalMs)}</span>}
                    {m.decisoes?.some((d) => d.baixaConfianca) && <span className="chip warn">alguma decisão com baixa confiança</span>}
                    <button className="text-button" style={{ padding: 0 }} onClick={() => onVerDecisoes(m.id)}>Ver decisões</button>
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="mensagem assistente">
                <div className="balao pensando"><span className="spinner" /> Triando, respondendo e verificando…</div>
              </div>
            )}
            {!busy && sugestoes.length > 0 && (
              <div className="sugestoes">
                {sugestoes.map((s) => (
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
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={harnessPronto && conversaPronta ? "Pergunte em português sobre a planilha…" : planilha.demo ? "Escolha uma pergunta sugerida ou conecte a IA para perguntar qualquer coisa" : "Conecte a IA em Configurações para perguntar"}
            rows={1}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar(texto);
              }
            }}
          />
          <button className="primary" disabled={busy || !texto.trim()} aria-label="Enviar">
            <Icon name="send" size={18} /> Perguntar
          </button>
        </form>
        <small>
          {mensagens.length > 0 && (
            <button className="text-button" style={{ padding: 0, marginRight: 10 }} onClick={() => void limpar()}>Limpar conversa</button>
          )}
          As linhas da planilha nunca vão para a IA: só o perfil e os agregados.
        </small>
      </div>
    </>
  );
}

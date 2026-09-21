"use client";
// Coluna central: a conversa com o agente de FP&A. Estado vazio com as quatro categorias de pergunta
// estratégica, balões com cartões tipados e as próximas perguntas ranqueadas pelo Jev.
import { useEffect, useRef, useState } from "react";
import type { CategoriaPergunta, DadosBase, Mensagem } from "@/lib/types";
import { ROTULO_CATEGORIA } from "@/lib/types";
import type { ChavePremissa } from "@/lib/fpa";
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

export function Conversa({ base, mensagens, harnessPronto, conversaPronta, selecionada, onSelecionar, onVerDecisoes, onMensagens, onBaseMudou, autoPergunta, semRolagem }: {
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
  const fim = useRef<HTMLDivElement>(null);
  const autoEnviado = useRef(false);
  async function enviar(pergunta: string) {
    const p = pergunta.trim();
    if (!p || busy) return;
    setBusy(true);
    setError("");
    setTexto("");
    try {
      const r = await request<{ pergunta: Mensagem; resposta: Mensagem }>("/api/base/conversa", "POST", { pergunta: p });
      onMensagens([...mensagens, r.pergunta, r.resposta]);
      onSelecionar(r.resposta.id);
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
  async function limpar() {
    if (!mensagens.length || !window.confirm("Limpar esta conversa?")) return;
    await request("/api/base/conversa", "DELETE");
    onMensagens([]);
  }
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
            <a href="/configuracoes">Conectar ChatGPT e OpenRouter</a>
          </div>
        )}
        {!mensagens.length && !busy ? (
          <div className="vazio reveal">
            <h3>Comece com uma pergunta estratégica</h3>
            <p>{semBase ? "Envie a planilha de matrículas em Base e premissas para o agente conhecer seus produtos e turmas." : `${base ? base.produtos.length : 0} ${base?.produtos.length === 1 ? "produto" : "produtos"} na base. A pergunta passa pela triagem do Jev, o motor faz a conta com premissas visíveis e o modelo só escreve a leitura.`}</p>
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
            {base && !base.custos && !semBase && <p className="muted small">Sem planilha de custos, os cenários usam custo fixo e variável informados por você. Você pode informar em Base e premissas ou quando o agente pedir.</p>}
          </div>
        ) : (
          <div className="mensagens">
            {mensagens.map((m) => (
              <div className={"mensagem " + m.papel} key={m.id}>
                {m.papel === "assistente" ? (
                  <div className={"balao" + (selecionada === m.id ? " selecionada" : "")} onClick={() => onSelecionar(m.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onSelecionar(m.id)}>
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
                    <button className="text-button" style={{ padding: 0 }} onClick={() => onVerDecisoes(m.id)}>Como cheguei aqui</button>
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
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={pronto ? "Pergunte ao seu analista de FP&A…" : base?.demo ? "Escolha uma pergunta sugerida ou conecte a IA para perguntar qualquer coisa" : "Conecte a IA em Configurações para perguntar"}
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
          As linhas das planilhas nunca vão para a IA: só produtos, agregados e premissas. A conta é sempre do motor.
        </small>
      </div>
    </>
  );
}

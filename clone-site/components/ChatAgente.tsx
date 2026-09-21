"use client";
// Conversa com o agente do site (POST /api/sites/[id]/agente): pessoa à direita, agente à esquerda com os passos
// executados e a versão criada (clicável: seleciona a prévia). Enter envia, Shift+Enter quebra linha. Atalhos
// quando a conversa está vazia. `pedidoExterno` deixa outro painel (Sugestões) mandar uma instrução para o chat.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Aviso, lerErro } from "./ui";
import type { Pagina, Projeto } from "@/lib/types";

export type MensagemChat = { id: string; papel: "pessoa" | "agente"; texto: string; versaoN: number | null; passos: string[]; criadoEm: string };
type Resposta = { resposta: string; versoes: number[]; publicou: boolean; passos: string[]; pagina: Pagina; projeto: Projeto; mensagens: MensagemChat[] };

const ROTULO_PASSO: Record<string, string> = {
  ver_pagina: "Lendo a página",
  editar_trecho: "Editando um trecho",
  reescrever_pagina: "Reescrevendo a página",
  trocar_imagem: "Trocando uma imagem",
  listar_imagens: "Conferindo as imagens",
  publicar: "Publicando",
  ver_metricas: "Lendo as métricas",
};

const ATALHOS = ["Coloque o logo no topo", "Troque o título principal por algo mais direto", "Publique esta versão"];

export function ChatAgente({ projetoId, demo, pedidoExterno, aoResponder, aoSelecionarVersao }: {
  projetoId: string;
  demo: boolean;
  /** Instrução vinda de fora (ex.: "Aplicar" de uma sugestão); muda a cada envio para disparar de novo. */
  pedidoExterno?: { texto: string; chave: number } | null;
  aoResponder: (r: { pagina: Pagina; projeto: Projeto }) => void;
  aoSelecionarVersao: (n: number) => void;
}) {
  const [mensagens, setMensagens] = useState<MensagemChat[] | null>(null);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimoPedido, setUltimoPedido] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const chaveTratada = useRef<number | null>(null);

  useEffect(() => {
    let ativo = true;
    fetch(`/api/sites/${projetoId}/agente`)
      .then(async (r) => { if (!r.ok) throw new Error((await lerErro(r)).mensagem); return r.json(); })
      .then((d) => { if (ativo) setMensagens(d.mensagens); })
      .catch(async (e) => { if (ativo) { setMensagens([]); setErro((await lerErro(e)).mensagem); } });
    return () => { ativo = false; };
  }, [projetoId]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "nearest" });
  }, [mensagens?.length, ocupado]);

  async function enviar(pedido: string) {
    const t = pedido.trim();
    if (!t || ocupado) return;
    setOcupado(true);
    setErro(null);
    setUltimoPedido(t);
    setTexto("");
    setMensagens((m) => [...(m ?? []), { id: `tmp-${Date.now()}`, papel: "pessoa", texto: t, versaoN: null, passos: [], criadoEm: new Date().toISOString() }]);
    try {
      const r = await fetch(`/api/sites/${projetoId}/agente`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: t }) });
      if (!r.ok) { setErro((await lerErro(r)).mensagem); return; }
      const d = (await r.json()) as Resposta;
      setMensagens(d.mensagens);
      aoResponder({ pagina: d.pagina, projeto: d.projeto });
      if (d.versoes.length) aoSelecionarVersao(d.versoes[d.versoes.length - 1]);
      setUltimoPedido(null);
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    } finally {
      setOcupado(false);
    }
  }

  // Pedido vindo de outro painel (Sugestões → "Aplicar").
  useEffect(() => {
    if (!pedidoExterno || chaveTratada.current === pedidoExterno.chave) return;
    chaveTratada.current = pedidoExterno.chave;
    void enviar(pedidoExterno.texto);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dispara uma vez por chave
  }, [pedidoExterno?.chave]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void enviar(texto);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void enviar(texto);
    }
  }

  const vazio = mensagens !== null && mensagens.length === 0;

  return (
    <section className="card p-4 flex flex-col gap-3" aria-label="Agente do site">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-bold text-[14px]">Agente do site</h3>
        {mensagens && mensagens.length > 0 && (
          <button type="button" className="btn-link text-[12.5px] !text-muted" disabled={ocupado} onClick={async () => { if (!window.confirm("Limpar a conversa? As versões do site continuam.")) return; await fetch(`/api/sites/${projetoId}/agente`, { method: "DELETE" }); setMensagens([]); }}>Limpar a conversa</button>
        )}
      </div>
      {demo && (
        <Aviso>Sem a inteligência artificial conectada, o agente aplica uma mudança de exemplo em cada pedido, mas o fluxo (versão nova, publicar a pedido) é real.</Aviso>
      )}

      <div className="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto pr-1" role="log" aria-live="polite">
        {mensagens === null && <p className="text-muted text-[13px]">Carregando a conversa...</p>}
        {vazio && (
          <div className="text-[13.5px] text-ink-2 flex flex-col gap-2">
            <p>Peça em português: trocar um texto, colocar o logo, mudar cores, publicar ou ver como estão as visitas.</p>
            <div className="flex flex-wrap gap-2">
              {ATALHOS.map((a) => (
                <button key={a} type="button" className="chip-neutral !py-1.5 !px-3 !text-[12.5px] !font-semibold cursor-pointer hover:brightness-95" disabled={ocupado} onClick={() => enviar(a)}>{a}</button>
              ))}
            </div>
          </div>
        )}
        {(mensagens ?? []).map((m) => (
          <div key={m.id} className={`flex ${m.papel === "pessoa" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[92%] rounded-[14px] px-3.5 py-2.5 text-[13.5px] leading-snug ${m.papel === "pessoa" ? "bg-accent text-white rounded-br-[4px]" : "bg-bg text-ink border border-line rounded-bl-[4px]"}`}>
              <p className="whitespace-pre-wrap break-words">{m.texto}</p>
              {m.papel === "agente" && (m.passos.length > 0 || m.versaoN) && (
                <div className="mt-2 flex items-center gap-2 flex-wrap text-[12px]">
                  {m.passos.map((p, i) => <span key={`${p}-${i}`} className="chip-cinza !font-semibold">{ROTULO_PASSO[p] ?? p}</span>)}
                  {m.versaoN && <button type="button" className="chip-neutral !font-semibold cursor-pointer hover:brightness-95" onClick={() => aoSelecionarVersao(m.versaoN!)}>Versão {m.versaoN}</button>}
                </div>
              )}
            </div>
          </div>
        ))}
        {ocupado && (
          <div className="flex justify-start">
            <div className="bg-bg border border-line rounded-[14px] rounded-bl-[4px] px-3.5 py-2.5 text-[13.5px] text-ink-2 flex items-center gap-2" role="status">
              <span className="chip-gerando" aria-hidden="true" />O agente está trabalhando...
            </div>
          </div>
        )}
        <div ref={fim} />
      </div>

      {erro && (
        <Aviso tom="danger" acao={ultimoPedido ? { rotulo: "Tentar de novo", onClick: () => enviar(ultimoPedido) } : undefined}>{erro}</Aviso>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <label htmlFor="pedido-agente" className="sr-only">Peça uma mudança</label>
        <textarea
          id="pedido-agente"
          className="input min-h-[72px] resize-y"
          placeholder="Peça uma mudança. Ex.: troque o título por 'Seu caixa em dia' e publique."
          value={texto}
          maxLength={2000}
          disabled={ocupado}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted text-[12px]">Enter envia · Shift+Enter quebra a linha</span>
          <button type="submit" className="btn-primary !w-auto !h-10 !text-[13.5px]" disabled={ocupado || !texto.trim()}>Enviar</button>
        </div>
      </form>
    </section>
  );
}

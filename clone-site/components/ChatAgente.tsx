"use client";
// O agente do site numa bolha flutuante sobre a prévia: o botão redondo (canto inferior direito) abre o painel de
// conversa; cada pedido vai por POST /api/sites/[id]/agente com resposta AO VIVO (linhas JSON): os passos
// aparecem enquanto o agente trabalha e cada mudança no rascunho chega em `aoPrevia`, que a tela mostra na prévia
// na hora — antes mesmo de a versão ser gravada. Enter envia, Shift+Enter quebra linha. `pedidoExterno` deixa outro
// painel (Sugestões, Marca) mandar uma instrução para o chat.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Pagina, Projeto } from "@/lib/types";
import { Icone } from "./Icones";
import { Aviso, lerErro } from "./ui";

export type MensagemChat = { id: string; papel: "pessoa" | "agente"; texto: string; versaoN: number | null; passos: string[]; criadoEm: string };
type Resposta = { resposta: string; versoes: number[]; publicou: boolean; passos: string[]; pagina: Pagina; projeto: Projeto; mensagens: MensagemChat[] };
type Evento = { tipo: "passo"; nome: string } | { tipo: "previa"; html: string } | { tipo: "ping" } | ({ tipo: "fim" } & Resposta) | { tipo: "erro"; error?: string; acao?: { rotulo: string; url: string }; status?: number };

const ROTULO_PASSO: Record<string, string> = {
  ver_pagina: "Lendo a página",
  editar_trecho: "Editando um trecho",
  reescrever_pagina: "Reescrevendo a página",
  trocar_imagem: "Trocando uma imagem",
  listar_imagens: "Conferindo as imagens",
  publicar: "Publicando",
  ver_metricas: "Lendo as métricas",
};

const ATALHOS = ["Coloque o logo no topo", "Deixe o título principal mais direto", "Publique esta versão"];

/** Lê a resposta em linhas JSON, chamando `aoEvento` a cada linha completa. */
async function lerFluxo(r: Response, aoEvento: (e: Evento) => void): Promise<void> {
  const leitor = r.body?.getReader();
  if (!leitor) throw new Error("O servidor não respondeu como esperado. Recarregue a página e tente de novo.");
  const decodificador = new TextDecoder();
  let resto = "";
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    resto += decodificador.decode(value, { stream: true });
    const linhas = resto.split("\n");
    resto = linhas.pop() ?? "";
    for (const linha of linhas) {
      if (!linha.trim()) continue;
      try { aoEvento(JSON.parse(linha) as Evento); } catch { /* linha incompleta ou inválida: ignora */ }
    }
  }
  if (resto.trim()) { try { aoEvento(JSON.parse(resto) as Evento); } catch { /* idem */ } }
}

export function ChatAgente({ projetoId, demo, aberto, aoFechar, pedidoExterno, aoResponder, aoSelecionarVersao, aoPrevia, aoTrabalhando }: {
  projetoId: string;
  demo: boolean;
  aberto: boolean;
  aoFechar: () => void;
  /** Instrução vinda de fora (ex.: "Aplicar" de uma sugestão); muda a cada envio para disparar de novo. */
  pedidoExterno?: { texto: string; chave: number } | null;
  aoResponder: (r: { pagina: Pagina; projeto: Projeto }) => void;
  aoSelecionarVersao: (n: number) => void;
  /** O rascunho em edição, a cada mudança (null quando o pedido termina: a tela volta às versões gravadas). */
  aoPrevia: (html: string | null) => void;
  aoTrabalhando?: (trabalhando: boolean) => void;
}) {
  const [mensagens, setMensagens] = useState<MensagemChat[] | null>(null);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [passosAgora, setPassosAgora] = useState<string[]>([]);
  const [erro, setErro] = useState<{ mensagem: string; acao?: { rotulo: string; url: string } } | null>(null);
  const [ultimoPedido, setUltimoPedido] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const chaveTratada = useRef<number | null>(null);

  useEffect(() => {
    let ativo = true;
    fetch(`/api/sites/${projetoId}/agente`)
      .then(async (r) => { if (!r.ok) throw new Error((await lerErro(r)).mensagem); return r.json(); })
      .then((d) => { if (ativo) setMensagens(d.mensagens); })
      .catch(async (e) => { if (ativo) { setMensagens([]); setErro({ mensagem: (await lerErro(e)).mensagem }); } });
    return () => { ativo = false; };
  }, [projetoId]);

  useEffect(() => {
    if (aberto) fim.current?.scrollIntoView({ block: "nearest" });
  }, [mensagens?.length, ocupado, passosAgora.length, aberto]);

  useEffect(() => {
    if (aberto) campo.current?.focus();
  }, [aberto]);

  async function enviar(pedido: string) {
    const t = pedido.trim();
    if (!t || ocupado) return;
    setOcupado(true);
    aoTrabalhando?.(true);
    setErro(null);
    setPassosAgora([]);
    setUltimoPedido(t);
    setTexto("");
    setMensagens((m) => [...(m ?? []), { id: `tmp-${Date.now()}`, papel: "pessoa", texto: t, versaoN: null, passos: [], criadoEm: new Date().toISOString() }]);
    let terminou = false;
    try {
      const r = await fetch(`/api/sites/${projetoId}/agente`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify({ texto: t }) });
      if (!r.ok) { setErro(await lerErro(r)); return; }
      await lerFluxo(r, (e) => {
        if (e.tipo === "passo") setPassosAgora((p) => [...p, e.nome]);
        else if (e.tipo === "previa") aoPrevia(e.html);
        else if (e.tipo === "fim") {
          terminou = true;
          setMensagens(e.mensagens);
          aoResponder({ pagina: e.pagina, projeto: e.projeto });
          if (e.versoes.length) aoSelecionarVersao(e.versoes[e.versoes.length - 1]);
          setUltimoPedido(null);
        } else if (e.tipo === "erro") {
          terminou = true;
          setErro({ mensagem: e.error ?? "O agente não concluiu o pedido. Tente de novo.", acao: e.acao });
        }
      });
      if (!terminou) setErro({ mensagem: "A conexão caiu antes do agente terminar. Recarregue a página para ver se a mudança foi gravada." });
    } catch (e) {
      setErro(await lerErro(e));
    } finally {
      aoPrevia(null);
      setPassosAgora([]);
      setOcupado(false);
      aoTrabalhando?.(false);
    }
  }

  // Pedido vindo de outro painel (Sugestões → "Aplicar", Marca → "Aplicar ao site").
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

  if (!aberto) return null;
  const vazio = mensagens !== null && mensagens.length === 0;

  return (
    <section className="painel-agente" aria-label="Agente do site" role="dialog">
      <header>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0"><Icone nome="robo" tamanho={17} /></span>
          <div className="min-w-0">
            <h3 className="font-bold text-[14px] leading-tight">Agente do site</h3>
            <p className="text-muted text-[12px] leading-tight truncate">{ocupado ? "Trabalhando na prévia ao vivo..." : "Peça mudanças em português"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {mensagens && mensagens.length > 0 && (
            <button type="button" className="btn-link text-[12px] !text-muted mr-2" disabled={ocupado} onClick={async () => { if (!window.confirm("Limpar a conversa? As versões do site continuam.")) return; await fetch(`/api/sites/${projetoId}/agente`, { method: "DELETE" }); setMensagens([]); }}>Limpar</button>
          )}
          <button type="button" className="w-8 h-8 rounded-full grid place-items-center hover:bg-bg cursor-pointer" aria-label="Fechar o agente" onClick={aoFechar}><Icone nome="fechar" tamanho={16} /></button>
        </div>
      </header>

      <div className="painel-agente-corpo" role="log" aria-live="polite">
        {demo && <Aviso>Sem a inteligência artificial conectada, o agente aplica uma mudança de exemplo em cada pedido, mas o fluxo (prévia ao vivo, versão nova, publicar a pedido) é real.</Aviso>}
        {mensagens === null && <p className="text-muted text-[13px]">Carregando a conversa...</p>}
        {vazio && (
          <div className="text-[13.5px] text-ink-2 flex flex-col gap-2">
            <p>Peça em português: trocar um texto, colocar o logo, mudar cores, publicar ou ver como estão as visitas. A prévia muda enquanto o agente trabalha.</p>
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
                <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[12px]">
                  {m.passos.map((p, i) => <span key={`${p}-${i}`} className="chip-cinza !font-semibold">{ROTULO_PASSO[p] ?? p}</span>)}
                  {m.versaoN && <button type="button" className="chip-neutral !font-semibold cursor-pointer hover:brightness-95" onClick={() => aoSelecionarVersao(m.versaoN!)}>Versão {m.versaoN}</button>}
                </div>
              )}
            </div>
          </div>
        ))}
        {ocupado && (
          <div className="flex justify-start">
            <div className="bg-bg border border-line rounded-[14px] rounded-bl-[4px] px-3.5 py-2.5 text-[13.5px] text-ink-2 flex flex-col gap-1.5" role="status">
              <span className="flex items-center gap-2"><span className="chip-gerando" aria-hidden="true" />{passosAgora.length ? ROTULO_PASSO[passosAgora[passosAgora.length - 1]] ?? passosAgora[passosAgora.length - 1] : "O agente está pensando..."}</span>
              {passosAgora.length > 1 && <span className="text-[12px] text-muted">{passosAgora.slice(0, -1).map((p) => ROTULO_PASSO[p] ?? p).join(" · ")}</span>}
            </div>
          </div>
        )}
        {erro && <Aviso tom="danger" acao={erro.acao ?? (ultimoPedido ? { rotulo: "Tentar de novo", onClick: () => enviar(ultimoPedido) } : undefined)}>{erro.mensagem}</Aviso>}
        <div ref={fim} />
      </div>

      <form onSubmit={onSubmit}>
        <label htmlFor="pedido-agente" className="sr-only">Peça uma mudança</label>
        <textarea
          id="pedido-agente"
          ref={campo}
          className="input min-h-[64px] resize-none !py-2.5"
          placeholder="Ex.: troque o título por 'Seu caixa em dia' e publique."
          value={texto}
          maxLength={2000}
          disabled={ocupado}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted text-[11.5px]">Enter envia · Shift+Enter quebra a linha</span>
          <button type="submit" className="btn-compacto-primario !h-9" disabled={ocupado || !texto.trim()}>Enviar<Icone nome="enviar" tamanho={14} /></button>
        </div>
      </form>
    </section>
  );
}

/** O botão redondo que abre o agente; pulsa enquanto ele trabalha. */
export function BolhaAgente({ aberto, trabalhando, onClick }: { aberto: boolean; trabalhando: boolean; onClick: () => void }) {
  if (aberto) return null;
  return (
    <button type="button" className="bolha-agente" data-trabalhando={trabalhando} aria-label="Abrir o agente do site" onClick={onClick}>
      <Icone nome="robo" tamanho={20} />
      {trabalhando ? "Editando ao vivo..." : "Pedir uma mudança"}
    </button>
  );
}

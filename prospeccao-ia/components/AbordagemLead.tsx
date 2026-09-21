"use client";
// Estratégia e mensagens da abordagem (US-029 + US-030, Fase 5, SUBSTITUI a casca "Em breve" da US-027): a
// tela abre com o bloco "Estratégia para <primeiro nome>" já gerado (GET /api/leads/[id]/abordagem cria e
// salva na primeira visita, ver a rota) e cada item é editável por clique — a edição chama PUT, que regera
// as mensagens a partir da estratégia atualizada (lib/estrategia.ts:gerarMensagens), sem tocar nos outros
// campos. Abaixo, as três abas (LinkedIn/E-mail/WhatsApp) com o texto de cada canal e "Copiar" (US-030).
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Meta } from "@/lib/ai";
import { Aviso, Chip, CopyButton, Entregar, Origem, Topbar, useStatus } from "@/components/ui";
import { ETAPAS_ABORDAGEM, lerAbordagem, type EtapaAbordagem } from "@/lib/abordagem-progresso";
import { data } from "@/lib/formato";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import { ORDEM_DIRECOES_REGENERACAO, ROTULO_CAMPO_ESTRATEGIA, ROTULO_DIRECAO_REGENERACAO, ROTULO_STATUS_LEAD } from "@/lib/rotulos";
import type { AbordagemRegistro, DirecaoRegeneracao, EstrategiaAbordagem, LeadProspeccao } from "@/lib/types";

const CAMPOS: (keyof EstrategiaAbordagem)[] = ["objetivo", "gancho", "dorProvavel", "tom", "cta"];

type Canal = "linkedin" | "email" | "whatsapp";
const CANAIS: { chave: Canal; rotulo: string }[] = [
  { chave: "linkedin", rotulo: "LinkedIn" },
  { chave: "email", rotulo: "E-mail" },
  { chave: "whatsapp", rotulo: "WhatsApp" },
];

function TabButton({ id, ativo, bloqueado, onClick, children }: { id: Canal; ativo: boolean; bloqueado: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      id={`aba-${id}`}
      aria-controls="painel-mensagem"
      disabled={bloqueado}
      tabIndex={ativo ? 0 : -1}
      onKeyDown={e => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        const abas = Array.from(e.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>("[role=tab]"));
        const indice = abas.indexOf(e.currentTarget);
        const proxima = e.key === "Home" ? 0 : e.key === "End" ? abas.length - 1 : (indice + (e.key === "ArrowRight" ? 1 : -1) + abas.length) % abas.length;
        abas[proxima].focus(); abas[proxima].click();
      }}
      aria-selected={ativo}
      onClick={onClick}
      className={`bg-transparent border-0 border-b-2 cursor-pointer pt-2 pb-2.5 px-1 mr-3.5 font-semibold text-[13px] whitespace-nowrap shrink-0 ${
        ativo ? "text-accent-ink border-accent" : "text-muted border-transparent"
      }`}
    >
      {children}
    </button>
  );
}

function textoDoCanal(abordagem: AbordagemRegistro, canal: Canal) {
  if (canal === "linkedin") return abordagem.linkedin;
  if (canal === "whatsapp") return abordagem.whatsapp;
  return `Assunto: ${abordagem.email.assunto}\n\n${abordagem.email.corpo}`;
}

/** Valor CRU do canal (não o texto combinado de `textoDoCanal`): é isso que "Voltar à versão anterior"
 * precisa guardar e devolver, no mesmo formato que a rota espera de volta (string ou {assunto,corpo}). */
function valorDoCanal(abordagem: AbordagemRegistro, canal: Canal) {
  if (canal === "linkedin") return abordagem.linkedin;
  if (canal === "whatsapp") return abordagem.whatsapp;
  return abordagem.email;
}

/** Menu "Regenerar" (US-031): mesmo padrão de menu suspenso já usado por `Entregar` (components/ui.tsx,
 * INFRA) — click fora/Escape fecham —, reimplementado local porque `Entregar` não é compartilhável para um
 * menu com itens totalmente diferentes. "Usar outro sinal" abre uma segunda lista (os sinais do próprio
 * lead) em vez de regenerar direto; some da lista quando o lead não tem nenhum sinal ("botão que não faria
 * nada naquele estado não fica desligado, ele sai"). */
function MenuRegenerar({ lead, desabilitado, onEscolher }: { lead: LeadProspeccao | null; desabilitado: boolean; onEscolher: (direcao: DirecaoRegeneracao, sinalIndice?: number) => void }) {
  const [aberto, setAberto] = useState(false);
  const [sinaisAbertos, setSinaisAbertos] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") { setAberto(false); setSinaisAbertos(false); } }
    function onClickFora(e: MouseEvent) { if (menuRef.current && !menuRef.current.contains(e.target as Node)) { setAberto(false); setSinaisAbertos(false); } }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickFora);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickFora);
    };
  }, [aberto]);

  const temSinais = (lead?.sinais.length ?? 0) > 0;
  const itemClasse = "w-full text-left px-3 py-2 rounded-md hover:bg-accent-soft cursor-pointer";

  function escolher(direcao: DirecaoRegeneracao, sinalIndice?: number) {
    setAberto(false);
    setSinaisAbertos(false);
    onEscolher(direcao, sinalIndice);
  }

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button type="button" className="btn-ghost" disabled={desabilitado} aria-haspopup="menu" aria-expanded={aberto} onClick={() => { setAberto((v) => !v); setSinaisAbertos(false); }}>
        Regenerar
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-20 w-64 max-w-[80vw] card p-1.5 text-[13.5px]">
          {!sinaisAbertos ? (
            ORDEM_DIRECOES_REGENERACAO.filter((d) => d !== "outro_sinal" || temSinais).map((d) =>
              d === "outro_sinal" ? (
                <button key={d} type="button" role="menuitem" className={itemClasse} onClick={() => setSinaisAbertos(true)}>{ROTULO_DIRECAO_REGENERACAO[d]}</button>
              ) : (
                <button key={d} type="button" role="menuitem" className={itemClasse} onClick={() => escolher(d)}>{ROTULO_DIRECAO_REGENERACAO[d]}</button>
              )
            )
          ) : (
            <>
              <button type="button" className={`${itemClasse} font-semibold text-muted`} onClick={() => setSinaisAbertos(false)}>‹ Voltar</button>
              {lead?.sinais.map((s, i) => (
                <button key={i} type="button" role="menuitem" className={itemClasse} onClick={() => escolher("outro_sinal", i)}>
                  {s.descricao} <span className="text-muted">({data(s.data, { comAno: true })})</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const AJUDA_CAMPO: Record<keyof EstrategiaAbordagem, string> = {
  objetivo: "O que queremos alcançar", gancho: "Como abrir a conversa", dorProvavel: "Hipótese a validar com o lead", tom: "Como a mensagem deve soar", cta: "O próximo passo proposto",
};
function LinhaEstrategia({ campo, valor, bloqueado, onSalvar }: {
  campo: keyof EstrategiaAbordagem; valor: string; bloqueado: boolean;
  onSalvar: (campo: keyof EstrategiaAbordagem, valor: string) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor);
  const [salvando, setSalvando] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editando) inputRef.current?.focus(); }, [editando]);
  async function confirmar() {
    if (!texto.trim() || salvando) return;
    if (texto.trim() === valor) { setEditando(false); return; }
    setSalvando(true);
    try { if (await onSalvar(campo, texto.trim())) setEditando(false); }
    finally { setSalvando(false); }
  }
  return <div className="py-4 border-b border-line last:border-0">
    <div className="flex justify-between items-center gap-3 mb-1">
      <label htmlFor={`estrategia-${campo}`} className="text-sm font-semibold">{campo === "cta" ? "Próximo passo" : ROTULO_CAMPO_ESTRATEGIA[campo]}</label>
      {!editando && <button type="button" className="btn-link text-xs" disabled={bloqueado} aria-label={`Editar ${ROTULO_CAMPO_ESTRATEGIA[campo]}`} onClick={() => { setTexto(valor); setEditando(true); }}>Editar</button>}
    </div>
    <p className="text-xs text-muted mb-2">{AJUDA_CAMPO[campo]}</p>
    {editando ? <div>
      <textarea id={`estrategia-${campo}`} ref={inputRef} rows={3} className="input !h-auto w-full text-sm" value={texto} disabled={salvando || bloqueado} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === "Escape" && !salvando) setEditando(false); if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void confirmar(); } }} />
      <p className="text-xs text-muted my-2">Salvar atualiza as mensagens dos três canais.</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary !w-auto" type="button" disabled={salvando || bloqueado || !texto.trim()} onClick={confirmar}>{salvando ? "Atualizando mensagens…" : "Salvar alteração"}</button>
        <button className="btn-ghost !w-auto" type="button" disabled={salvando || bloqueado} onClick={() => setEditando(false)}>Cancelar</button>
      </div>
    </div> : <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{valor}</p>}
  </div>;
}

function ProgressoAbordagem({ etapa, erro }: { etapa: EtapaAbordagem; erro: string | null }) {
  const atual = ETAPAS_ABORDAGEM.findIndex(e => e.id === etapa);
  return <section className="card p-6 md:p-8" aria-label="Etapas da criação da abordagem" aria-busy={!erro}>
    <div className="flex items-center justify-between gap-4 mb-6">
      <h2 className="text-lg font-semibold">{erro ? "Criação interrompida" : "Preparando sua abordagem"}</h2>
      <span className="text-xs text-muted whitespace-nowrap">Etapa {atual + 1} de {ETAPAS_ABORDAGEM.length}</span>
    </div>
    <ol className="space-y-5">
      {ETAPAS_ABORDAGEM.map((e, i) => <li key={e.id} aria-current={i === atual ? "step" : undefined} className={`flex gap-3 ${i > atual ? "text-muted" : "text-ink"}`}>
        <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${i < atual ? "bg-ok text-white" : i === atual ? (erro ? "bg-bg text-danger" : "bg-accent-soft text-accent-ink") : "bg-bg text-muted"}`}>
          {i < atual ? "✓" : i === atual && !erro ? <span className="h-4 w-4 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin" /> : i === atual && erro ? "!" : i + 1}
        </span>
        <div><p className="text-sm font-semibold">{e.titulo}{i < atual && <span className="sr-only"> — concluída</span>}</p><p className="text-sm text-muted mt-1">{e.descricao}</p></div>
      </li>)}
    </ol>
    <p role="status" className="text-sm text-muted border-t border-line pt-4 mt-6">{erro ? "Os textos só ficam disponíveis quando a geração termina." : "Você poderá revisar e ajustar tudo antes de usar as mensagens."}</p>
  </section>;
}

export function AbordagemLead({ leadId }: { leadId: string }) {
  return <ConteudoAbordagem key={leadId} leadId={leadId} />;
}

function ConteudoAbordagem({ leadId }: { leadId: string }) {
  const { status, erro } = useStatus();
  const [lead, setLead] = useState<LeadProspeccao | null>(null);
  const [abordagem, setAbordagem] = useState<AbordagemRegistro | null>(null);
  const [etapa, setEtapa] = useState<EtapaAbordagem>("contexto");
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [salvandoEstrategia, setSalvandoEstrategia] = useState(false);
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [canal, setCanal] = useState<Canal>("linkedin");
  const [marcando, setMarcando] = useState(false);
  const [erroMarcar, setErroMarcar] = useState<string | null>(null);
  const [regenerando, setRegenerando] = useState(false);
  const [erroRegenerar, setErroRegenerar] = useState<string | null>(null);
  const [anterior, setAnterior] = useState<{ canal: Canal; valor: string | AbordagemRegistro["email"] } | null>(null);
  const [enviandoCRM, setEnviandoCRM] = useState(false);
  const [erroCRM, setErroCRM] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // Identifica o lead enquanto a geração transmite suas etapas reais.
    void fetch(`/api/leads/${leadId}`, { signal: controller.signal }).then(async r => {
      if (r.ok) { const dados = await r.json(); if (!controller.signal.aborted) setLead(dados.lead); }
    }).catch(() => {});
    void (async () => {
      try {
        const resposta = await fetch(`/api/leads/${leadId}/abordagem`, { headers: { Accept: "application/x-ndjson" }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(300_000)]) });
        if (resposta.status === 404) { setNaoEncontrada(true); return; }
        const dados = await lerAbordagem(resposta, e => { if (!controller.signal.aborted) setEtapa(e); });
        if (!controller.signal.aborted) { setLead(dados.lead); setAbordagem(dados.abordagem); }
      } catch (e) {
        if (!controller.signal.aborted) setErroCarregar(e instanceof Error && e.name !== "TimeoutError" && e.name !== "TypeError" ? e.message : "Não foi possível concluir a abordagem. Confira sua conexão e tente novamente.");
      }
    })();
    return () => controller.abort();
  }, [leadId, tentativa]);

  async function salvarCampo(campo: keyof EstrategiaAbordagem, valor: string) {
    if (!abordagem || salvandoEstrategia || regenerando) return false;
    setErroSalvar(null); setSalvandoEstrategia(true);
    const estrategia = { ...abordagem.estrategia, [campo]: valor };
    try {
      const r = await fetch(`/api/leads/${leadId}/abordagem`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estrategia }),
      });
      const corpo = await r.json().catch(() => null);
      if (!r.ok) { setErroSalvar(corpo?.error || "Não foi possível salvar esta alteração."); return false; }
      setAbordagem(corpo as AbordagemRegistro); setAnterior(null);
      return true;
    } catch {
      setErroSalvar("Não foi possível salvar esta alteração. Seu texto foi preservado para tentar novamente.");
      return false;
    } finally { setSalvandoEstrategia(false); }
  }

  async function marcarAbordado() {
    setErroMarcar(null);
    setMarcando(true);
    try {
      const r = await fetch(`/api/leads/${leadId}/marcar-abordado`, { method: "POST" });
      const corpo = await r.json().catch(() => null);
      if (!r.ok) { setErroMarcar(corpo?.error || "Não foi possível marcar como abordado."); return; }
      setLead(corpo as LeadProspeccao);
    } catch {
      setErroMarcar("Não foi possível marcar como abordado.");
    } finally {
      setMarcando(false);
    }
  }

  async function regenerar(direcao: DirecaoRegeneracao, sinalIndice?: number) {
    if (!abordagem) return;
    setErroRegenerar(null);
    setRegenerando(true);
    const valorAntes = valorDoCanal(abordagem, canal);
    try {
      const r = await fetch(`/api/leads/${leadId}/abordagem/regenerar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canal, direcao, ...(sinalIndice !== undefined ? { sinalIndice } : {}) }),
      });
      const corpo = await r.json().catch(() => null);
      if (!r.ok) { setErroRegenerar(corpo?.error || "Não foi possível regenerar esta mensagem."); return; }
      setAbordagem(corpo as AbordagemRegistro);
      setAnterior({ canal, valor: valorAntes });
    } catch {
      setErroRegenerar("Não foi possível regenerar esta mensagem.");
    } finally {
      setRegenerando(false);
    }
  }

  async function voltarVersaoAnterior() {
    if (!anterior) return;
    setErroRegenerar(null);
    setRegenerando(true);
    try {
      const r = await fetch(`/api/leads/${leadId}/abordagem/regenerar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canal: anterior.canal, restaurar: anterior.valor }),
      });
      const corpo = await r.json().catch(() => null);
      if (!r.ok) { setErroRegenerar(corpo?.error || "Não foi possível voltar à versão anterior."); return; }
      setAbordagem(corpo as AbordagemRegistro);
      setAnterior(null);
    } catch {
      setErroRegenerar("Não foi possível voltar à versão anterior.");
    } finally {
      setRegenerando(false);
    }
  }

  /** "Enviar para o CRM" (US-032, dentro do bloco `Entregar`): reaproveita a rota que já existia para o
   * modelo antigo (POST /api/leads/[id]/crm), que agora reconhece este id como um LeadProspeccao ANTES de
   * cair no comportamento antigo — ver a mesma decisão documentada em app/api/leads/[id]/crm/route.ts. Só
   * entra em `extras` (abaixo) quando o CRM está configurado e o lead ainda não foi enviado ("botão que não
   * faria nada naquele estado não fica desligado, ele sai"). */
  async function enviarParaCRM() {
    if (!lead) return;
    setErroCRM(null);
    setEnviandoCRM(true);
    try {
      const r = await fetch(`/api/leads/${lead.id}/crm`, { method: "POST" });
      const corpo = await r.json().catch(() => null);
      if (!r.ok) { setErroCRM(corpo?.error || "Não foi possível enviar para o CRM."); return; }
      setLead(corpo as LeadProspeccao);
    } catch {
      setErroCRM("Não foi possível enviar para o CRM.");
    } finally {
      setEnviandoCRM(false);
    }
  }

  const crmConfigurado = status?.integrations?.["mcp-crm"];
  const origemMeta: Meta | null = abordagem ? { demo: abordagem.demo, model: "", geradoEm: abordagem.criadoEm, insumo: "estratégia definida acima" } : null;

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} usuario={status?.usuario} navegacao={NAVEGACAO_PROSPECCAO} />

      <main className="max-w-[1200px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Link href={`/leads/${leadId}`} className="btn-link text-sm mb-5 inline-block">‹ Voltar para a ficha</Link>
        <header className="mb-7">
          <p className="sobretitulo mb-2">Abordagem personalizada</p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-ink">{lead ? `Uma conversa com ${lead.nome.split(" ")[0]}` : "Prepare a próxima conversa"}</h1>
          <p className="text-muted mt-2">{abordagem ? "Revise a estratégia, escolha o canal e use a mensagem para iniciar o contato." : "Transformando a qualificação do lead em uma estratégia e mensagens para cada canal."}</p>
          {lead && <div className="flex flex-wrap items-center gap-2 mt-4 text-sm"><span className="font-semibold">{lead.nome}</span><span className="text-muted">{[lead.cargo, lead.empresa].filter(Boolean).join(" · ")}</span><Chip nivel="neutral">{ROTULO_STATUS_LEAD[lead.status]}</Chip></div>}
        </header>
        {naoEncontrada ? <Aviso tom="danger">Esta pessoa não existe mais. Volte à lista de leads para escolher outro contato.</Aviso> : !abordagem ? <div className="max-w-2xl mx-auto">
          <ProgressoAbordagem etapa={etapa} erro={erroCarregar} />
          {erroCarregar && <div className="mt-4" role="alert"><Aviso tom="danger">{erroCarregar}</Aviso><button type="button" className="btn-primary mt-4 !w-auto" onClick={() => { setErroCarregar(null); setEtapa("contexto"); setTentativa(v => v + 1); }}>Tentar novamente</button></div>}
        </div> : <>
          <div className="grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-6 items-start">
            <section className="card p-5 md:p-6 min-w-0" aria-labelledby="titulo-estrategia">
              <div className="border-b border-line pb-4"><h2 id="titulo-estrategia" className="text-lg font-semibold">Estratégia da conversa</h2><p className="text-sm text-muted mt-1">A direção que orienta os três canais.</p></div>
              {CAMPOS.map(campo => <LinhaEstrategia key={campo} campo={campo} valor={abordagem.estrategia[campo]} bloqueado={salvandoEstrategia || regenerando} onSalvar={salvarCampo} />)}
              {erroSalvar && <div role="alert" className="mt-3"><Aviso tom="danger">{erroSalvar}</Aviso></div>}
            </section>
            <section className="card p-5 md:p-6 min-w-0" aria-labelledby="titulo-mensagem" aria-busy={regenerando || salvandoEstrategia}>
              <div className="mb-4"><h2 id="titulo-mensagem" className="text-lg font-semibold">Sua mensagem</h2><p className="text-sm text-muted mt-1">Revise o texto antes de enviar pelo canal escolhido.</p></div>
              <div role="tablist" aria-label="Canal da mensagem" className="flex border-b border-line mb-5">
                {CANAIS.map(c => <TabButton key={c.chave} id={c.chave} bloqueado={regenerando || salvandoEstrategia} ativo={canal === c.chave} onClick={() => { if (!regenerando && !salvandoEstrategia) { setCanal(c.chave); setErroRegenerar(null); } }}>{c.rotulo}</TabButton>)}
              </div>
              {(regenerando || salvandoEstrategia) && <p role="status" className="text-sm text-accent-ink bg-accent-soft rounded-lg p-3 mb-4">{salvandoEstrategia ? "Atualizando os três canais com sua estratégia…" : `Reescrevendo a mensagem de ${CANAIS.find(c => c.chave === canal)?.rotulo}…`} A versão atual permanece salva até concluir.</p>}
              <div id="painel-mensagem" role="tabpanel" tabIndex={0} aria-labelledby={`aba-${canal}`} aria-label={`Mensagem de ${CANAIS.find(c => c.chave === canal)?.rotulo}`} className="rounded-xl border border-line bg-bg p-5 min-h-[220px]">
                {canal === "email" && <div className="border-b border-line pb-3 mb-4"><p className="text-xs text-muted mb-1">Assunto</p><p className="font-semibold text-sm break-words">{abordagem.email.assunto}</p></div>}
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink break-words">{canal === "email" ? abordagem.email.corpo : textoDoCanal(abordagem, canal)}</p>
              </div>
              <div className="flex justify-between gap-3 items-center mt-3 text-xs text-muted"><span>{(canal === "email" ? abordagem.email.corpo : textoDoCanal(abordagem, canal)).length} caracteres</span><span>Revise e personalize antes de usar</span></div>
              <div className="flex flex-wrap items-center gap-3 mt-5">
                <CopyButton texto={() => textoDoCanal(abordagem, canal)} rotulo="Copiar mensagem" />
                <button type="button" className="btn-ghost !w-auto" disabled={regenerando || salvandoEstrategia} onClick={() => regenerar("mais_personalizado")}>Personalizar mensagem</button>
                <MenuRegenerar lead={lead} desabilitado={regenerando || salvandoEstrategia} onEscolher={regenerar} />
              </div>
              {anterior?.canal === canal && <button type="button" className="btn-link text-sm mt-3" disabled={regenerando || salvandoEstrategia} onClick={voltarVersaoAnterior}>Voltar à versão anterior</button>}
              {erroRegenerar && <div role="alert" className="mt-3"><Aviso tom="danger">{erroRegenerar}</Aviso></div>}
              <details className="border-t border-line mt-5 pt-4"><summary className="text-sm font-semibold cursor-pointer text-accent-ink">Exportar e outras opções</summary><div className="mt-4"><Entregar id={lead?.id} titulo={lead ? `Abordagem para ${lead.nome}` : "Abordagem"} texto={() => textoDoCanal(abordagem, canal)} extras={crmConfigurado && lead && !lead.noCRM ? [{ rotulo: enviandoCRM ? "Enviando para o CRM…" : "Enviar para o CRM", onClick: enviarParaCRM }] : undefined} /></div></details>
              {lead?.noCRM && <div className="mt-3"><Chip nivel="positivo">No CRM</Chip></div>}
              {erroCRM && <div role="alert" className="mt-3"><Aviso tom="danger">{erroCRM}</Aviso></div>}
            </section>
          </div>
          {origemMeta && <div className="mt-5"><Origem meta={origemMeta} demoTexto="Exemplo ilustrativo de mensagem, sem usar IA." /></div>}
          <div className="card p-5 mt-5 flex flex-wrap items-center justify-between gap-4">
            <div><h2 className="font-semibold text-sm">Já fez o contato?</h2><p className="text-sm text-muted mt-1">Depois de enviar a mensagem, registre o avanço no funil.</p></div>
            {lead && (lead.status === "abordado" || lead.status === "respondeu") ? <Chip nivel="positivo">{ROTULO_STATUS_LEAD[lead.status]}</Chip> : <button type="button" className="btn-primary !w-auto max-sm:!w-full" disabled={marcando || regenerando || salvandoEstrategia} onClick={marcarAbordado}>{marcando ? "Registrando contato…" : "Marcar como abordado"}</button>}
          </div>
          {erroMarcar && <div role="alert" className="mt-3"><Aviso tom="danger">{erroMarcar}</Aviso></div>}
        </>}
      </main>
    </>
  );
}

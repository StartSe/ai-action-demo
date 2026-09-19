"use client";
// Estratégia e mensagens da abordagem (US-029 + US-030, Fase 5, SUBSTITUI a casca "Em breve" da US-027): a
// tela abre com o bloco "Estratégia para <primeiro nome>" já gerado (GET /api/leads/[id]/abordagem cria e
// salva na primeira visita, ver a rota) e cada item é editável por clique — a edição chama PUT, que regera
// as mensagens a partir da estratégia atualizada (lib/estrategia.ts:gerarMensagens), sem tocar nos outros
// campos. Abaixo, as três abas (LinkedIn/E-mail/WhatsApp) com o texto de cada canal e "Copiar" (US-030).
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Meta } from "@/lib/ai";
import { Aviso, Chip, Entregar, Origem, Topbar, useStatus } from "@/components/ui";
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

function TabButton({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
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

function LinhaEstrategia({
  campo,
  valor,
  onSalvar,
}: {
  campo: keyof EstrategiaAbordagem;
  valor: string;
  onSalvar: (campo: keyof EstrategiaAbordagem, valor: string) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor);
  const [salvando, setSalvando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editando) inputRef.current?.focus();
  }, [editando]);

  async function confirmar() {
    const novo = texto.trim();
    if (!novo || novo === valor) {
      setTexto(valor);
      setEditando(false);
      return;
    }
    setSalvando(true);
    try {
      await onSalvar(campo, novo);
    } finally {
      setSalvando(false);
      setEditando(false);
    }
  }

  return (
    <div className="flex items-start gap-3 py-2 border-b border-line last:border-0">
      <p className="w-[110px] shrink-0 text-[13px] font-semibold text-muted pt-1">{ROTULO_CAMPO_ESTRATEGIA[campo]}</p>
      {editando ? (
        <input
          ref={inputRef}
          className="flex-1 text-[14px] border border-line rounded-md px-2 py-1"
          value={texto}
          disabled={salvando}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); confirmar(); }
            if (e.key === "Escape") { setTexto(valor); setEditando(false); }
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => { setTexto(valor); setEditando(true); }}
          className="flex-1 text-left text-[14px] text-ink bg-transparent border-0 rounded-md px-2 py-1 -mx-2 hover:bg-accent-soft cursor-text"
        >
          {salvando ? "Salvando…" : valor}
        </button>
      )}
    </div>
  );
}

export function AbordagemLead({ leadId }: { leadId: string }) {
  const { status, erro } = useStatus();
  const [lead, setLead] = useState<LeadProspeccao | null>(null);
  const [abordagem, setAbordagem] = useState<AbordagemRegistro | null>(null);
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
    fetch(`/api/leads/${leadId}/abordagem`)
      .then(async (r) => {
        if (r.status === 404) { setNaoEncontrada(true); return; }
        const dados = (await r.json()) as { lead: LeadProspeccao; abordagem: AbordagemRegistro };
        setLead(dados.lead);
        setAbordagem(dados.abordagem);
      })
      .catch(() => setNaoEncontrada(true));
  }, [leadId]);

  async function salvarCampo(campo: keyof EstrategiaAbordagem, valor: string) {
    if (!abordagem) return;
    setErroSalvar(null);
    const estrategia = { ...abordagem.estrategia, [campo]: valor };
    try {
      const r = await fetch(`/api/leads/${leadId}/abordagem`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estrategia }),
      });
      const corpo = await r.json().catch(() => null);
      if (!r.ok) { setErroSalvar(corpo?.error || "Não foi possível salvar esta alteração."); return; }
      setAbordagem(corpo as AbordagemRegistro);
    } catch {
      setErroSalvar("Não foi possível salvar esta alteração.");
    }
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

      <main className="max-w-[640px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Link href={`/leads/${leadId}`} className="btn-link text-[13px] mb-4 inline-block">‹ Voltar para a ficha</Link>

        {naoEncontrada && <Aviso tom="danger">Esta pessoa não existe mais.</Aviso>}

        {!naoEncontrada && (
          <>
            <h1 className="titulo-painel mb-1.5">
              {lead ? `Estratégia para ${lead.nome.split(" ")[0]}` : "Preparando a estratégia…"}
            </h1>
            <p className="apoio mb-5">Concorde com o rumo ou clique em qualquer item para mudar.</p>

            {!abordagem ? (
              <div className="card flex flex-col gap-2" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="skeleton block w-full h-8" />
                ))}
              </div>
            ) : (
              <div className="card">
                {CAMPOS.map((campo) => (
                  <LinhaEstrategia key={campo} campo={campo} valor={abordagem.estrategia[campo]} onSalvar={salvarCampo} />
                ))}
              </div>
            )}

            {erroSalvar && <div className="mt-3"><Aviso tom="danger">{erroSalvar}</Aviso></div>}

            {abordagem && origemMeta && (
              <>
                <div className="mt-7">
                  <Origem meta={origemMeta} demoTexto="Exemplo ilustrativo de mensagem, sem usar IA." />
                </div>

                <div role="tablist" className="flex border-b border-line mb-4">
                  {CANAIS.map((c) => (
                    <TabButton key={c.chave} ativo={canal === c.chave} onClick={() => setCanal(c.chave)}>{c.rotulo}</TabButton>
                  ))}
                </div>

                <div className="card">
                  <p className="whitespace-pre-wrap text-[14px] text-ink mb-4">{textoDoCanal(abordagem, canal)}</p>
                  <div className="flex flex-col gap-3">
                    <Entregar
                      id={lead?.id}
                      titulo={lead ? `Abordagem para ${lead.nome}` : "Abordagem"}
                      texto={() => textoDoCanal(abordagem, canal)}
                      extras={
                        crmConfigurado && lead && !lead.noCRM
                          ? [{ rotulo: enviandoCRM ? "Enviando para o CRM…" : "Enviar para o CRM", onClick: enviarParaCRM }]
                          : undefined
                      }
                    />
                    <div className="flex items-center gap-3 flex-wrap">
                      {lead?.noCRM && <Chip nivel="positivo">No CRM</Chip>}
                      <MenuRegenerar lead={lead} desabilitado={regenerando} onEscolher={regenerar} />
                      {anterior?.canal === canal && (
                        <button type="button" className="btn-link text-[13px]" disabled={regenerando} onClick={voltarVersaoAnterior}>Voltar à versão anterior</button>
                      )}
                    </div>
                  </div>
                  {erroCRM && <div className="mt-3"><Aviso tom="danger">{erroCRM}</Aviso></div>}
                  {erroRegenerar && <div className="mt-3"><Aviso tom="danger">{erroRegenerar}</Aviso></div>}
                </div>

                <div className="mt-5 flex items-center gap-3">
                  {lead && (lead.status === "abordado" || lead.status === "respondeu") ? (
                    <Chip nivel="neutral">{ROTULO_STATUS_LEAD[lead.status]}</Chip>
                  ) : (
                    <button type="button" className="btn-primary" disabled={marcando} onClick={marcarAbordado}>
                      {marcando ? "Marcando…" : "Marcar como abordado"}
                    </button>
                  )}
                </div>
                {erroMarcar && <div className="mt-3"><Aviso tom="danger">{erroMarcar}</Aviso></div>}
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}

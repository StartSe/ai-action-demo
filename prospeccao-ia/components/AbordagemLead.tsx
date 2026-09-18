"use client";
// Estratégia da abordagem (US-029, Fase 5, SUBSTITUI a casca "Em breve" da US-027): a tela abre com o
// bloco "Estratégia para <primeiro nome>" já gerado (GET /api/leads/[id]/abordagem cria e salva na
// primeira visita, ver a rota) e cada item é editável por clique — a edição chama PUT, que regera as
// mensagens a partir da estratégia atualizada (lib/estrategia.ts:gerarMensagens), sem tocar nos outros
// campos. As três abas com os canais/"Copiar" (AC "mensagens dos três canais") são a US-030: este arquivo
// deve ser ESTENDIDO por ela, não duplicado.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Aviso, Topbar, useStatus } from "@/components/ui";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import { ROTULO_CAMPO_ESTRATEGIA } from "@/lib/rotulos";
import type { AbordagemRegistro, EstrategiaAbordagem, LeadProspeccao } from "@/lib/types";

const CAMPOS: (keyof EstrategiaAbordagem)[] = ["objetivo", "gancho", "dorProvavel", "tom", "cta"];

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
          </>
        )}
      </main>
    </>
  );
}

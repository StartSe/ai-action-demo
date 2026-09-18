"use client";
// Tela de andamento de uma prospecção (US-013): a mesma rota de polling (GET
// /api/prospeccoes/[id]/andamento) serve a carga inicial e o poll a cada 2 s, então sair da tela e
// voltar (ou recarregar) sempre mostra o andamento correto, inclusive já concluído. O poll só roda
// enquanto a aba está visível (document.visibilityState === "visible") e só enquanto o estado é
// "executando" — mesmo padrão de components/ConexaoWhatsApp.tsx (whatsapp-atendente): o efeito depende
// do ESTADO (primitivo), não do objeto inteiro de andamento, para não reiniciar o intervalo a cada poll.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, Topbar, useStatus, lerErro } from "@/components/ui";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import { ROTULO_MODO } from "@/lib/rotulos";
import { ETAPAS_PROSPECCAO } from "@/lib/execucao-etapas";
import type { Prospeccao } from "@/lib/types";

type Andamento = {
  prospeccao: Prospeccao;
  produtoNome: string;
  icpNome: string;
  contasEncontradas: number;
  leadsEncontrados: number;
};

const INTERVALO_POLL_MS = 2000;

export function ProspeccaoAndamento({ prospeccaoId }: { prospeccaoId: string }) {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [andamento, setAndamento] = useState<Andamento | null>(null);
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [repetindo, setRepetindo] = useState(false);
  const [erroRepetir, setErroRepetir] = useState<string | null>(null);

  const carregar = useCallback(() => {
    fetch(`/api/prospeccoes/${prospeccaoId}/andamento`)
      .then(async (r) => {
        if (r.status === 404) {
          setNaoEncontrada(true);
          return;
        }
        const dados = (await r.json()) as Andamento;
        setAndamento(dados);
      })
      .catch(() => { /* próxima consulta tenta de novo; a tela mantém o último andamento conhecido */ });
  }, [prospeccaoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (andamento?.prospeccao.estado !== "executando") return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") carregar();
    }, INTERVALO_POLL_MS);
    return () => clearInterval(id);
  }, [andamento?.prospeccao.estado, carregar]);

  async function repetir() {
    if (!andamento || repetindo) return;
    setRepetindo(true);
    setErroRepetir(null);
    try {
      const r = await fetch("/api/prospeccoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produtoId: andamento.prospeccao.produtoId,
          icpId: andamento.prospeccao.icpId,
          modo: andamento.prospeccao.modo,
          criterios: andamento.prospeccao.criterios,
        }),
      });
      if (!r.ok) {
        const lido = await lerErro(r);
        setErroRepetir(lido.mensagem);
        setRepetindo(false);
        return;
      }
      const nova = (await r.json()) as Prospeccao;
      router.push(`/prospeccoes/${nova.id}`);
    } catch (e) {
      const lido = await lerErro(e);
      setErroRepetir(lido.mensagem);
      setRepetindo(false);
    }
  }

  const indiceEtapaAtual = andamento ? ETAPAS_PROSPECCAO.findIndex((e) => e.chave === andamento.prospeccao.etapa) : -1;

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} usuario={status?.usuario} navegacao={NAVEGACAO_PROSPECCAO} />

      <main className="max-w-[720px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        {naoEncontrada ? (
          <Aviso tom="danger" acao={{ rotulo: "Nova prospecção", url: "/prospeccoes/nova" }}>
            Esta prospecção não existe mais.
          </Aviso>
        ) : !andamento ? (
          <div className="card p-6 flex flex-col gap-4" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className="skeleton block w-full h-11" />
            ))}
          </div>
        ) : (
          <>
            <h1 className="titulo-painel mb-1.5">Nova prospecção</h1>
            <p className="apoio mb-6">
              {andamento.produtoNome} · {andamento.icpNome} · {ROTULO_MODO[andamento.prospeccao.modo]}
            </p>

            {(andamento.prospeccao.estado === "executando" || andamento.prospeccao.estado === "pronta") && (
              <div className="card p-6 flex flex-col gap-4 mb-4">
                <ol className="flex flex-col gap-3">
                  {ETAPAS_PROSPECCAO.map((etapa, i) => {
                    const concluida = andamento.prospeccao.estado === "pronta" || i < indiceEtapaAtual;
                    const atual = andamento.prospeccao.estado === "executando" && i === indiceEtapaAtual;
                    return (
                      <li key={etapa.chave} className="flex items-center gap-3">
                        <span
                          className={`shrink-0 w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold ${
                            concluida ? "bg-ok text-white" : atual ? "border-2 border-accent" : "border-2 border-line"
                          }`}
                          aria-hidden="true"
                        >
                          {concluida ? "✓" : ""}
                        </span>
                        <span className={concluida ? "text-ink" : atual ? "text-ink font-semibold" : "text-muted"}>{etapa.rotulo}</span>
                        {atual && <span className="text-[12px] text-accent-ink" aria-live="polite">Em andamento…</span>}
                      </li>
                    );
                  })}
                </ol>
                <p className="text-[13px] text-muted">
                  {andamento.contasEncontradas} empresas · {andamento.leadsEncontrados} pessoas encontradas até agora
                </p>
              </div>
            )}

            {andamento.prospeccao.estado === "pronta" && (
              <div className="flex flex-col gap-3">
                <p className="font-semibold text-[15px]">Prospecção concluída</p>
                {andamento.prospeccao.erro && <Aviso tom="warn">{andamento.prospeccao.erro}</Aviso>}
                <p className="text-[13px] text-muted">
                  {andamento.contasEncontradas} empresas e {andamento.leadsEncontrados} pessoas encontradas.
                </p>
                <Link href="/leads" className="btn-link text-[13px] self-start">Ver leads</Link>
              </div>
            )}

            {andamento.prospeccao.estado === "falhou" && (
              <div className="flex flex-col gap-3">
                <Aviso tom="danger" acao={{ rotulo: repetindo ? "Repetindo…" : "Repetir", onClick: repetir }}>
                  {andamento.prospeccao.erro ?? "Não foi possível concluir esta prospecção."}
                </Aviso>
                {erroRepetir && <Aviso tom="danger">{erroRepetir}</Aviso>}
              </div>
            )}

            {andamento.prospeccao.estado === "cancelada" && (
              <Aviso tom="warn">Esta prospecção foi cancelada.</Aviso>
            )}
          </>
        )}
      </main>
    </>
  );
}

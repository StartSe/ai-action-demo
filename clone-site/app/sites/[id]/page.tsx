"use client";
// O site: cabeçalho com nome e estado, link público e o corpo por estado (rascunho → gerar; gerando → acompanhar;
// falhou → motivo e "Tentar de novo"; pronto → o resultado com prévia, entrega e versões). Ganha os painéis do
// workspace (agente, versões publicadas, imagens, métricas, domínio) na US-006.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Aviso, ErrorBox, Loading, lerErro } from "@/components/ui";
import { ChipEstado, INTERVALO_ACOMPANHAMENTO_MS, TempoGerando } from "@/components/MeusSites";
import { Resultado } from "@/components/ResultadoPagina";
import { TopbarSite } from "@/components/TopbarSite";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import { data } from "@/lib/formato";
import type { Pagina, Projeto } from "@/lib/types";

type Detalhe = { projeto: Projeto; pagina: Pagina | null; meta: Meta | null };

const ETAPAS_CARREGANDO = ["Lendo a referência...", "Reconhecendo a estrutura da página...", "Escrevendo o código com a sua marca...", "Conferindo o arquivo gerado..."];

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const gerando = detalhe?.projeto.estado === "gerando";

  useEffect(() => {
    let ativo = true;
    const carregar = () =>
      fetch(`/api/sites/${id}`)
        .then(async (r) => {
          if (r.status === 401) { router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`); return null; }
          if (!r.ok) throw new Error((await lerErro(r)).mensagem);
          return r.json() as Promise<Detalhe>;
        })
        .then((d) => { if (ativo && d) { setDetalhe(d); setErro(null); } })
        .catch(async (e) => { if (ativo) setErro((await lerErro(e)).mensagem); });
    carregar();
    if (!gerando) return () => { ativo = false; };
    const t = setInterval(carregar, INTERVALO_ACOMPANHAMENTO_MS);
    return () => { ativo = false; clearInterval(t); };
  }, [id, gerando, router]);

  // A pessoa abriu o site: o aviso do sino deixa de contar (só quando já terminou).
  const terminou = detalhe?.projeto.estado === "pronto" || detalhe?.projeto.estado === "falhou";
  useEffect(() => {
    if (terminou) fetch(`/api/sites/${id}/visto`, { method: "POST" }).catch(() => {});
  }, [id, terminou]);

  async function gerar() {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch(`/api/sites/${id}/gerar`, { method: "POST" });
      if (!r.ok && r.status !== 409) { setErro((await lerErro(r)).mensagem); return; }
      const corpo = await r.json();
      setDetalhe((d) => (d ? { ...d, projeto: corpo.projeto } : d));
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    } finally {
      setOcupado(false);
    }
  }

  const p = detalhe?.projeto;

  return (
    <>
      <TopbarSite />
      <main className="max-w-[1100px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <p className="mb-3 text-[13px]"><Link href="/" className="btn-link">Meus sites</Link></p>
        {!detalhe && !erro && <p className="text-muted text-sm" role="status">Carregando o site...</p>}
        {erro && !detalhe && <Aviso tom="danger">{erro}</Aviso>}

        {p && (
          <>
            <header className="mb-5 flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-[26px] max-md:text-[22px] leading-[1.15] font-extrabold tracking-[-0.02em] break-words">{p.nome}</h1>
                  <ChipEstado estado={p.estado} />
                </div>
                <p className="text-muted text-[13px] mt-1">
                  {p.marca?.nome ? `${p.marca.nome} · ` : ""}criado em {data(p.criadoEm, { comHora: true })}{p.terminadoEm ? ` · terminado em ${data(p.terminadoEm, { comHora: true })}` : ""}
                </p>
              </div>
              {p.estado === "pronto" && (
                <a href={`/s/${p.slug}`} target="_blank" rel="noopener noreferrer" className="btn-ghost">Abrir o link público</a>
              )}
            </header>

            {erro && <div className="mb-4"><Aviso tom="danger">{erro}</Aviso></div>}

            {p.estado === "rascunho" && (
              <div className="card p-6 flex flex-col gap-3">
                <p className="text-ink-2">Este site ainda não foi gerado.</p>
                <div>
                  <button type="button" className="btn-primary !w-auto" disabled={ocupado} onClick={gerar}>{ocupado ? "Enviando..." : "Gerar o site"}</button>
                </div>
              </div>
            )}

            {p.estado === "gerando" && (
              <div className="card p-6 flex flex-col gap-3">
                <Loading etapas={ETAPAS_CARREGANDO} />
                <p className="text-muted text-[13px]"><TempoGerando desde={p.atualizadoEm} /> · Você pode fechar esta tela ou ir para outra parte do app: avisamos no sino quando terminar.</p>
              </div>
            )}

            {p.estado === "falhou" && (
              <ErrorBox
                mensagem={p.erro?.mensagem ?? "Não foi possível gerar o site desta vez."}
                codigo={p.erro?.codigo as CodigoErroIA | undefined}
                acao={p.erro?.acao}
                onTentarNovamente={ocupado ? undefined : gerar}
              />
            )}

            {p.estado === "pronto" && detalhe?.pagina && detalhe.meta && (
              <Resultado key={detalhe.pagina.versoes.length} pagina={detalhe.pagina} meta={detalhe.meta} id={detalhe.pagina.id} />
            )}
          </>
        )}
      </main>
    </>
  );
}

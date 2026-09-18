"use client";
// Assistente de nova prospecção, 4 passos: produto/perfil ideal (US-009), jornada (US-010) e tipo de
// busca (US-011). O passo atual mora na barra de endereço (`?passo=1..4`), no mesmo padrão
// `history.pushState` + `popstate` já usado por components/Relatorios.tsx (whatsapp-atendente) — nunca
// `useSearchParams`, que obrigaria a embrulhar a página num `Suspense`. O passo 4 (US-012) ainda não
// existe: avançar além do passo 3 mostra um resumo do que foi escolhido e um "Em breve", igual às
// cascas de tela da US-002.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Aviso, Chip, Field, Topbar, useStatus } from "@/components/ui";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import { DESCRICAO_JORNADA, DESCRICAO_MODO, MODOS_POR_JORNADA, ROTULO_JORNADA, ROTULO_MODO } from "@/lib/rotulos";
import { ProdutoForm } from "@/components/ProdutoForm";
import type { ICP, Jornada, ModoProspeccao, Produto } from "@/lib/types";

const ULTIMO_PASSO_PRONTO = 3;
const TOTAL_PASSOS = 4;
const VOLTAR_PARA_AQUI = "/prospeccoes/nova";
const JORNADAS = ["b2b", "b2c"] as const;
const SUBTITULO_PASSO: Partial<Record<number, string>> = {
  1: "Produto e perfil ideal",
  2: "Quem você quer encontrar",
  3: "Como encontrar oportunidades",
};

type ProdutoComICPs = Produto & { icps: ICP[] };

function resumoICP(icp: ICP): string {
  const c = icp.criterios;
  const partes = (icp.jornada === "b2b" ? [c.setor, c.porte, c.localizacao] : [c.localizacao, c.ocupacao, c.faixaEtaria]).filter(Boolean);
  if (partes.length > 0) return partes.join(" · ");
  if (icp.personas.length > 0) return `Personas: ${icp.personas.join(", ")}`;
  return "Sem critérios definidos ainda.";
}

function lerPassoDoEndereco(): number {
  const p = Number(new URLSearchParams(location.search).get("passo"));
  return p >= 1 && p <= TOTAL_PASSOS ? p : 1;
}

export function ProspeccaoNova() {
  const { status, erro } = useStatus();
  const [passo, setPasso] = useState(1);
  const [produtos, setProdutos] = useState<ProdutoComICPs[] | null>(null);
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [icpId, setIcpId] = useState<string | null>(null);
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [modo, setModo] = useState<ModoProspeccao | null>(null);

  useEffect(() => {
    fetch("/api/produtos")
      .then((r) => r.json())
      .then((r) => setProdutos(r.itens))
      .catch(() => setProdutos([]));
  }, []);

  // Abertura da tela: o que vale é o que está na barra de endereço. Sai do corpo do efeito por um
  // setTimeout(0), mesmo padrão de components/setup.tsx (regra react-hooks/set-state-in-effect).
  useEffect(() => {
    const t = setTimeout(() => {
      setPasso(lerPassoDoEndereco());
      const params = new URLSearchParams(location.search);
      setProdutoId(params.get("produtoId"));
      setIcpId(params.get("icpId"));
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Voltar/avançar do navegador: o passo vem do endereço, nunca só do estado local.
  useEffect(() => {
    function aoNavegar() {
      setPasso(lerPassoDoEndereco());
    }
    window.addEventListener("popstate", aoNavegar);
    return () => window.removeEventListener("popstate", aoNavegar);
  }, []);

  function irParaPasso(novoPasso: number) {
    const params = new URLSearchParams(location.search);
    params.set("passo", String(novoPasso));
    history.pushState(null, "", `${location.pathname}?${params}`);
    setPasso(novoPasso);
  }

  const produtoSelecionado = produtos?.find((p) => p.id === produtoId) ?? null;
  const icpsDoProduto = produtoSelecionado?.icps ?? [];
  const padraoIcp = icpsDoProduto.length > 0 ? icpsDoProduto.reduce((a, b) => (a.criadoEm <= b.criadoEm ? a : b)) : null;
  const icpEfetivo = icpsDoProduto.find((i) => i.id === icpId) ?? padraoIcp;
  const jornadaEfetiva = jornada ?? icpEfetivo?.jornada ?? null;
  const modosDisponiveis = MODOS_POR_JORNADA[jornadaEfetiva ?? "b2b"];
  const modoEfetivo = modo && modosDisponiveis.includes(modo) ? modo : null;
  const podeContinuarPasso1 = Boolean(produtoSelecionado && icpEfetivo);
  const podeContinuarPasso2 = podeContinuarPasso1 && jornadaEfetiva !== null;
  const podeContinuarPasso3 = podeContinuarPasso2 && modoEfetivo !== null;
  const podeContinuar = passo === 3 ? podeContinuarPasso3 : passo === 2 ? podeContinuarPasso2 : podeContinuarPasso1;
  const linkCriarComIA = `/produtos/novo?ia=1&voltar=${encodeURIComponent(VOLTAR_PARA_AQUI)}`;

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} usuario={status?.usuario} navegacao={NAVEGACAO_PROSPECCAO} />

      <main className="max-w-[720px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel mb-1.5">Nova prospecção</h1>
        <p className="apoio mb-6">Passo {passo} de {TOTAL_PASSOS}{SUBTITULO_PASSO[passo] ? ` · ${SUBTITULO_PASSO[passo]}` : ""}</p>

        {passo > ULTIMO_PASSO_PRONTO ? (
          <div className="card p-6">
            <p className="text-[13px] text-muted mb-4">
              Produto: <strong className="text-ink">{produtoSelecionado?.nome}</strong> · Perfil: <strong className="text-ink">{icpEfetivo?.nome}</strong>
              {jornadaEfetiva && <> · {ROTULO_JORNADA[jornadaEfetiva]}</>}
              {modoEfetivo && <> · {ROTULO_MODO[modoEfetivo]}</>}
            </p>
            <p className="apoio mb-4">Em breve: o passo {passo} deste assistente.</p>
            <button type="button" className="btn-link text-[13px]" onClick={() => irParaPasso(1)}>Voltar</button>
          </div>
        ) : passo === 2 ? (
          !produtoSelecionado || !icpEfetivo ? (
            <Aviso tom="warn" acao={{ rotulo: "Escolher produto e perfil", onClick: () => irParaPasso(1) }}>
              Escolha um produto e um perfil ideal antes de continuar.
            </Aviso>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1" role="radiogroup" aria-label="Quem você quer encontrar">
                {JORNADAS.map((j) => (
                  <button
                    key={j}
                    type="button"
                    role="radio"
                    aria-checked={jornadaEfetiva === j}
                    className={`card p-5 text-left transition-colors ${jornadaEfetiva === j ? "border-accent bg-accent-soft" : "hover:bg-bg"}`}
                    onClick={() => setJornada(j)}
                  >
                    <p className="font-semibold text-[15px] mb-1">{ROTULO_JORNADA[j]}</p>
                    <p className="text-[13px] text-muted">{DESCRICAO_JORNADA[j]}</p>
                  </button>
                ))}
              </div>

              {jornadaEfetiva !== icpEfetivo.jornada && (
                <Aviso tom="warn" acao={{ rotulo: "Escolher outro perfil", onClick: () => irParaPasso(1) }}>
                  Os critérios do perfil &quot;{icpEfetivo.nome}&quot; são de {ROTULO_JORNADA[icpEfetivo.jornada]} e não se aplicam aqui.
                </Aviso>
              )}
            </div>
          )
        ) : passo === 3 ? (
          !produtoSelecionado || !icpEfetivo ? (
            <Aviso tom="warn" acao={{ rotulo: "Escolher produto e perfil", onClick: () => irParaPasso(1) }}>
              Escolha um produto e um perfil ideal antes de continuar.
            </Aviso>
          ) : (
            <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1" role="radiogroup" aria-label="Como você quer buscar">
              {modosDisponiveis.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={modoEfetivo === m}
                  className={`card p-5 text-left transition-colors ${modoEfetivo === m ? "border-accent bg-accent-soft" : "hover:bg-bg"}`}
                  onClick={() => setModo(m)}
                >
                  <p className="font-semibold text-[15px] mb-1">{ROTULO_MODO[m]}</p>
                  <p className="text-[13px] text-muted">{DESCRICAO_MODO[jornadaEfetiva ?? "b2b"][m]}</p>
                </button>
              ))}
            </div>
          )
        ) : produtos === null ? (
          <div className="card p-6 flex flex-col gap-4" aria-hidden="true">
            {[0, 1].map((i) => (
              <span key={i} className="skeleton block w-full h-11" />
            ))}
          </div>
        ) : produtos.length === 0 ? (
          <>
            <p className="apoio mb-4">Cadastre o que você vende para começar; o perfil ideal de cliente vem em seguida.</p>
            <ProdutoForm aoSalvar={(p) => { setProdutos([{ ...p, icps: [] }]); setProdutoId(p.id); setIcpId(null); }} />
            <p className="text-[13px] text-muted mt-4">
              Prefere começar por um site?{" "}
              <Link href={linkCriarComIA} className="btn-link text-[13px] !inline !w-auto">Criar com IA a partir do meu site</Link>
            </p>
          </>
        ) : (
          <div className="card p-6 flex flex-col gap-4">
            <Field label="Produto" htmlFor="produto" hint={produtoSelecionado?.descricao || undefined}>
              <select
                id="produto"
                className="input"
                value={produtoId ?? ""}
                onChange={(e) => { setProdutoId(e.target.value || null); setIcpId(null); }}
              >
                <option value="" disabled>Escolha um produto</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </Field>

            {produtoSelecionado && (
              icpsDoProduto.length === 0 ? (
                <Aviso tom="warn" acao={{ rotulo: "Criar perfil ideal", url: `/produtos/${produtoSelecionado.id}/icps/novo?voltar=${encodeURIComponent(VOLTAR_PARA_AQUI)}` }}>
                  Este produto ainda não tem um perfil ideal de cliente cadastrado.
                </Aviso>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="card p-4 bg-bg">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[14px]">{icpEfetivo!.nome}</span>
                        <Chip nivel="neutral">{ROTULO_JORNADA[icpEfetivo!.jornada]}</Chip>
                      </div>
                      <Link href={`/produtos/${produtoSelecionado.id}/icps/${icpEfetivo!.id}`} className="btn-link text-[13px]">Ver detalhes</Link>
                    </div>
                    <p className="text-[13px] text-muted mt-1.5">{resumoICP(icpEfetivo!)}</p>
                  </div>

                  {icpsDoProduto.length > 1 && (
                    <Field label="Usar perfil existente" htmlFor="perfil">
                      <select id="perfil" className="input" value={icpEfetivo!.id} onChange={(e) => setIcpId(e.target.value)}>
                        {icpsDoProduto.map((i) => (
                          <option key={i.id} value={i.id}>{i.nome}</option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>
              )
            )}

            <Link href={linkCriarComIA} className="btn-link text-[13px] self-start">Criar novo com IA</Link>
          </div>
        )}

        {passo <= ULTIMO_PASSO_PRONTO && (
          <div className="mt-6 flex items-center gap-4">
            {passo > 1 && (
              <button type="button" className="btn-link text-[13px]" onClick={() => irParaPasso(passo - 1)}>Voltar</button>
            )}
            <button type="button" className="btn-primary !w-auto max-md:!w-full" disabled={!podeContinuar} onClick={() => irParaPasso(passo + 1)}>Continuar</button>
          </div>
        )}
      </main>
    </>
  );
}

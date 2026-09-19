"use client";
// Assistente de nova prospecção, 4 passos: produto/perfil ideal (US-009), jornada (US-010), tipo de
// busca (US-011) e critérios (US-012). O passo atual mora na barra de endereço (`?passo=1..4`), no
// mesmo padrão `history.pushState` + `popstate` já usado por components/Relatorios.tsx
// (whatsapp-atendente) — nunca `useSearchParams`, que obrigaria a embrulhar a página num `Suspense`.
// O passo 4 é o último do assistente: seu botão primário já diz o que a busca vai fazer
// (ROTULO_ACAO_MODO) em vez de "Continuar" e, desde a US-013, dispara `POST /api/prospeccoes` de
// verdade e navega para `/prospeccoes/<id>` (a tela de execução) em vez de só mostrar um aviso.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, Chip, Field, Topbar, lerErro, useStatus } from "@/components/ui";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import { CriteriosProspeccaoForm, criteriosIniciais, type CriteriosBusca } from "@/components/CriteriosProspeccao";
import { DESCRICAO_JORNADA, DESCRICAO_MODO, MODOS_POR_JORNADA, ROTULO_ACAO_MODO, ROTULO_JORNADA, ROTULO_MODO } from "@/lib/rotulos";
import { ProdutoForm } from "@/components/ProdutoForm";
import type { ICP, Jornada, ModoProspeccao, Produto } from "@/lib/types";

const TOTAL_PASSOS = 4;
const VOLTAR_PARA_AQUI = "/prospeccoes/nova";
const JORNADAS = ["b2b", "b2c"] as const;
const SUBTITULO_PASSO: Partial<Record<number, string>> = {
  1: "Produto e perfil ideal",
  2: "Quem você quer encontrar",
  3: "Como encontrar oportunidades",
  4: "Critérios da busca",
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
  const router = useRouter();
  const [passo, setPasso] = useState(1);
  const [produtos, setProdutos] = useState<ProdutoComICPs[] | null>(null);
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [icpId, setIcpId] = useState<string | null>(null);
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [modo, setModo] = useState<ModoProspeccao | null>(null);
  const [criterios, setCriterios] = useState<CriteriosBusca | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const chaveCriteriosRef = useRef<string | null>(null);
  // Critérios já sugeridos por fora (US-038, "Ajustar critérios" de components/BuscaLivre.tsx): lido uma
  // única vez na abertura e consumido pelo efeito de derivação abaixo, para o passo 4 abrir com o que já
  // foi entendido em vez de recalcular do zero a partir do ICP.
  const criteriosSugeridosRef = useRef<CriteriosBusca | null>(null);

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
      const modoParam = params.get("modo");
      if (modoParam) setModo(modoParam as ModoProspeccao);
      const criteriosParam = params.get("criterios");
      if (criteriosParam) {
        try {
          criteriosSugeridosRef.current = JSON.parse(criteriosParam);
        } catch {
          // parâmetro corrompido: o passo 4 cai no padrão calculado a partir do ICP
        }
      }
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

  // Botão final do passo 4 (US-013): cria a prospecção de verdade e navega para a tela de execução.
  // Erro (400/404) mostra o aviso inline sem navegar; nenhum estado local precisa ser limpo, porque a
  // tela é trocada por completo ao navegar com sucesso.
  async function iniciarBusca() {
    if (!produtoId || !icpId || !modoEfetivo || !criterios || enviando) return;
    setEnviando(true);
    setErroEnvio(null);
    try {
      const r = await fetch("/api/prospeccoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId, icpId, modo: modoEfetivo, criterios }),
      });
      if (!r.ok) {
        const lido = await lerErro(r);
        setErroEnvio(lido.mensagem);
        setEnviando(false);
        return;
      }
      const prospeccao: { id: string } = await r.json();
      router.push(`/prospeccoes/${prospeccao.id}`);
    } catch (e) {
      const lido = await lerErro(e);
      setErroEnvio(lido.mensagem);
      setEnviando(false);
    }
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
  const podeContinuarPasso4 =
    podeContinuarPasso3 && criterios !== null && (modoEfetivo !== "empresa_unica" || criterios.empresaNome.trim().length > 0);
  const podeContinuar = passo === 4 ? podeContinuarPasso4 : passo === 3 ? podeContinuarPasso3 : passo === 2 ? podeContinuarPasso2 : podeContinuarPasso1;
  const linkCriarComIA = `/produtos/novo?ia=1&voltar=${encodeURIComponent(VOLTAR_PARA_AQUI)}`;

  // Critérios do passo 4 nascem dos valores do ICP só uma vez por combinação (perfil, modo): trocar o
  // perfil ou o tipo de busca nos passos anteriores gera um novo conjunto de valores iniciais, mas
  // editar um campo aqui não é sobrescrito enquanto a combinação não mudar.
  useEffect(() => {
    if (!icpEfetivo || !modoEfetivo) return;
    const chave = `${icpEfetivo.id}:${modoEfetivo}`;
    if (chaveCriteriosRef.current === chave) return;
    chaveCriteriosRef.current = chave;
    const sugerido = criteriosSugeridosRef.current;
    criteriosSugeridosRef.current = null;
    const t = setTimeout(() => {
      setCriterios(sugerido ?? criteriosIniciais(icpEfetivo, modoEfetivo, jornadaEfetiva ?? icpEfetivo.jornada));
    }, 0);
    return () => clearTimeout(t);
  }, [icpEfetivo, modoEfetivo, jornadaEfetiva]);

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} usuario={status?.usuario} navegacao={NAVEGACAO_PROSPECCAO} />

      <main className="max-w-[720px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <h1 className="titulo-painel mb-1.5">Nova prospecção</h1>
        <p className="apoio mb-6">Passo {passo} de {TOTAL_PASSOS}{SUBTITULO_PASSO[passo] ? ` · ${SUBTITULO_PASSO[passo]}` : ""}</p>

        {passo === 4 ? (
          !produtoSelecionado || !icpEfetivo || !modoEfetivo ? (
            <Aviso tom="warn" acao={{ rotulo: "Escolher tipo de busca", onClick: () => irParaPasso(!produtoSelecionado || !icpEfetivo ? 1 : 3) }}>
              Escolha o produto, o perfil e o tipo de busca antes de continuar.
            </Aviso>
          ) : !criterios ? (
            <div className="card p-6 flex flex-col gap-4" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} className="skeleton block w-full h-11" />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <CriteriosProspeccaoForm modo={modoEfetivo} jornada={jornadaEfetiva ?? icpEfetivo.jornada} icp={icpEfetivo} valor={criterios} onChange={setCriterios} />
              {erroEnvio && <Aviso tom="danger">{erroEnvio}</Aviso>}
            </div>
          )
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

        <div className="mt-6 flex items-center gap-4">
          {passo > 1 && (
            <button type="button" className="btn-link text-[13px]" onClick={() => irParaPasso(passo - 1)}>Voltar</button>
          )}
          <button
            type="button"
            className="btn-primary !w-auto max-md:!w-full"
            disabled={!podeContinuar || enviando}
            onClick={() => (passo < TOTAL_PASSOS ? irParaPasso(passo + 1) : iniciarBusca())}
          >
            {passo < TOTAL_PASSOS ? "Continuar" : enviando ? "Enviando…" : modoEfetivo ? ROTULO_ACAO_MODO[modoEfetivo] : "Continuar"}
          </button>
        </div>
      </main>
    </>
  );
}

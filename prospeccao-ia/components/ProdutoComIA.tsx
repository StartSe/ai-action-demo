"use client";
// Caminho "Criar com IA a partir do meu site" de /produtos/novo?ia=1 (US-007): pede só o endereço do
// site (ou um parágrafo colado), roda a análise em POST /api/produtos/analisar e abre o resultado no
// formulário de edição, editável campo a campo — nunca salvo direto. Salvar cria o produto e, em
// seguida, o ICP sugerido (dois POSTs, mesmo padrão de app/api/produtos e app/api/icps).
// `?voltar=<rota>` (US-009, ver components/ProspeccaoNova.tsx) troca o destino de "Salvar" para
// `<rota>?produtoId=<id>&icpId=<id>` em vez de /produtos — é como o passo 1 da nova prospecção volta
// para o fluxo depois de criar produto+perfil via IA. "Preencher manualmente" e "Cancelar" propagam o
// mesmo `voltar` para o formulário manual (ProdutoForm) continuar a cadeia.
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, Field, MaisDetalhes, Origem, Row } from "@/components/ui";
import { ProgressoProduto } from "./ProgressoProduto";
import { lerAnaliseProduto, type EtapaProduto } from "@/lib/produto-progresso";
import { CampoLista } from "@/components/CampoLista";
import type { Meta } from "@/lib/ai";
import type { CriteriosICP, SugestaoProduto } from "@/lib/types";

type Passo = "entrada" | "editar";

export function ProdutoComIA() {
  const router = useRouter();
  const [passo, setPasso] = useState<Passo>("entrada");
  const [entrada, setEntrada] = useState("");
  const [analisando, setAnalisando] = useState(false);
  const [etapa, setEtapa] = useState<EtapaProduto>("preparacao");
  const requisicao = useRef<AbortController | null>(null);
  useEffect(() => () => requisicao.current?.abort(), []);
  function cancelarAnalise() { requisicao.current?.abort(); }

  const [erroEntrada, setErroEntrada] = useState<string | null>(null);
  const [avisoLeitura, setAvisoLeitura] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [site, setSite] = useState("");
  const [propostaValor, setPropostaValor] = useState("");
  const [icpNome, setIcpNome] = useState("");
  const [criterios, setCriterios] = useState<CriteriosICP>({});
  const [personas, setPersonas] = useState<string[]>([]);
  const [dores, setDores] = useState<string[]>([]);
  const [sinais, setSinais] = useState<string[]>([]);

  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [manualPara, setManualPara] = useState("/produtos/novo");
  const [cancelarPara, setCancelarPara] = useState("/produtos");
  const entradaEraEndereco = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const voltar = new URLSearchParams(location.search).get("voltar");
      if (voltar) {
        setManualPara(`/produtos/novo?voltar=${encodeURIComponent(voltar)}`);
        setCancelarPara(voltar);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  async function analisar(e: FormEvent) {
    e.preventDefault();
    if (requisicao.current) return;
    const t = entrada.trim();
    if (!t) {
      setErroEntrada("Cole o endereço do site ou escreva um parágrafo sobre o produto.");
      return;
    }
    setErroEntrada(null);
    setAnalisando(true);
    setEtapa("preparacao");
    const controle = new AbortController();
    requisicao.current = controle;
    const signal = AbortSignal.any([controle.signal, AbortSignal.timeout(300_000)]);
    try {
      const resposta = await fetch("/api/produtos/analisar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        signal,
        body: JSON.stringify({ entrada: t }),
      });
      const corpo = await lerAnaliseProduto(resposta, setEtapa);
      signal.throwIfAborted();
      const sugestao: SugestaoProduto = corpo.sugestao;
      entradaEraEndereco.current = /^https?:\/\//i.test(t) || (!/\s/.test(t) && t.includes("."));
      setNome(sugestao.nome);
      setDescricao(sugestao.descricao);
      setSite(entradaEraEndereco.current ? (/^https?:\/\//i.test(t) ? t : `https://${t}`) : "");
      setPropostaValor(sugestao.propostaValor);
      setIcpNome(sugestao.icp.nome);
      setCriterios(sugestao.icp.criterios);
      setPersonas(sugestao.icp.personas);
      setDores(sugestao.icp.dores);
      setSinais(sugestao.icp.sinais);
      setAvisoLeitura(corpo.avisoLeitura || null);
      setMeta(corpo.meta);
      setPasso("editar");
    } catch (erro) {
      if (!controle.signal.aborted) setErroEntrada(signal.aborted
        ? "A análise demorou mais que o esperado. Tente novamente ou cole uma descrição do produto."
        : erro instanceof Error ? erro.message : "Não foi possível analisar agora. Tente de novo.");
    } finally {
      requisicao.current = null;
      setAnalisando(false);
    }
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErroSalvar(null);
    setSalvando(true);
    try {
      const respostaProduto = await fetch("/api/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, descricao, site, propostaValor }),
      });
      const produto = await respostaProduto.json().catch(() => null);
      if (!respostaProduto.ok) {
        setErroSalvar(produto?.error || "Não foi possível salvar o produto agora. Tente de novo.");
        setSalvando(false);
        return;
      }
      const respostaICP = await fetch("/api/icps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId: produto.id, nome: icpNome, jornada: "b2b", criterios, personas, dores, sinais }),
      });
      const icp = await respostaICP.json().catch(() => null);
      const voltar = new URLSearchParams(location.search).get("voltar");
      if (voltar) {
        router.push(`${voltar}${voltar.includes("?") ? "&" : "?"}produtoId=${produto.id}${icp?.id ? `&icpId=${icp.id}` : ""}`);
        return;
      }
      router.push("/produtos");
    } catch {
      setErroSalvar("Não foi possível salvar o produto agora. Tente de novo.");
      setSalvando(false);
    }
  }

  if (passo === "entrada") {
    return (
      <form onSubmit={analisar} className="card p-6" aria-busy={analisando}>
        {analisando && <ProgressoProduto etapa={etapa} endereco={/^https?:\/\//i.test(entrada.trim()) || (!/\s/.test(entrada.trim()) && entrada.includes("."))} cancelar={cancelarAnalise} />}
        {erroEntrada && (
          <div className="mb-4">
            <Aviso tom="danger">{erroEntrada}</Aviso>
          </div>
        )}
        <Field label="Endereço do site" htmlFor="entrada" hint="Ou cole um parágrafo sobre o produto, se preferir não usar um site.">
          <textarea
            id="entrada"
            disabled={analisando}
            className="input min-h-[100px] resize-y"
            placeholder="https://suaempresa.com.br"
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
          />
        </Field>
        <div className="flex items-center gap-4 mt-2">
          <button type="submit" className="btn-primary !w-auto max-md:!w-full" disabled={analisando}>{analisando ? "Analisando..." : "Analisar com IA"}</button>
          <Link href={manualPara} className="btn-link text-[13px]">Preencher manualmente</Link>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={salvar} className="card p-6">
      {meta && <Origem meta={meta} demoTexto="Exemplo ilustrativo a partir do CMMS da Zetta Manutenção Industrial." />}

      {avisoLeitura && (
        <div className="mb-4">
          <Aviso tom="warn">{avisoLeitura}</Aviso>
        </div>
      )}
      {erroSalvar && (
        <div className="mb-4">
          <Aviso tom="danger">{erroSalvar}</Aviso>
        </div>
      )}

      <Field label="Nome" htmlFor="nome">
        <input id="nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} required />
      </Field>
      <Field label="Proposta de valor" htmlFor="propostaValor" hint="O problema que o produto resolve e para quem.">
        <textarea id="propostaValor" className="input min-h-[64px] resize-y" value={propostaValor} onChange={(e) => setPropostaValor(e.target.value)} required />
      </Field>

      <h2 className="font-bold text-[15px] mt-1 mb-1">Perfil ideal sugerido</h2>
      <p className="text-muted text-sm mb-2">Revise os critérios, personas, dores e sinais antes de salvar.</p>

      <Field label="Nome do perfil" htmlFor="icpNome">
        <input id="icpNome" className="input" value={icpNome} onChange={(e) => setIcpNome(e.target.value)} required />
      </Field>
      <Row>
        <Field label="Setor" htmlFor="setor">
          <input id="setor" className="input" value={criterios.setor ?? ""} onChange={(e) => setCriterios((c) => ({ ...c, setor: e.target.value }))} />
        </Field>
        <Field label="Porte" htmlFor="porte">
          <input id="porte" className="input" value={criterios.porte ?? ""} onChange={(e) => setCriterios((c) => ({ ...c, porte: e.target.value }))} />
        </Field>
      </Row>

      <MaisDetalhes titulo="Mais detalhes do produto e do perfil">
        <Row>
          <Field label="Descrição" htmlFor="descricao" hint="Uma linha, para reconhecer o produto de relance.">
            <input id="descricao" className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </Field>
          <Field label="Site" htmlFor="site" hint="Opcional.">
            <input id="site" type="url" className="input" placeholder="https://" value={site} onChange={(e) => setSite(e.target.value)} />
          </Field>
        </Row>
        <Field label="Localização" htmlFor="localizacao" hint="Cidade, estado ou região.">
          <input id="localizacao" className="input" value={criterios.localizacao ?? ""} onChange={(e) => setCriterios((c) => ({ ...c, localizacao: e.target.value }))} />
        </Field>
        <CampoLista id="personas" label="Personas" hint="Cargos ou perfis de quem você fala com." placeholder="Ex.: gerente de manutenção" valores={personas} onChange={setPersonas} />
        <CampoLista id="dores" label="Problemas que resolvemos" hint="As dores que este produto ataca." placeholder="Ex.: manutenção reativa" valores={dores} onChange={setDores} />
        <CampoLista id="sinais" label="Sinais de intenção" hint="O que indica que é hora de abordar." placeholder="Ex.: abertura de nova unidade" valores={sinais} onChange={setSinais} />
      </MaisDetalhes>

      <div className="flex items-center gap-4 mt-2">
        <button type="submit" className="btn-primary !w-auto max-md:!w-full" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</button>
        <Link href={cancelarPara} className="btn-link text-[13px]">Cancelar</Link>
      </div>
    </form>
  );
}

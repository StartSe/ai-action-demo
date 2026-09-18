"use client";
// Caminho "Criar com IA a partir do meu site" de /produtos/novo?ia=1 (US-007): pede só o endereço do
// site (ou um parágrafo colado), roda a análise em POST /api/produtos/analisar e abre o resultado no
// formulário de edição, editável campo a campo — nunca salvo direto. Salvar cria o produto e, em
// seguida, o ICP sugerido (dois POSTs, mesmo padrão de app/api/produtos e app/api/icps).
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, Field, Origem } from "@/components/ui";
import { CampoLista } from "@/components/CampoLista";
import type { Meta } from "@/lib/ai";
import type { CriteriosICP, SugestaoProduto } from "@/lib/types";

type Passo = "entrada" | "editar";

export function ProdutoComIA() {
  const router = useRouter();
  const [passo, setPasso] = useState<Passo>("entrada");
  const [entrada, setEntrada] = useState("");
  const [analisando, setAnalisando] = useState(false);
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
  const entradaEraEndereco = useRef(false);

  async function analisar(e: FormEvent) {
    e.preventDefault();
    const t = entrada.trim();
    if (!t) {
      setErroEntrada("Cole o endereço do site ou escreva um parágrafo sobre o produto.");
      return;
    }
    setErroEntrada(null);
    setAnalisando(true);
    try {
      const resposta = await fetch("/api/produtos/analisar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entrada: t }),
      });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setErroEntrada(corpo?.error || "Não foi possível analisar agora. Tente de novo.");
        setAnalisando(false);
        return;
      }
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
    } catch {
      setErroEntrada("Não foi possível analisar agora. Tente de novo.");
    } finally {
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
      await fetch("/api/icps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId: produto.id, nome: icpNome, jornada: "b2b", criterios, personas, dores, sinais }),
      });
      router.push("/produtos");
    } catch {
      setErroSalvar("Não foi possível salvar o produto agora. Tente de novo.");
      setSalvando(false);
    }
  }

  if (passo === "entrada") {
    return (
      <form onSubmit={analisar} className="card p-6">
        {erroEntrada && (
          <div className="mb-4">
            <Aviso tom="danger">{erroEntrada}</Aviso>
          </div>
        )}
        <Field label="Endereço do site" htmlFor="entrada" hint="Ou cole um parágrafo sobre o produto, se preferir não usar um site.">
          <textarea
            id="entrada"
            className="input min-h-[100px] resize-y"
            placeholder="https://suaempresa.com.br"
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
          />
        </Field>
        <div className="flex items-center gap-4 mt-2">
          <button type="submit" className="btn-primary !w-auto max-md:!w-full" disabled={analisando}>{analisando ? "Analisando..." : "Analisar com IA"}</button>
          <Link href="/produtos/novo" className="btn-link text-[13px]">Preencher manualmente</Link>
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

      <Field label="Nome" htmlFor="nome" hint="Como o produto aparece nas suas prospecções.">
        <input id="nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} required />
      </Field>
      <Field label="Descrição" htmlFor="descricao" hint="Uma linha, para reconhecer o produto de relance.">
        <input id="descricao" className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </Field>
      <Field label="Site" htmlFor="site" hint="Opcional.">
        <input id="site" type="url" className="input" placeholder="https://" value={site} onChange={(e) => setSite(e.target.value)} />
      </Field>
      <Field label="Proposta de valor" htmlFor="propostaValor" hint="O problema que o produto resolve e para quem.">
        <textarea id="propostaValor" className="input min-h-[100px] resize-y" value={propostaValor} onChange={(e) => setPropostaValor(e.target.value)} required />
      </Field>

      <h2 className="font-bold text-[15px] mt-2 mb-1">Perfil ideal sugerido</h2>
      <p className="text-muted text-sm mb-4">Revise os critérios, personas, dores e sinais antes de salvar.</p>

      <Field label="Nome do perfil" htmlFor="icpNome" hint="Como este perfil aparece ao escolher uma prospecção.">
        <input id="icpNome" className="input" value={icpNome} onChange={(e) => setIcpNome(e.target.value)} required />
      </Field>
      <Field label="Setor" htmlFor="setor" hint="Segmento das empresas que combinam com este perfil.">
        <input id="setor" className="input" value={criterios.setor ?? ""} onChange={(e) => setCriterios((c) => ({ ...c, setor: e.target.value }))} />
      </Field>
      <Field label="Porte" htmlFor="porte" hint="Faixa de número de funcionários.">
        <input id="porte" className="input" value={criterios.porte ?? ""} onChange={(e) => setCriterios((c) => ({ ...c, porte: e.target.value }))} />
      </Field>
      <Field label="Localização" htmlFor="localizacao" hint="Cidade, estado ou região.">
        <input id="localizacao" className="input" value={criterios.localizacao ?? ""} onChange={(e) => setCriterios((c) => ({ ...c, localizacao: e.target.value }))} />
      </Field>

      <CampoLista id="personas" label="Personas" hint="Cargos ou perfis de quem você fala com." placeholder="Ex.: gerente de manutenção" valores={personas} onChange={setPersonas} />
      <CampoLista id="dores" label="Problemas que resolvemos" hint="As dores que este produto ataca." placeholder="Ex.: manutenção reativa" valores={dores} onChange={setDores} />
      <CampoLista id="sinais" label="Sinais de intenção" hint="O que indica que é hora de abordar." placeholder="Ex.: abertura de nova unidade" valores={sinais} onChange={setSinais} />

      <div className="flex items-center gap-4 mt-2">
        <button type="submit" className="btn-primary !w-auto max-md:!w-full" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</button>
        <Link href="/produtos" className="btn-link text-[13px]">Cancelar</Link>
      </div>
    </form>
  );
}

"use client";
// Formulário compartilhado por /produtos/novo e /produtos/[id] (US-005): sem produtoId, cria; com
// produtoId, busca o produto em GET /api/produtos/[id] e edita. O caminho de IA a partir do site
// (?ia=1, ver components/Produtos.tsx) é outra tela (components/ProdutoComIA.tsx, US-007), escolhida
// por components/ProdutoNovo.tsx antes deste formulário nascer — ele nunca lê o parâmetro sozinho.
// `aoSalvar` (US-009) é usado só quando o formulário nasce EMBUTIDO fora de /produtos/novo (o passo 1
// da nova prospecção, quando ainda não há produto cadastrado): recebe o produto criado e assume o
// controle da navegação; sem essa prop, o comportamento padrão (redirecionar a /produtos) continua.
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, Field } from "@/components/ui";
import type { Produto } from "@/lib/types";

export function ProdutoForm({ produtoId, aoSalvar }: { produtoId?: string; aoSalvar?: (produto: Produto) => void }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [site, setSite] = useState("");
  const [propostaValor, setPropostaValor] = useState("");
  const [carregando, setCarregando] = useState(Boolean(produtoId));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [cancelarPara, setCancelarPara] = useState("/produtos");
  const carregouRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const voltar = new URLSearchParams(location.search).get("voltar");
      if (voltar) setCancelarPara(voltar);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!produtoId || carregouRef.current) return;
    carregouRef.current = true;
    fetch(`/api/produtos/${produtoId}`)
      .then((r) => r.json())
      .then((p) => {
        setNome(p.nome ?? "");
        setDescricao(p.descricao ?? "");
        setSite(p.site ?? "");
        setPropostaValor(p.propostaValor ?? "");
      })
      .finally(() => setCarregando(false));
  }, [produtoId]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const resposta = await fetch(produtoId ? `/api/produtos/${produtoId}` : "/api/produtos", {
        method: produtoId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, descricao, site, propostaValor }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        setErro(corpo?.error || "Não foi possível salvar o produto agora. Tente de novo.");
        setSalvando(false);
        return;
      }
      const produto: Produto = await resposta.json();
      if (aoSalvar) {
        aoSalvar(produto);
        return;
      }
      const voltar = new URLSearchParams(location.search).get("voltar");
      if (voltar) {
        router.push(`${voltar}${voltar.includes("?") ? "&" : "?"}produtoId=${produto.id}`);
        return;
      }
      router.push("/produtos");
    } catch {
      setErro("Não foi possível salvar o produto agora. Tente de novo.");
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <div className="card p-6 flex flex-col gap-4" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="skeleton block w-full h-11" />
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={salvar} className="card p-6">
      {erro && (
        <div className="mb-4">
          <Aviso tom="danger">{erro}</Aviso>
        </div>
      )}

      <Field label="Nome" htmlFor="nome" hint="Como o produto aparece nas suas prospecções.">
        <input id="nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} required />
      </Field>

      <Field label="Descrição" htmlFor="descricao" hint="Uma linha, para reconhecer o produto de relance.">
        <input id="descricao" className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </Field>

      <Field label="Site" htmlFor="site" hint="Opcional. Usado para criar com IA a partir do site.">
        <input id="site" type="url" className="input" placeholder="https://" value={site} onChange={(e) => setSite(e.target.value)} />
      </Field>

      <Field label="Proposta de valor" htmlFor="propostaValor" hint="O problema que o produto resolve e para quem.">
        <textarea id="propostaValor" className="input min-h-[120px] resize-y" value={propostaValor} onChange={(e) => setPropostaValor(e.target.value)} required />
      </Field>

      <div className="flex items-center gap-4 mt-2">
        <button type="submit" className="btn-primary !w-auto max-md:!w-full" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</button>
        <Link href={cancelarPara} className="btn-link text-[13px]">Cancelar</Link>
      </div>
    </form>
  );
}

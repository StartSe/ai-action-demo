"use client";
// Biblioteca de produtos (US-003): o que a empresa vende, cadastrado uma vez e reaproveitado em
// quantos treinos o gestor quiser. É o primeiro passo do "Comece em 3 passos" da Home.
//
// O cadastro é um formulário inline (sem modal, como o de vendedor em app/page.tsx): nome, categoria e
// uma descrição curta. Ensinar o produto à IA — página, materiais e ficha — é a tela de edição, que
// chega nas US-004/US-005/US-006; até lá "Editar" leva para o detalhe com o que já existe.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AvisoExemplo } from "@/components/AvisoExemplo";
import { Chip, Empty, ErrorBox, Field, Topbar, data, lerErro, useConfirmacao, useStatus, type ErroLido } from "@/components/ui";

type ProdutoLista = {
  id: string;
  nome: string;
  descricao?: string;
  categoria?: string;
  status: "rascunho" | "pronto";
  exemplo: boolean;
  materiais: number;
  simulacoes: number;
  criadoEm: string;
  atualizadoEm: string;
};

function IconeProduto() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M32 10 54 21v22L32 54 10 43V21z" />
      <path d="M10 21l22 11 22-11" />
      <path d="M32 32v22" />
    </svg>
  );
}

/** "3 materiais" / "1 material" / "Sem material ainda" — plural resolvido aqui, não no meio do JSX. */
function contagem(n: number, singular: string, plural: string, vazio: string) {
  if (n === 0) return vazio;
  return `${n} ${n === 1 ? singular : plural}`;
}

export default function Page() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const { status, erro } = useStatus();
  const { confirmar, Dialogo } = useConfirmacao();

  const [itens, setItens] = useState<ProdutoLista[] | null>(null);
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);
  const [cadastrando, setCadastrando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [descricao, setDescricao] = useState("");

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/produtos");
      if (!r.ok) throw r;
      const corpo = await r.json();
      setItens(corpo.itens);
    } catch (e) {
      setErroTela(await lerErro(e));
      setItens([]);
    }
  }, []);

  // A busca inicial fica em forma de corrente (`fetch().then()`), não `await carregar()`: a regra
  // `react-hooks/set-state-in-effect` do eslint-plugin-react-hooks@7 acusa qualquer chamada direta a
  // uma função que mexe em estado dentro do corpo de um efeito, mesmo sendo assíncrona. Mesmo padrão
  // já usado em app/historico/page.tsx e app/page.tsx.
  useEffect(() => {
    fetch("/api/produtos")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo) => setItens(corpo.itens))
      .catch(async (e) => {
        setErroTela(await lerErro(e));
        setItens([]);
      });
  }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if ((!nome.trim() && !url.trim()) || salvando) return;
    setSalvando(true);
    setErroTela(null);
    try {
      const r = await fetch("/api/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() || undefined, nome: nome.trim(), categoria: categoria.trim() || undefined, descricao: descricao.trim() || undefined }),
      });
      if (!r.ok) throw r;
      const produto = await r.json();
      if (url.trim()) {
        sessionStorage.setItem(`importacao-${produto.id}`, produto.aviso || "Página importada.");
        router.push(`/produtos/${produto.id}`);
      }
      setUrl("");
      setNome("");
      setCategoria("");
      setDescricao("");
      setCadastrando(false);
      await carregar();
    } catch (e) {
      setErroTela(await lerErro(e));
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(p: ProdutoLista) {
    const aviso =
      p.simulacoes > 0
        ? `Apagar "${p.nome}"? ${contagem(p.simulacoes, "treino usa", "treinos usam", "")} este produto.`
        : `Apagar "${p.nome}" e os materiais dele?`;
    if (!(await confirmar(aviso, { confirmarRotulo: "Apagar" }))) return;
    setErroTela(null);
    try {
      const r = await fetch(`/api/produtos/${p.id}`, { method: "DELETE" });
      if (!r.ok) throw r;
      await carregar();
    } catch (e) {
      setErroTela(await lerErro(e));
    }
  }

  const temExemplo = itens?.some((p) => p.exemplo) ?? false;

  return (
    <>
      <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[980px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <div className="flex items-start justify-between gap-4 mb-6 max-md:flex-col max-md:gap-3">
          <div>
            <h1 className="titulo-painel mb-1.5">Produtos</h1>
            <p className="apoio">O que sua empresa vende, para a IA treinar a venda certa.</p>
          </div>
          {!cadastrando && (
            <button type="button" className="btn-primary !w-auto shrink-0 max-md:!w-full" onClick={() => setCadastrando(true)}>
              + Novo produto
            </button>
          )}
        </div>

        {erroTela && <div className="mb-5"><ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao} /></div>}

        {cadastrando && (
          <form className="card p-5 mb-5" onSubmit={salvar}>
            <h2 className="font-bold text-[15px] mb-3.5">Novo produto</h2>
            <div className="mb-3">
              <Field label="Link da página de vendas" htmlFor="produto-url" hint="Opcional. Importe o produto pela LP ou preencha os campos abaixo. O nome pode ser obtido da página.">
                <input id="produto-url" type="url" className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://suaempresa.com/produto" />
              </Field>
            </div>
            <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3 mb-3">
              <Field label="Nome" htmlFor="produto-nome">
                <input id="produto-nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Plataforma de gestão" autoFocus />
              </Field>
              <Field label="Categoria" htmlFor="produto-categoria" hint="Opcional. Ajuda a organizar a lista.">
                <input id="produto-categoria" className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex.: Software" />
              </Field>
            </div>
            <Field label="Descrição" htmlFor="produto-descricao">
              <input id="produto-descricao" className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Uma frase sobre o que ele resolve" />
            </Field>
            <div className="flex gap-2.5 mt-4">
              <button type="submit" className="btn-primary !w-auto" disabled={(!nome.trim() && !url.trim()) || salvando}>
                {salvando ? (url.trim() ? "Importando página e preparando ficha..." : "Salvando...") : (url.trim() ? "Importar produto" : "Salvar produto")}
              </button>
              <button type="button" className="btn-ghost !w-auto" onClick={() => setCadastrando(false)}>Cancelar</button>
            </div>
          </form>
        )}

        {temExemplo && (
          <AvisoExemplo>
            O produto abaixo é um exemplo, com a ficha já pronta; ele some quando você cadastrar o primeiro produto de verdade.
          </AvisoExemplo>
        )}

        {itens === null ? (
          <p className="text-muted text-sm">Carregando...</p>
        ) : itens.length === 0 ? (
          <Empty
            ilustracao={<IconeProduto />}
            titulo="Nenhum produto cadastrado"
            descricao="Cadastre o que seu time vende: a IA usa esse material para simular o cliente e avaliar a conversa."
            acao="Cadastrar meu primeiro produto"
            onAcao={() => setCadastrando(true)}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {itens.map((p) => (
              <article key={p.id} className="card px-5 py-4">
                <div className="flex items-start justify-between gap-3 mb-1.5 max-md:flex-col max-md:gap-1.5">
                  <div className="min-w-0">
                    <h2 className="font-bold text-[16px] truncate">{p.nome}</h2>
                    {p.descricao && <p className="text-muted text-sm mt-0.5 line-clamp-2">{p.descricao}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {p.exemplo && <Chip nivel="neutral">Exemplo</Chip>}
                    {p.categoria && <Chip nivel="cinza">{p.categoria}</Chip>}
                    <Chip nivel={p.status === "pronto" ? "positivo" : "neutro"}>{p.status === "pronto" ? "Ficha pronta" : "Rascunho"}</Chip>
                  </div>
                </div>

                <p className="text-[13px] text-muted mb-3">
                  {contagem(p.materiais, "material", "materiais", "Sem material ainda")} ·{" "}
                  {contagem(p.simulacoes, "treino", "treinos", "Nenhum treino ainda")} · atualizado em {data(p.atualizadoEm)}
                </p>

                <div className="flex items-center gap-4 flex-wrap">
                  <Link href={`/produtos/${p.id}`} className="btn-link">Editar</Link>
                  <Link href={`/simulacoes/nova?produto=${p.id}`} className="btn-link">Criar treino</Link>
                  <button type="button" className="btn-link !text-danger" onClick={() => apagar(p)}>Apagar</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
      {Dialogo}
    </>
  );
}

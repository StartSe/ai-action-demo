"use client";
// Um produto: os dados básicos, os materiais que ensinam a IA e a ficha ("Entendemos seu produto").
//
// Nesta história (US-003) só os dados básicos e a lista de materiais existem. A importação da página
// (US-004), o envio de documentos e o texto livre (US-005) e a ficha gerada pela IA (US-006) entram
// nos blocos já reservados abaixo, sem mudar o desenho da tela.
import Link from "next/link";
import { use, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Chip, ErrorBox, Field, Section, Topbar, data, lerErro, useConfirmacao, useStatus, type ErroLido } from "@/components/ui";

type Produto = {
  id: string;
  nome: string;
  descricao?: string;
  categoria?: string;
  status: "rascunho" | "pronto";
  exemplo: boolean;
  criadoEm: string;
  atualizadoEm: string;
};

type Fonte = { id: string; tipo: "landing" | "documento" | "texto"; origem: string; conteudo: string; criadoEm: string };

const ROTULO_FONTE: Record<Fonte["tipo"], string> = { landing: "Página", documento: "Documento", texto: "Texto" };

/** "~3.200 palavras": o tamanho do material em algo que o gestor consegue julgar. */
function palavras(conteudo: string) {
  const total = conteudo.trim().split(/\s+/).filter(Boolean).length;
  return `~${total.toLocaleString("pt-BR")} palavra${total === 1 ? "" : "s"}`;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { status, erro } = useStatus();
  const { confirmar, Dialogo } = useConfirmacao();
  const router = useRouter();

  const [produto, setProduto] = useState<Produto | null>(null);
  const [fontes, setFontes] = useState<Fonte[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [descricao, setDescricao] = useState("");

  // Busca em forma de corrente (`fetch().then()`) em vez de `await carregar()`: a regra
  // `react-hooks/set-state-in-effect` do eslint-plugin-react-hooks@7 acusa qualquer chamada direta a
  // uma função que mexe em estado dentro do corpo de um efeito, mesmo sendo assíncrona. Mesmo padrão
  // já usado em app/historico/page.tsx e app/page.tsx.
  useEffect(() => {
    fetch(`/api/produtos/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo) => {
        setProduto(corpo.produto);
        setFontes(corpo.fontes ?? []);
        setNome(corpo.produto.nome);
        setCategoria(corpo.produto.categoria ?? "");
        setDescricao(corpo.produto.descricao ?? "");
        setCarregando(false);
      })
      .catch(async (e) => {
        setErroTela(await lerErro(e));
        setCarregando(false);
      });
  }, [id]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim() || salvando) return;
    setSalvando(true);
    setErroTela(null);
    setSalvo(false);
    try {
      const r = await fetch(`/api/produtos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), categoria: categoria.trim(), descricao: descricao.trim() }),
      });
      if (!r.ok) throw r;
      setProduto(await r.json());
      setSalvo(true);
    } catch (e) {
      setErroTela(await lerErro(e));
    } finally {
      setSalvando(false);
    }
  }

  async function apagar() {
    if (!produto) return;
    if (!(await confirmar(`Apagar "${produto.nome}" e os materiais dele?`, { confirmarRotulo: "Apagar" }))) return;
    setErroTela(null);
    try {
      const r = await fetch(`/api/produtos/${id}`, { method: "DELETE" });
      if (!r.ok) throw r;
      router.push("/produtos");
    } catch (e) {
      setErroTela(await lerErro(e));
    }
  }

  return (
    <>
      <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Link href="/produtos" className="btn-link text-[13px] mb-3 inline-block">&larr; Produtos</Link>

        {carregando ? (
          <p className="text-muted text-sm">Carregando...</p>
        ) : !produto ? (
          <ErrorBox mensagem={erroTela?.mensagem ?? "Esse produto não existe mais."} acao={{ rotulo: "Voltar para Produtos", url: "/produtos" }} />
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 mb-6 max-md:flex-col max-md:gap-2">
              <div className="min-w-0">
                <h1 className="titulo-painel mb-1.5">{produto.nome}</h1>
                <p className="apoio">Quanto mais a IA souber deste produto, mais real fica o treino.</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {produto.exemplo && <Chip nivel="neutral">Exemplo</Chip>}
                <Chip nivel={produto.status === "pronto" ? "positivo" : "neutro"}>{produto.status === "pronto" ? "Ficha pronta" : "Rascunho"}</Chip>
              </div>
            </div>

            {erroTela && <div className="mb-5"><ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao} /></div>}

            <form className="card p-5 mb-6" onSubmit={salvar}>
              <h2 className="font-bold text-[15px] mb-3.5">Dados do produto</h2>
              <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3 mb-3">
                <Field label="Nome" htmlFor="produto-nome">
                  <input id="produto-nome" className="input" value={nome} onChange={(e) => { setNome(e.target.value); setSalvo(false); }} />
                </Field>
                <Field label="Categoria" htmlFor="produto-categoria">
                  <input id="produto-categoria" className="input" value={categoria} onChange={(e) => { setCategoria(e.target.value); setSalvo(false); }} placeholder="Ex.: Software" />
                </Field>
              </div>
              <Field label="Descrição" htmlFor="produto-descricao">
                <input id="produto-descricao" className="input" value={descricao} onChange={(e) => { setDescricao(e.target.value); setSalvo(false); }} placeholder="Uma frase sobre o que ele resolve" />
              </Field>
              <div className="flex items-center gap-3 mt-4">
                <button type="submit" className="btn-primary !w-auto" disabled={!nome.trim() || salvando}>
                  {salvando ? "Salvando..." : "Salvar"}
                </button>
                {salvo && <span className="text-[13px] text-ok font-semibold">Salvo.</span>}
              </div>
            </form>

            <Section titulo="Materiais">
              {fontes.length === 0 ? (
                <Aviso tom="warn">
                  Este produto ainda não tem material. Em breve você vai poder importar a página do produto e enviar a apresentação comercial aqui.
                </Aviso>
              ) : (
                <div className="flex flex-col gap-2">
                  {fontes.map((f) => (
                    <div key={f.id} className="card px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{f.origem}</p>
                        <p className="text-[12.5px] text-muted">{ROTULO_FONTE[f.tipo]} · {palavras(f.conteudo)} · {data(f.criadoEm)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <div className="mt-8 pt-5 border-t border-line flex items-center gap-4 flex-wrap">
              <Link href={`/simulacoes/nova?produto=${produto.id}`} className="btn-link">Criar treino com este produto</Link>
              <button type="button" className="btn-link !text-danger" onClick={apagar}>Apagar produto</button>
            </div>
          </>
        )}
      </main>
      {Dialogo}
    </>
  );
}

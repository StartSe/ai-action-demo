"use client";
// Cadastro por link ou manual; a importação abre a revisão com sugestões editáveis.
import Link from "next/link";
import { Icone, MenuAcoes } from "@/components/MenuAcoes";
import { ResumoLista, SemCorrespondencia, normalizarBusca } from "@/components/ListaGestao";
import { ProgressoImportacao } from "@/components/ProgressoImportacao";
import { ErroImportacao, lerImportacao } from "@/lib/ler-importacao";
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
  const [modo, setModo] = useState<"link" | "manual">("link");
  const [etapa, setEtapa] = useState("pagina");
  const [url, setUrl] = useState("");
  const { status, erro } = useStatus();
  const { confirmar, Dialogo } = useConfirmacao();

  const [itens, setItens] = useState<ProdutoLista[] | null>(null);
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);
  const [cadastrando, setCadastrando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [descricao, setDescricao] = useState("");

  const carregar = useCallback(async () => {
    setErroTela(null);
    try {
      const r = await fetch("/api/produtos");
      if (!r.ok) throw r;
      const corpo = await r.json();
      setItens(corpo.itens);
    } catch (e) {
      setErroTela(e instanceof ErroImportacao ? { mensagem: e.message } : await lerErro(e));
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
        setErroTela(e instanceof ErroImportacao ? { mensagem: e.message } : await lerErro(e));
        setItens([]);
      });
  }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if ((modo === "link" ? !url.trim() : !nome.trim()) || salvando) return;
    setSalvando(true);
    setEtapa("pagina");
    setErroTela(null);
    let navegando = false;
    try {
      const r = await fetch("/api/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify(modo === "link" ? { url: url.trim() } : { nome: nome.trim(), categoria: categoria.trim(), descricao: descricao.trim() }),
      });
      if (!r.ok) throw r;
      const produto = await lerImportacao(r, setEtapa);
      if (modo === "link") {
        setEtapa("salvando");
        sessionStorage.setItem(`importacao-${produto.id}`, produto.aviso || "Página importada.");
        navegando = true;
        router.push(`/produtos/${produto.id}`);
        return;
      }
      setUrl("");
      setNome("");
      setCategoria("");
      setDescricao("");
      setCadastrando(false);
      await carregar();
    } catch (e) {
      setErroTela(e instanceof ErroImportacao ? { mensagem: e.message } : await lerErro(e));
    } finally {
      if (!navegando) setSalvando(false);
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
      setErroTela(e instanceof ErroImportacao ? { mensagem: e.message } : await lerErro(e));
    }
  }

  const visiveis = (itens ?? []).filter(p => (filtro === "todos" || p.status === filtro) && normalizarBusca(`${p.nome} ${p.categoria ?? ""} ${p.descricao ?? ""}`).includes(normalizarBusca(busca.trim())));
  const temExemplo = itens?.some((p) => p.exemplo) ?? false;

  return (
    <>
      <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={status} erro={erro} usuario={status?.usuario} />

      <main className="gestao-main">
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

        {cadastrando && salvando && modo === "link" ? <ProgressoImportacao etapa={etapa} comIA={status?.ai !== false} /> : cadastrando && (
          <form className="card p-5 mb-5" onSubmit={salvar}>
            <h2 className="font-bold text-[15px] mb-3.5">Novo produto</h2>
            <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3 mb-6" aria-label="Como cadastrar">
              <button type="button" aria-pressed={modo === "link"} disabled={salvando} onClick={() => setModo("link")} className={`text-left rounded-xl border p-4 ${modo === "link" ? "border-accent bg-accent/5" : "border-line"}`}>
                <span className="font-semibold block">Importar pelo link</span><span className="text-sm text-muted">A IA prepara o cadastro para você revisar.</span>
              </button>
              <button type="button" aria-pressed={modo === "manual"} disabled={salvando} onClick={() => setModo("manual")} className={`text-left rounded-xl border p-4 ${modo === "manual" ? "border-accent bg-accent/5" : "border-line"}`}>
                <span className="font-semibold block">Preencher manualmente</span><span className="text-sm text-muted">Comece com os dados que você já tem.</span>
              </button>
            </div>
            {modo === "link" ? <div className="mb-3">
              <Field label="Link da página de vendas" htmlFor="produto-url" hint="Cole a página do produto. Vamos sugerir nome, descrição, público e argumentos de venda. Você poderá editar tudo na próxima etapa.">
                <input id="produto-url" type="url" required className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://suaempresa.com/produto" />
              </Field>
              {status?.ai === false && <p className="text-sm text-muted mt-3">A página será salva como material. Para receber sugestões, conecte a IA em Configurações.</p>}
            </div> : <>
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
            </>}
            <div className="flex gap-2.5 mt-4">
              <button type="submit" className="btn-primary !w-auto" disabled={(modo === "link" ? !url.trim() : !nome.trim()) || salvando}>
                {salvando ? "Salvando..." : modo === "link" ? "Importar e preparar sugestões" : "Criar produto"}
              </button>
              <button type="button" className="btn-ghost !w-auto" disabled={salvando} onClick={() => setCadastrando(false)}>Cancelar</button>
            </div>
          </form>
        )}

        {!salvando && temExemplo && (
          <AvisoExemplo>
            O produto abaixo é um exemplo, com a ficha já pronta; ele some quando você cadastrar o primeiro produto de verdade.
          </AvisoExemplo>
        )}

        {!cadastrando && itens && itens.length > 0 && <>
          <ResumoLista itens={[
            { rotulo: "Produtos cadastrados", valor: itens.length },
            { rotulo: "Fichas prontas", valor: itens.filter(p => p.status === "pronto").length },
            { rotulo: "Fichas em rascunho", valor: itens.filter(p => p.status === "rascunho").length, detalhe: "Complete a ficha para contextualizar o treino" },
          ]} />
          <div className="list-toolbar">
            <input type="search" className="input md:!w-[360px]" aria-label="Buscar produto" placeholder="Buscar por produto ou categoria" value={busca} onChange={e => setBusca(e.target.value)} />
            <select className="input md:!w-auto" aria-label="Situação da ficha" value={filtro} onChange={e => setFiltro(e.target.value)}>
              <option value="todos">Todas as fichas</option><option value="pronto">Fichas prontas</option><option value="rascunho">Rascunhos</option>
            </select>
          </div>
          <p className="text-xs text-muted mb-3" role="status">{visiveis.length} de {itens.length} produtos</p>
        </>}

        {!cadastrando && (itens === null ? (
          <p role="status" className="text-muted text-sm">Carregando produtos...</p>
        ) : erroTela && itens.length === 0 ? <button className="btn-ghost" onClick={carregar}>Tentar novamente</button> : itens.length === 0 ? (
          <Empty
            ilustracao={<IconeProduto />}
            titulo="Nenhum produto cadastrado"
            descricao="Cadastre o que seu time vende: a IA usa esse material para simular o cliente e avaliar a conversa."
            acao="Cadastrar meu primeiro produto"
            onAcao={() => setCadastrando(true)}
          />
        ) : (
          visiveis.length === 0 ? <SemCorrespondencia onLimpar={() => { setBusca(""); setFiltro("todos"); }} /> : <div className="grid md:grid-cols-2 gap-4">
            {visiveis.map((p) => (
              <article key={p.id} className="card p-5 flex flex-col">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h2 className="font-bold text-lg break-words"><Link className="hover:text-accent-ink" href={`/produtos/${p.id}`}>{p.nome}</Link></h2>
                    {p.descricao && <p className="text-muted text-sm mt-0.5 line-clamp-2">{p.descricao}</p>}
                  </div>
                  <MenuAcoes rotulo={`Opções do produto ${p.nome}`} itens={[
                    { rotulo: "Editar produto", icone: "editar", href: `/produtos/${p.id}` },
                    { rotulo: "Apagar produto", icone: "apagar", perigo: true, onClick: () => void apagar(p) },
                  ]} />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mb-4">
                  {p.exemplo && <Chip nivel="neutral">Exemplo</Chip>}
                  {p.categoria && <Chip nivel="cinza">{p.categoria}</Chip>}
                  <Chip nivel={p.status === "pronto" ? "positivo" : "neutro"}>{p.status === "pronto" ? "Ficha pronta" : "Rascunho"}</Chip>
                </div>

                <p className="text-[13px] text-muted mb-3">
                  {contagem(p.materiais, "material", "materiais", "Sem material ainda")} ·{" "}
                  {contagem(p.simulacoes, "treino", "treinos", "Nenhum treino ainda")} · atualizado em {data(p.atualizadoEm)}
                </p>

                <div className="flex items-center gap-3 flex-wrap border-t border-line pt-4 mt-auto">
                  <Link href={`/simulacoes/nova?produto=${p.id}`} className="btn-primary !w-auto !h-11"><Icone nome="adicionar" />Criar treino</Link>
                  <Link href={`/produtos/${p.id}`} className="btn-link inline-flex gap-2 items-center min-h-11"><Icone nome="editar" />Editar ficha</Link>
                </div>
              </article>
            ))}
          </div>
        ))}
      </main>
      {Dialogo}
    </>
  );
}

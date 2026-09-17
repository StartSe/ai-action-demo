"use client";
// Criar simulação em três passos (US-009): 1 Produto → 2 Desafio → 3 Compartilhar.
//
// O gestor precisa sair daqui com o link pronto para colar no grupo do time, então os dois primeiros
// passos vivem inteiros no navegador — voltar e mexer não grava nada — e só "Criar treino e gerar o
// link" chama `POST /api/simulacoes`, uma vez. Enquanto a simulação não existe não há link, e um link
// que aparecesse antes da confirmação seria um treino criado por engano a cada vez que alguém voltasse.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Aviso, CopyButton, Empty, ErrorBox, Field, Passos, Topbar, lerErro, useStatus, type ErroLido } from "@/components/ui";
import { CRITERIOS_MAX, CRITERIOS_MIN, METODOLOGIAS, METODOLOGIAS_LISTA, agruparCriterios, type Metodologia } from "@/lib/metodologias";
import { PERSONAS, rotulo } from "@/lib/personas";
import type { Dificuldade, ModoPersona } from "@/lib/simulacoes";

type ProdutoLista = {
  id: string;
  nome: string;
  status: "rascunho" | "pronto";
  exemplo: boolean;
  materiais: number;
  landings: number;
};

const PASSOS = [
  { titulo: "Produto", apoio: "o que o time vende" },
  { titulo: "Desafio", apoio: "como vai ser o treino" },
  { titulo: "Compartilhar", apoio: "o link para o time" },
];

const DIFICULDADES: { id: Dificuldade; nome: string; linha: string }[] = [
  { id: "facil", nome: "Fácil", linha: "O cliente colabora, tem tempo e faz uma objeção só. Bom para quem está começando." },
  { id: "realista", nome: "Realista", linha: "O dia a dia do time: duas ou três objeções e pressa na medida." },
  { id: "dificil", nome: "Difícil", linha: "Cliente fechado, com pressa, que pede prova de cada afirmação." },
];

const MODOS_PERSONA: { id: ModoPersona; nome: string; linha: string }[] = [
  { id: "aleatoria", nome: "Clientes variados", linha: "Cada vendedor recebe um perfil diferente, distribuídos por igual entre o time." },
  { id: "escolhidas", nome: "Escolher os perfis", linha: "O treino usa só os perfis de cliente que você marcar abaixo." },
];

function IconeSimulacao() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16h24v16H22l-8 8v-8h-2z" />
      <path d="M30 34h22v16H40l-6 6v-6h-4z" />
    </svg>
  );
}

/** "3 materiais · página importada · ficha pronta": o que a IA já sabe sobre o produto, em uma linha. */
function estadoDoConhecimento(p: ProdutoLista): string {
  const partes: string[] = [];
  if (p.materiais === 0) partes.push("sem material ainda");
  else partes.push(p.materiais === 1 ? "1 material" : `${p.materiais} materiais`);
  if (p.landings > 0) partes.push(p.landings === 1 ? "página importada" : `${p.landings} páginas importadas`);
  partes.push(p.status === "pronto" ? "ficha pronta" : "ficha ainda não gerada");
  return partes.join(" · ");
}

/** O que a avaliação vai olhar no método escolhido, agrupado nos quatro momentos da conversa (US-010).
 * Fica fechado por padrão: o gestor decide o método pela linha do cartão, e só quem quer conferir a
 * régua abre — mas ela precisa estar visível antes de o link ir para o time. */
function CriteriosDoMetodo({ metodologia }: { metodologia: Metodologia }) {
  const grupos = agruparCriterios(METODOLOGIAS[metodologia].criterios);
  const total = METODOLOGIAS[metodologia].criterios.length;
  return (
    <details className="card p-4">
      <summary className="cursor-pointer text-[13px] font-semibold">{`O que a avaliação vai olhar (${total} critérios)`}</summary>
      <div className="mt-3.5 flex flex-col gap-3.5">
        {grupos.map((g) => (
          <div key={g.grupo}>
            <p className="text-[12px] font-bold uppercase tracking-wide text-muted mb-1.5">{g.grupo}</p>
            <ul className="flex flex-col gap-1.5">
              {g.criterios.map((c) => (
                <li key={c.id} className="text-[12.5px]">
                  <span className="font-semibold">{c.nome}</span>
                  <span className="text-muted">{` — ${c.descricao}`}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-muted mt-3.5">O vendedor recebe uma nota por momento da conversa, não a lista inteira.</p>
    </details>
  );
}

/** Escolha em cartões: o rádio fica invisível mas continua sendo o rádio (teclado e leitor de tela). */
function Escolha<T extends string>({
  nome,
  opcoes,
  valor,
  onEscolher,
  colunas = 3,
}: {
  nome: string;
  opcoes: { id: T; nome: string; linha: string }[];
  valor: T;
  onEscolher: (v: T) => void;
  colunas?: 2 | 3;
}) {
  return (
    <div className={`grid ${colunas === 2 ? "grid-cols-2" : "grid-cols-3"} max-md:grid-cols-1 gap-2.5`}>
      {opcoes.map((o) => (
        <label
          key={o.id}
          className={`card p-4 cursor-pointer transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-accent-soft ${valor === o.id ? "border-accent bg-accent-soft/40" : "hover:bg-bg"}`}
        >
          <input type="radio" name={nome} className="sr-only" checked={valor === o.id} onChange={() => onEscolher(o.id)} />
          <span className="block font-bold text-[14px] mb-1">{o.nome}</span>
          <span className="block text-[12.5px] text-muted">{o.linha}</span>
        </label>
      ))}
    </div>
  );
}

export default function Page() {
  const { status, erro } = useStatus();

  const [passo, setPasso] = useState(1);
  const [produtos, setProdutos] = useState<ProdutoLista[] | null>(null);
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);
  const [criando, setCriando] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const [produtoId, setProdutoId] = useState("");
  const [nome, setNome] = useState("");
  const [nomeEditado, setNomeEditado] = useState(false);
  const [objetivo, setObjetivo] = useState("");
  const [metodologia, setMetodologia] = useState<Metodologia>("consultiva");
  const [criterios, setCriterios] = useState<string[]>(Array(CRITERIOS_MIN).fill(""));
  const [dificuldade, setDificuldade] = useState<Dificuldade>("realista");
  const [modoPersona, setModoPersona] = useState<ModoPersona>("aleatoria");
  const [personas, setPersonas] = useState<string[]>(PERSONAS.map((p) => p.id));

  // Busca inicial em forma de corrente (`fetch().then()`), nunca `await carregar()` dentro do efeito:
  // `react-hooks/set-state-in-effect` acusa chamada direta a função que mexe em estado no corpo dele.
  // O produto vem pré-escolhido quando a ação "Criar treino" de um cartão de Produtos trouxe o gestor
  // até aqui; sem isso ele escolheria de novo o produto em que acabou de clicar.
  useEffect(() => {
    fetch("/api/produtos")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo: { itens: ProdutoLista[] }) => {
        const pedido = new URLSearchParams(window.location.search).get("produto");
        const escolhido = corpo.itens.find((p) => p.id === pedido) ?? corpo.itens[0];
        setProdutos(corpo.itens);
        if (escolhido) setProdutoId(escolhido.id);
      })
      .catch(async (e) => {
        setErroTela(await lerErro(e));
        setProdutos([]);
      });
  }, []);

  const produto = produtos?.find((p) => p.id === produtoId) ?? null;
  const nomeSugerido = produto ? `${METODOLOGIAS[metodologia].nome} — ${produto.nome}` : "";
  const nomeFinal = nomeEditado ? nome : nomeSugerido;
  const criteriosPreenchidos = criterios.map((c) => c.trim()).filter(Boolean);
  const faltamCriterios = metodologia === "personalizada" && criteriosPreenchidos.length < CRITERIOS_MIN;
  const semPerfil = modoPersona === "escolhidas" && personas.length === 0;

  function alternarPersona(id: string) {
    setPersonas((atuais) => (atuais.includes(id) ? atuais.filter((p) => p !== id) : [...atuais, id]));
  }

  function mudarCriterio(i: number, valor: string) {
    setCriterios((atuais) => atuais.map((c, j) => (j === i ? valor : c)));
  }

  async function criarTreino() {
    if (criando || !produto || !nomeFinal.trim() || faltamCriterios || semPerfil) return;
    setCriando(true);
    setErroTela(null);
    try {
      const r = await fetch("/api/simulacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produtoId: produto.id,
          nome: nomeFinal.trim(),
          objetivo: objetivo.trim() || undefined,
          metodologia,
          criteriosPersonalizados: metodologia === "personalizada" ? criteriosPreenchidos : undefined,
          dificuldade,
          modoPersona,
          personas: modoPersona === "escolhidas" ? personas : undefined,
        }),
      });
      if (!r.ok) throw r;
      const corpo = await r.json();
      setLink(corpo.url);
      setPasso(3);
    } catch (e) {
      setErroTela(await lerErro(e));
    } finally {
      setCriando(false);
    }
  }

  return (
    <>
      <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[860px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Link href="/simulacoes" className="btn-link text-[13px] mb-3 inline-block">&larr; Simulações</Link>
        <h1 className="titulo-painel mb-1.5">Novo treino</h1>
        <p className="apoio mb-6">Produto, desafio e o link para mandar ao time.</p>

        <div className="mb-7">
          <Passos passos={PASSOS} atual={passo} />
        </div>

        {erroTela && <div className="mb-5"><ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao} /></div>}

        {passo === 1 && (
          produtos === null ? (
            <p className="text-muted text-sm">Carregando...</p>
          ) : produtos.length === 0 ? (
            <Empty
              ilustracao={<IconeSimulacao />}
              titulo="Primeiro cadastre o que seu time vende"
              descricao="O treino é sempre sobre um produto: é dele que a IA tira o cliente simulado e a avaliação da conversa."
              acaoSecundaria={{ rotulo: "Cadastrar um produto", url: "/produtos" }}
            />
          ) : (
            <section className="card p-6 max-md:p-5">
              <h2 className="font-bold text-[17px] mb-1">O que o time vai vender?</h2>
              <p className="text-muted text-sm mb-5">Quanto mais a IA souber do produto, mais o cliente simulado se parece com o de verdade.</p>

              <Field label="Produto" htmlFor="produto">
                <select id="produto" className="input" value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
                  {produtos.map((p) => (
                    <option key={p.id} value={p.id}>{`${p.nome} — ${estadoDoConhecimento(p)}`}</option>
                  ))}
                </select>
              </Field>

              {produto?.status === "rascunho" && (
                <Aviso tom="warn" acao={{ rotulo: "Terminar o cadastro", url: `/produtos/${produto.id}` }}>
                  A IA ainda não estudou este produto. Dá para criar o treino assim mesmo, mas o cliente simulado vai saber pouco sobre o que vocês vendem.
                </Aviso>
              )}

              <div className="flex gap-2.5 mt-6 max-md:flex-col">
                <button type="button" className="btn-primary !w-auto max-md:!w-full" disabled={!produto} onClick={() => setPasso(2)}>
                  Continuar
                </button>
              </div>
            </section>
          )
        )}

        {passo === 2 && (
          <section className="card p-6 max-md:p-5">
            <h2 className="font-bold text-[17px] mb-1">Como vai ser o treino?</h2>
            <p className="text-muted text-sm mb-5">O método escolhido vira a régua da avaliação; a dificuldade define o quanto o cliente facilita.</p>

            <Field label="Nome do treino" htmlFor="treino-nome" hint="É o que o time vê ao abrir o link.">
              <input
                id="treino-nome"
                className="input"
                value={nomeFinal}
                onChange={(e) => { setNomeEditado(true); setNome(e.target.value); }}
              />
            </Field>

            <Field label="Objetivo" htmlFor="treino-objetivo" hint="Opcional. O que você quer que o time pratique nesta rodada.">
              <textarea
                id="treino-objetivo"
                className="input min-h-20 resize-y"
                value={objetivo}
                onChange={(e) => setObjetivo(e.target.value)}
                placeholder="Ex.: sustentar o preço sem dar desconto na primeira objeção."
              />
            </Field>

            <p className="text-[13px] font-semibold mb-2">Método de venda</p>
            <div className="mb-4">
              <Escolha nome="metodologia" opcoes={METODOLOGIAS_LISTA} valor={metodologia} onEscolher={setMetodologia} />
            </div>

            {metodologia !== "personalizada" && (
              <div className="mb-4">
                <CriteriosDoMetodo metodologia={metodologia} />
              </div>
            )}

            {metodologia === "personalizada" && (
              <div className="border-l-2 border-accent-soft pl-3.5 mb-4">
                <p className="text-[12.5px] text-muted mb-3">{`Escreva de ${CRITERIOS_MIN} a ${CRITERIOS_MAX} critérios. A avaliação de cada conversa sai na ordem daqui.`}</p>
                {criterios.map((c, i) => (
                  <Field key={i} label={`Critério ${i + 1}`} htmlFor={`criterio-${i}`}>
                    <input id={`criterio-${i}`} className="input" value={c} onChange={(e) => mudarCriterio(i, e.target.value)} placeholder="Ex.: entendeu o problema antes de falar de preço" />
                  </Field>
                ))}
                {criterios.length < CRITERIOS_MAX && (
                  <button type="button" className="btn-link text-[13px]" onClick={() => setCriterios((a) => [...a, ""])}>
                    + Mais um critério
                  </button>
                )}
              </div>
            )}

            <p className="text-[13px] font-semibold mb-2">Dificuldade</p>
            <div className="mb-4">
              <Escolha nome="dificuldade" opcoes={DIFICULDADES} valor={dificuldade} onEscolher={setDificuldade} />
            </div>

            <p className="text-[13px] font-semibold mb-2">Perfis de cliente</p>
            <div className="mb-4">
              <Escolha nome="modoPersona" opcoes={MODOS_PERSONA} valor={modoPersona} onEscolher={setModoPersona} colunas={2} />
            </div>

            {modoPersona === "escolhidas" && (
              <div className="border-l-2 border-accent-soft pl-3.5 mb-4 flex flex-wrap gap-x-5 gap-y-2.5">
                {PERSONAS.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={personas.includes(p.id)} onChange={() => alternarPersona(p.id)} />
                    {rotulo(p)}
                  </label>
                ))}
              </div>
            )}

            {semPerfil && (
              <div className="mb-4">
                <Aviso tom="warn">Marque pelo menos um perfil de cliente para o time treinar.</Aviso>
              </div>
            )}

            <div className="flex gap-2.5 mt-6 max-md:flex-col-reverse">
              <button type="button" className="btn-ghost" onClick={() => setPasso(1)}>Voltar</button>
              <button
                type="button"
                className="btn-primary !w-auto max-md:!w-full"
                disabled={criando || !nomeFinal.trim() || faltamCriterios || semPerfil}
                onClick={criarTreino}
              >
                {criando ? "Criando..." : "Criar treino e gerar o link"}
              </button>
            </div>
            {faltamCriterios && <p className="text-[12.5px] text-muted mt-2.5">Escreva pelo menos três critérios para continuar.</p>}
          </section>
        )}

        {passo === 3 && link && (
          <section className="card p-6 max-md:p-5">
            <h2 className="font-bold text-[17px] mb-1">Treino criado. Mande este link para o time.</h2>
            <p className="text-muted text-sm mb-5">Um link só, para o time inteiro: cada vendedor que abrir treina com um cliente próprio.</p>

            <p className="text-[13px] font-semibold mb-1.5">Link do treino</p>
            <p className="font-mono text-[13px] break-all bg-bg border border-line rounded-field px-[13px] py-[11px] mb-3">{link}</p>
            <CopyButton texto={() => link} rotulo="Copiar link" />

            <h3 className="font-bold text-[15px] mt-7 mb-2.5">Como funciona</h3>
            <ol className="text-sm text-muted list-decimal pl-5 flex flex-col gap-1">
              <li>O vendedor acessa o link.</li>
              <li>Informa os dados dele.</li>
              <li>Recebe um cliente virtual.</li>
              <li>Realiza a venda.</li>
              <li>Recebe o feedback.</li>
              <li>O resultado aparece para você.</li>
            </ol>

            <div className="flex gap-4 flex-wrap mt-7">
              <Link href="/simulacoes" className="btn-link">Ver meus treinos</Link>
              <Link href="/produtos" className="btn-link">Voltar aos produtos</Link>
            </div>
          </section>
        )}
      </main>
    </>
  );
}

"use client";
// Criar simulação em três passos (US-009): 1 Produto → 2 Desafio → 3 Compartilhar.
//
// O gestor precisa sair daqui com o link pronto para colar no grupo do time, então os dois primeiros
// passos vivem inteiros no navegador — voltar e mexer não grava nada — e só "Criar treino e gerar o
// link" chama `POST /api/simulacoes`, uma vez. Enquanto a simulação não existe não há link, e um link
// que aparecesse antes da confirmação seria um treino criado por engano a cada vez que alguém voltasse.
import Link from "next/link";
import { AcoesLink } from "@/components/AcoesLink";
import { useEffect, useRef, useState } from "react";
import { Aviso, Empty, ErrorBox, Field, Passos, Topbar, lerErro, useStatus, type ErroLido } from "@/components/ui";
import { CRITERIOS_MAX, CRITERIOS_MIN, METODOLOGIAS, METODOLOGIAS_LISTA, agruparCriterios, type Metodologia } from "@/lib/metodologias";
import { PERSONAS, rotulo } from "@/lib/personas";
import type { Dificuldade, ModoPersona, Simulacao } from "@/lib/simulacoes";

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

// As regras do treino (US-011). Tentativas e tempo são poucas opções fechadas: uma caixa de número
// convidaria "30 tentativas" e "90 minutos", que não é treino nenhum. "Sem limite" é o valor `null`
// que `lib/simulacoes.ts` grava — por isso a opção viaja como texto e é convertida na hora de enviar.
const TENTATIVAS: { valor: string; rotulo: string }[] = [
  { valor: "1", rotulo: "1 tentativa" },
  { valor: "3", rotulo: "3 tentativas" },
  { valor: "5", rotulo: "5 tentativas" },
  { valor: "sem-limite", rotulo: "Sem limite" },
];

const DURACOES = [5, 10, 15];

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

/** Uma regra de liga/desliga com a linha que explica o que muda para o time. */
function Regra({ id, titulo, linha, marcado, onMudar }: { id: string; titulo: string; linha: string; marcado: boolean; onMudar: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex gap-2.5 cursor-pointer py-1.5">
      <input id={id} type="checkbox" className="mt-[3px]" checked={marcado} onChange={(e) => onMudar(e.target.checked)} />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold">{titulo}</span>
        <span className="block text-[12.5px] text-muted">{linha}</span>
      </span>
    </label>
  );
}

export default function Page() {
  const { status, erro } = useStatus();

  const etapaRef = useRef<HTMLHeadingElement>(null);
  const passoAnterior = useRef(1);
  const [passo, setPasso] = useState(1);
  const [produtos, setProdutos] = useState<ProdutoLista[] | null>(null);
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);
  const [criando, setCriando] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copiaDe, setCopiaDe] = useState<string | null>(null);

  const [produtoId, setProdutoId] = useState("");
  const [nome, setNome] = useState("");
  const [nomeEditado, setNomeEditado] = useState(false);
  const [objetivo, setObjetivo] = useState("");
  const [metodologia, setMetodologia] = useState<Metodologia>("consultiva");
  const [criterios, setCriterios] = useState<string[]>(Array(CRITERIOS_MIN).fill(""));
  const [dificuldade, setDificuldade] = useState<Dificuldade>("realista");
  const [modoPersona, setModoPersona] = useState<ModoPersona>("aleatoria");
  const [personas, setPersonas] = useState<string[]>(PERSONAS.map((p) => p.id));
  const [tentativas, setTentativas] = useState("3");
  const [mostrarFeedback, setMostrarFeedback] = useState(true);
  const [permiteVoz, setPermiteVoz] = useState(true);
  const [permiteTexto, setPermiteTexto] = useState(true);
  const [duracaoMin, setDuracaoMin] = useState(10);

  /** Copia um treino existente para o formulário, sem o que é da simulação antiga (código e sessões). */
  function preencherCom(s: Simulacao, lista: ProdutoLista[]) {
    // O produto de exemplo fica escondido da biblioteca assim que existe um produto de verdade, então
    // duplicar um treino de exemplo cai no primeiro produto da lista em vez de ficar sem produto.
    setProdutoId((lista.find((p) => p.id === s.produtoId) ?? lista[0])?.id ?? "");
    setNome(`${s.nome} (cópia)`);
    setNomeEditado(true);
    setObjetivo(s.objetivo ?? "");
    setMetodologia(s.metodologia);
    if (s.criteriosPersonalizados?.length) setCriterios(s.criteriosPersonalizados);
    setDificuldade(s.dificuldade);
    setModoPersona(s.modoPersona);
    if (s.personas.length) setPersonas(s.personas);
    setTentativas(s.maxTentativas === null ? "sem-limite" : String(s.maxTentativas));
    setMostrarFeedback(s.mostrarFeedback);
    setPermiteVoz(s.permiteVoz);
    setPermiteTexto(s.permiteTexto);
    setDuracaoMin(s.duracaoMin);
    setCopiaDe(s.nome);
    setPasso(2);
  }

  // Busca inicial em forma de corrente (`fetch().then()`), nunca `await carregar()` dentro do efeito:
  // `react-hooks/set-state-in-effect` acusa chamada direta a função que mexe em estado no corpo dele.
  // O produto vem pré-escolhido quando a ação "Criar treino" de um cartão de Produtos trouxe o gestor
  // até aqui; sem isso ele escolheria de novo o produto em que acabou de clicar.
  useEffect(() => {
    fetch("/api/produtos")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo: { itens: ProdutoLista[] }) => {
        const parametros = new URLSearchParams(window.location.search);
        setProdutos(corpo.itens);

        // "Duplicar" (US-012): o treino de origem preenche o passo 2 inteiro — tudo menos o código e
        // as sessões, que são da simulação antiga. A cópia só vira um treino de verdade quando o
        // gestor confirma, como qualquer outro: até lá nada foi gravado.
        const duplicar = parametros.get("duplicar");
        if (duplicar) {
          return fetch(`/api/simulacoes/${duplicar}`)
            .then((r) => (r.ok ? r.json() : Promise.reject(r)))
            .then(({ simulacao }: { simulacao: Simulacao }) => preencherCom(simulacao, corpo.itens));
        }

        const pedido = parametros.get("produto");
        const escolhido = corpo.itens.find((p) => p.id === pedido) ?? corpo.itens[0];
        if (escolhido) setProdutoId(escolhido.id);
      })
      .catch(async (e) => {
        setErroTela(await lerErro(e));
        setProdutos([]);
      });
  }, []);

  useEffect(() => {
    if (passoAnterior.current !== passo) {
      etapaRef.current?.focus();
      etapaRef.current?.scrollIntoView({ block: "start" });
      passoAnterior.current = passo;
    }
  }, [passo]);

  const produto = produtos?.find((p) => p.id === produtoId) ?? null;
  const nomeSugerido = produto ? `${METODOLOGIAS[metodologia].nome} — ${produto.nome}` : "";
  const nomeFinal = nomeEditado ? nome : nomeSugerido;
  const criteriosPreenchidos = criterios.map((c) => c.trim()).filter(Boolean);
  const faltamCriterios = metodologia === "personalizada" && criteriosPreenchidos.length < CRITERIOS_MIN;
  const semPerfil = modoPersona === "escolhidas" && personas.length === 0;
  // Sem voz e sem texto não sobra jeito de conversar: o treino abriria numa tela vazia. A tela impede
  // antes de enviar, com a frase do que fazer; o 400 da rota é só rede de segurança.
  const semJeitoDeTreinar = !permiteVoz && !permiteTexto;
  // A confirmação do passo 3: o gestor manda o link sem voltar para conferir o que combinou.
  const resumoDasRegras = [
    tentativas === "sem-limite" ? "tentativas sem limite" : tentativas === "1" ? "1 tentativa por vendedor" : `${tentativas} tentativas por vendedor`,
    `${duracaoMin} minutos de conversa`,
    permiteVoz && permiteTexto ? "por voz ou por texto" : permiteVoz ? "só por voz" : "só por texto",
    mostrarFeedback ? "com feedback para o vendedor" : "sem feedback para o vendedor",
  ].join(" · ");

  function alternarPersona(id: string) {
    setPersonas((atuais) => (atuais.includes(id) ? atuais.filter((p) => p !== id) : [...atuais, id]));
  }

  function mudarCriterio(i: number, valor: string) {
    setCriterios((atuais) => atuais.map((c, j) => (j === i ? valor : c)));
  }

  async function criarTreino() {
    if (criando || !produto || !nomeFinal.trim() || faltamCriterios || semPerfil || semJeitoDeTreinar) return;
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
          maxTentativas: tentativas === "sem-limite" ? null : Number(tentativas),
          mostrarFeedback,
          permiteVoz,
          permiteTexto,
          duracaoMin,
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
        <h1 className="titulo-painel mb-1.5">{copiaDe ? "Duplicar treino" : "Novo treino"}</h1>
        <p className="apoio mb-6">{copiaDe ? `Cópia de "${copiaDe}": mude o que quiser e gere um link novo.` : "Produto, desafio e o link para mandar ao time."}</p>

        <div className="mb-7">
          <Passos passos={PASSOS} atual={passo} />
        </div>

        {erroTela && passo !== 2 && <div className="mb-5"><ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao} /></div>}

        {passo === 1 && (
          produtos === null ? (
            <p className="text-muted text-sm">Carregando...</p>
          ) : erroTela && produtos.length === 0 ? (
            <button type="button" className="btn-ghost" onClick={() => window.location.reload()}>Recarregar produtos</button>
          ) : produtos.length === 0 ? (
            <Empty
              ilustracao={<IconeSimulacao />}
              titulo="Primeiro cadastre o que seu time vende"
              descricao="O treino é sempre sobre um produto: é dele que a IA tira o cliente simulado e a avaliação da conversa."
              acaoSecundaria={{ rotulo: "Cadastrar um produto", url: "/produtos" }}
            />
          ) : (
            <section className="card p-6 max-md:p-5">
              <h2 ref={etapaRef} tabIndex={-1} className="font-bold text-[17px] mb-1 scroll-mt-6">O que o time vai vender?</h2>
              <p className="text-muted text-sm mb-5">Quanto mais a IA souber do produto, mais o cliente simulado se parece com o de verdade.</p>

              <Field label="Produto" htmlFor="produto">
                <select id="produto" className="input" value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
                  {produtos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </Field>

              {produto && <p className="text-sm text-muted mb-4">{estadoDoConhecimento(produto)}</p>}

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
            <fieldset disabled={criando} className="min-w-0">
              <h2 ref={etapaRef} tabIndex={-1} className="font-bold text-[17px] mb-1 scroll-mt-6">Como vai ser o treino?</h2>
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

              <p className="text-[13px] font-semibold mb-2">Regras do treino</p>
              <div className="card p-4 mb-4">
                <div className="grid grid-cols-2 gap-x-5 max-md:grid-cols-1">
                  <Field label="Tentativas por vendedor" htmlFor="treino-tentativas" hint="Quantas vezes cada pessoa pode refazer a conversa.">
                    <select id="treino-tentativas" className="input" value={tentativas} onChange={(e) => setTentativas(e.target.value)}>
                      {TENTATIVAS.map((t) => (
                        <option key={t.valor} value={t.valor}>{t.rotulo}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Tempo da conversa" htmlFor="treino-duracao" hint="A conversa termina sozinha quando o tempo acaba.">
                    <select id="treino-duracao" className="input" value={duracaoMin} onChange={(e) => setDuracaoMin(Number(e.target.value))}>
                      {DURACOES.map((d) => (
                        <option key={d} value={d}>{`${d} minutos`}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="flex flex-col gap-0.5 [&>*:first-child]:pt-0">
                  <Regra
                    id="regra-feedback"
                    titulo="Mostrar feedback ao finalizar"
                    linha="Desligue quando a rodada for uma avaliação: você continua vendo o resultado, o vendedor não."
                    marcado={mostrarFeedback}
                    onMudar={setMostrarFeedback}
                  />
                  <Regra
                    id="regra-voz"
                    titulo="Permitir voz"
                    linha="O vendedor fala com o cliente pelo microfone, como numa ligação."
                    marcado={permiteVoz}
                    onMudar={setPermiteVoz}
                  />
                  <Regra
                    id="regra-texto"
                    titulo="Permitir texto"
                    linha="A saída de quem está sem microfone ou num lugar barulhento."
                    marcado={permiteTexto}
                    onMudar={setPermiteTexto}
                  />
                </div>

                {semJeitoDeTreinar && (
                  <div className="mt-3">
                    <Aviso tom="warn">Deixe pelo menos um jeito de treinar: por voz ou por texto.</Aviso>
                  </div>
                )}
              </div>

              <div className="bg-bg rounded-field p-4 mt-6 text-sm">
                <p className="font-semibold break-words">{produto?.nome}</p>
                <p className="text-muted mt-1">{resumoDasRegras}</p>
              </div>
              <div className="flex gap-2.5 mt-6 max-md:flex-col-reverse">
                <button type="button" className="btn-ghost" onClick={() => setPasso(1)}>Voltar</button>
                <button
                  type="button"
                  className="btn-primary !w-auto max-md:!w-full"
                  disabled={criando || !nomeFinal.trim() || faltamCriterios || semPerfil || semJeitoDeTreinar}
                  onClick={criarTreino}
                >
                  {criando ? "Criando..." : "Criar treino e gerar o link"}
                </button>
              </div>
              {erroTela && <div className="mt-4"><ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao} /></div>}
            </fieldset>
            {faltamCriterios && <p className="text-[12.5px] text-muted mt-2.5">Escreva pelo menos três critérios para continuar.</p>}
          </section>
        )}

        {passo === 3 && link && (
          <section className="card p-6 max-md:p-5">
            <h2 ref={etapaRef} tabIndex={-1} className="font-bold text-[17px] mb-1 scroll-mt-6">Treino criado. Mande este link para o time.</h2>
            <p className="text-muted text-sm mb-5">Um link só, para o time inteiro: cada vendedor que abrir treina com um cliente próprio.</p>

            <p className="text-[13px] font-semibold mb-1.5">Link do treino</p>
            <p className="font-mono text-[13px] break-all bg-bg border border-line rounded-field px-[13px] py-[11px] mb-3">{link}</p>
            <AcoesLink href={link} />

            <p className="text-[12.5px] text-muted mt-2.5">{resumoDasRegras}</p>

            {/* O que o gestor precisa ver é o link; os seis passos ficam a um clique, para quem vai
                explicar o treino no grupo do time. */}
            <details className="card p-4 mt-7">
              <summary className="cursor-pointer text-[13px] font-semibold">Como funciona</summary>
              <ol className="text-sm text-muted list-decimal pl-5 flex flex-col gap-1 mt-3.5">
                <li>O vendedor acessa o link.</li>
                <li>Informa os dados dele.</li>
                <li>Recebe um cliente virtual.</li>
                <li>Realiza a venda.</li>
                <li>{mostrarFeedback ? "Recebe o feedback." : "A avaliação fica disponível para o gestor."}</li>
                <li>O resultado aparece para você.</li>
              </ol>
            </details>

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

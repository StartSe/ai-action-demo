"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, Chip, CopyButton, DataTable, Destaque, Entregar, ErrorBox, Field, Hero, Item, Loading, MaisDetalhes, Origem, Passos, Privacidade, ResultHead, Row, Section, SeloIA, Stage, Topbar, data, lerErro, numero, useScrollToResult, useStatus, type PassoIndicador } from "@/components/ui";
import { GraficoCriteriosFracos } from "@/components/GraficoCriteriosFracos";
import { VendedoresPainel } from "@/components/VendedoresPainel";
import { CRITERIOS_PADRAO } from "@/lib/criterios";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import type { Analise, Cenario, Conversa, DadosAnalise, PainelEquipe, Vendedor } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

/** A mesma conversa que a demonstração analisa (lib/demo.ts): título, cenário e resumo batem com ela. */
const EXEMPLO: DadosAnalise = {
  conversaColada: `Vendedor: Boa tarde, Beatriz! Obrigado por topar essa conversa. Antes de falarmos da renovação, queria entender: como o time tem usado a plataforma nos últimos meses?
Cliente: Boa tarde. Olha, para ser sincera, o uso caiu bastante. Ficou complicado no dia a dia e parte do time simplesmente parou de entrar no sistema.
Vendedor: Entendi. Quando você diz "complicado", é mais sobre não achar o que precisam ou sobre o fluxo de trabalho em si?
Cliente: Mais o fluxo. A gente configurou do jeito que veio, nunca ajustamos para a nossa rotina. E ninguém teve tempo de treinar o time direito.
Vendedor: Faz sentido, e isso é comum quando a implantação inicial não teve um acompanhamento próximo. Posso te mostrar rapidamente como dois clientes parecidos com vocês resolveram isso?
Cliente: Pode, mas já te aviso: preciso justificar esse gasto de novo para a diretoria, e hoje eu não tenho argumento forte para isso.
Vendedor: Justo. Então deixa eu propor o seguinte: incluo, sem custo adicional, quatro sessões de acompanhamento com seu time nas próximas seis semanas, focadas só no fluxo que vocês realmente usam. Se depois disso o uso não voltar, conversamos sobre outras opções. Funciona como primeiro passo?
Cliente: Isso ajuda bastante. Se o time reencontrar valor nisso, fica mais fácil eu defender a renovação lá dentro.
Vendedor: Perfeito. Vou te mandar hoje ainda um plano com as datas propostas e um resumo por escrito que você pode levar para a diretoria. Podemos marcar a primeira sessão para a semana que vem?
Cliente: Pode ser. Me manda as opções de horário que eu confirmo com o time.`,
  cenarioId: "renovacao",
  criterios: [...CRITERIOS_PADRAO],
};

const VAZIO: DadosAnalise = { conversaColada: "", vendedorId: undefined, cenarioId: undefined, criterios: [...CRITERIOS_PADRAO] };

const ETAPAS_CARREGANDO = ["Lendo a conversa...", "Comparando com os critérios de avaliação...", "Calculando a nota e os destaques..."];

// Textos do hero (economia de texto: título ≤ 8 palavras, apoio ≤ 20, itens ≤ 5 de até 6 palavras — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Vendas",
  titulo: "Saiba como cada vendedor conduz a conversa",
  apoio: "Cole uma conversa de vendas: a IA dá a nota, as evidências e o que melhorar.",
  itens: [
    "Nota geral da conversa",
    "Nota e evidência por critério",
    "Pontos fortes e o que melhorar",
    "Momentos-chave da ligação",
    "Painel com a evolução do time",
  ],
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Conversa", apoio: "Cole ou envie" },
  { titulo: "Análise", apoio: "Nota por critério" },
  { titulo: "Evolução", apoio: "Painel da equipe" },
];

function IconeConversa() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5h12v7H8l-4 4v-4H3z" />
      <path d="M11 12h10v7h-6l-3 3v-3h-1z" />
    </svg>
  );
}

function IconeItem() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0 mt-0.5" aria-hidden="true">
      <path d="M5 12.5 9.5 17 19 7" />
    </svg>
  );
}

/** Duas falas em balões com uma nota ao lado, no lugar de um glifo genérico. */
function IlustracaoConversa() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 12h30v16H18l-6 6v-6H6z" />
      <path d="M12 18h18M12 23h11" />
      <path d="M28 34h30v16H40l-6 6v-6h-6z" />
      <path d="M34 40h18M34 45h11" />
    </svg>
  );
}

/** Cartão de entrada com ícone circular e título. */
function CartaoEntrada({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <div className="card p-5 mb-3">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0">{icone}</div>
        <h2 className="font-bold text-[15px]">{titulo}</h2>
      </div>
      {children}
    </div>
  );
}

/** Prévia de "o que você vai receber", no lugar do resultado antes da primeira análise. */
function Previa({ itens, onExemplo, carregando }: { itens: string[]; onExemplo: () => void; carregando: boolean }) {
  return (
    <div className="card p-7 max-md:p-5 h-full min-h-[420px] max-md:min-h-0 flex flex-col justify-center">
      <div className="text-accent mb-4">
        <IlustracaoConversa />
      </div>
      <h2 className="font-bold text-[15px] mb-4">O que você vai receber</h2>
      <ul className="flex flex-col gap-3 mb-6">
        {itens.map((it) => (
          <li key={it} className="flex items-start gap-2.5 text-sm text-ink-2">
            <IconeItem />
            <span>{it}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn-secundario !w-auto self-start" onClick={onExemplo} disabled={carregando}>Ver a análise de exemplo</button>
    </div>
  );
}

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string }; dados: DadosAnalise }
  | { fase: "pronto"; conversa: Conversa; analise: Analise; meta: Meta; id?: string; titulo: string; dados: DadosAnalise }
  | { fase: "painel"; painel: PainelEquipe; meta: Meta; id: string; titulo: string };

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [dados, setDados] = useState<DadosAnalise>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [cenarios, setCenarios] = useState<Cenario[]>([]);
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [novoVendedorAberto, setNovoVendedorAberto] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [novaEquipe, setNovaEquipe] = useState("");
  const [salvandoVendedor, setSalvandoVendedor] = useState(false);
  const [erroVendedor, setErroVendedor] = useState<string | null>(null);
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const [avisoArquivo, setAvisoArquivo] = useState<{ tom: "ok" | "danger"; texto: string } | null>(null);
  const [criandoLinkTreino, setCriandoLinkTreino] = useState(false);
  const [linkTreino, setLinkTreino] = useState<string | null>(null);
  const [erroLinkTreino, setErroLinkTreino] = useState<string | null>(null);
  const [gerandoPainel, setGerandoPainel] = useState(false);
  const [erroPainel, setErroPainel] = useState<string | null>(null);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto" || estado.fase === "painel");

  useEffect(() => {
    fetch("/api/vendedores").then((r) => r.json()).then((r) => setVendedores(r.itens)).catch(() => setVendedores([]));
    fetch("/api/cenarios").then((r) => r.json()).then((r) => setCenarios(r.itens)).catch(() => setCenarios([]));
    fetch("/api/analisar").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/analisar", { method: "DELETE" }).then(() => fetch("/api/analisar")).then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }

  /** Sessão expirada em qualquer chamada: volta para a tela de entrar e retorna para cá depois. */
  function sessaoExpirou(r: Response, codigo?: string): boolean {
    if (r.status === 401 && codigo === "sem_sessao") {
      router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
      return true;
    }
    return false;
  }

  const set = (campo: "conversaColada") => (e: { target: { value: string } }) => setDados((d) => ({ ...d, [campo]: e.target.value }));

  function setCriterio(i: number, valor: string) {
    setDados((d) => ({ ...d, criterios: (d.criterios || CRITERIOS_PADRAO).map((c, j) => (j === i ? valor : c)) }));
  }

  async function enviarArquivo(arquivo: File) {
    setEnviandoArquivo(true);
    setAvisoArquivo(null);
    try {
      const corpo = new FormData();
      corpo.append("arquivo", arquivo);
      const r = await fetch("/api/analisar/arquivo", { method: "POST", body: corpo });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirou(r, info.codigo)) return;
        setAvisoArquivo({ tom: "danger", texto: info.mensagem });
        return;
      }
      const resposta = (await r.json()) as { texto: string; falas: number; aviso?: string };
      setDados((d) => ({ ...d, conversaColada: resposta.texto }));
      setAvisoArquivo(resposta.aviso ? { tom: "danger", texto: resposta.aviso } : { tom: "ok", texto: `${resposta.falas} falas reconhecidas. Confira o texto antes de analisar.` });
    } catch (e) {
      setAvisoArquivo({ tom: "danger", texto: (await lerErro(e)).mensagem });
    } finally {
      setEnviandoArquivo(false);
    }
  }

  async function salvarVendedor() {
    if (!novoNome.trim()) return;
    setSalvandoVendedor(true);
    setErroVendedor(null);
    try {
      const r = await fetch("/api/vendedores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: novoNome.trim(), email: novoEmail.trim() || undefined, equipe: novaEquipe.trim() || undefined }) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirou(r, info.codigo)) return;
        setErroVendedor(info.mensagem);
        return;
      }
      const novo = (await r.json()) as Vendedor;
      setVendedores((v) => [...v, novo].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      setDados((d) => ({ ...d, vendedorId: novo.id }));
      setNovoVendedorAberto(false);
      setNovoNome("");
      setNovoEmail("");
      setNovaEquipe("");
    } catch (e) {
      setErroVendedor((await lerErro(e)).mensagem);
    } finally {
      setSalvandoVendedor(false);
    }
  }

  async function criarLinkTreino() {
    setCriandoLinkTreino(true);
    setErroLinkTreino(null);
    try {
      const r = await fetch("/api/salas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendedorId: dados.vendedorId, cenarioId: dados.cenarioId }) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirou(r, info.codigo)) return;
        setErroLinkTreino(info.mensagem);
        return;
      }
      const resposta = await r.json();
      setLinkTreino(resposta.url);
    } catch (e) {
      setErroLinkTreino((await lerErro(e)).mensagem);
    } finally {
      setCriandoLinkTreino(false);
    }
  }

  async function verPainelEquipe() {
    setGerandoPainel(true);
    setErroPainel(null);
    try {
      const r = await fetch("/api/painel-equipe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dias: 30 }) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirou(r, info.codigo)) return;
        setErroPainel(info.mensagem);
        return;
      }
      const resposta = await r.json();
      setEstado({ fase: "painel", painel: resposta.painel, meta: resposta.meta, id: resposta.id, titulo: resposta.titulo });
    } catch (e) {
      setErroPainel((await lerErro(e)).mensagem);
    } finally {
      setGerandoPainel(false);
    }
  }

  async function gerar(d: DadosAnalise) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/analisar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirou(r, info.codigo)) return;
        setEstado({ fase: "erro", mensagem: info.mensagem, codigo: info.codigo as CodigoErroIA | undefined, acao: info.acao, dados: d });
        return;
      }
      const resposta = await r.json();
      setEstado({ fase: "pronto", conversa: resposta.conversa, analise: resposta.analise, meta: resposta.meta, id: resposta.id, titulo: resposta.titulo, dados: d });
      fetch("/api/analisar").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
    } catch (e) {
      setEstado({ fase: "erro", mensagem: (await lerErro(e)).mensagem, dados: d });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    gerar(dados);
  }

  /** "Ver a análise de exemplo" preenche o campo com a conversa que a demonstração analisa e já envia. */
  function verExemplo() {
    setDados(EXEMPLO);
    setAvisoArquivo(null);
    gerar(EXEMPLO);
  }

  // Atalho para demonstrações: /?exemplo=1 preenche e envia o formulário.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(verExemplo, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const carregando = estado.fase === "carregando";
  const criterios = dados.criterios || CRITERIOS_PADRAO;
  const passoAtual = estado.fase === "pronto" || estado.fase === "painel" ? 3 : carregando ? 2 : 1;
  const comVoz = Boolean(status?.integrations?.["elevenlabs-agente"]);

  return (
    <>
      <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={status} erro={erro} resumo="Modo demonstração: a conversa e a análise exibidas são um exemplo." usuario={status?.usuario} />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Vendas">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          <form onSubmit={onSubmit}>
            <CartaoEntrada icone={<IconeConversa />} titulo="A conversa">
              <Field label="Cole a conversa" htmlFor="conversaColada" hint='Uma fala por linha, começando com "Vendedor:" ou "Cliente:".'>
                <textarea
                  id="conversaColada"
                  className="input min-h-28 resize-y font-mono text-[13px]"
                  required
                  placeholder={"Vendedor: Boa tarde! Como posso ajudar hoje?\nCliente: Oi, vi a proposta que vocês mandaram...\nVendedor: ..."}
                  value={dados.conversaColada}
                  onChange={set("conversaColada")}
                />
              </Field>

              <div className="flex items-center gap-2.5 flex-wrap mb-4">
                <label className="btn-ghost cursor-pointer" aria-disabled={enviandoArquivo}>
                  {enviandoArquivo ? "Lendo..." : "Enviar arquivo"}
                  <input
                    type="file"
                    className="hidden"
                    accept=".txt,.vtt,.srt"
                    disabled={enviandoArquivo}
                    onChange={(e) => {
                      const arquivo = e.target.files?.[0];
                      e.target.value = "";
                      if (arquivo) enviarArquivo(arquivo);
                    }}
                  />
                </label>
                <span className="text-[12.5px] text-muted">Transcrição em .txt, .vtt ou .srt</span>
              </div>
              {avisoArquivo && <div className="mb-4"><Aviso tom={avisoArquivo.tom}>{avisoArquivo.texto}</Aviso></div>}

              <Row>
                <Field label="Vendedor" htmlFor="vendedor">
                  <select
                    id="vendedor"
                    className="input"
                    value={novoVendedorAberto ? "__novo__" : dados.vendedorId || ""}
                    onChange={(e) => {
                      if (e.target.value === "__novo__") { setNovoVendedorAberto(true); return; }
                      setNovoVendedorAberto(false);
                      setDados((d) => ({ ...d, vendedorId: e.target.value || undefined }));
                    }}
                  >
                    <option value="">Sem vendedor escolhido</option>
                    {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                    <option value="__novo__">Cadastrar vendedor</option>
                  </select>
                </Field>
                <Field label="Cenário" htmlFor="cenario">
                  <select id="cenario" className="input" value={dados.cenarioId || ""} onChange={(e) => setDados((d) => ({ ...d, cenarioId: e.target.value || undefined }))}>
                    <option value="">Sem cenário escolhido</option>
                    {cenarios.map((c) => <option key={c.id} value={c.id}>{c.titulo}</option>)}
                  </select>
                </Field>
              </Row>

              {novoVendedorAberto && (
                <div className="border-l-2 border-accent-soft pl-3.5 mb-1">
                  <Row>
                    <Field label="Nome" htmlFor="novoNome"><input id="novoNome" className="input" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome do vendedor" /></Field>
                    <Field label="E-mail" htmlFor="novoEmail" hint="Recebe a análise quando você enviar."><input id="novoEmail" type="email" className="input" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="nome@empresa.com" /></Field>
                  </Row>
                  <Field label="Equipe" htmlFor="novaEquipe"><input id="novaEquipe" className="input" value={novaEquipe} onChange={(e) => setNovaEquipe(e.target.value)} placeholder="Ex.: Vendas Corporativo" /></Field>
                  {erroVendedor && <div className="mb-3"><Aviso tom="danger">{erroVendedor}</Aviso></div>}
                  <div className="flex gap-2.5 mb-1">
                    <button type="button" className="btn-primary !w-auto" disabled={!novoNome.trim() || salvandoVendedor} onClick={salvarVendedor}>{salvandoVendedor ? "Salvando" : "Salvar vendedor"}</button>
                    <button type="button" className="btn-ghost" onClick={() => { setNovoVendedorAberto(false); setErroVendedor(null); }}>Cancelar</button>
                  </div>
                </div>
              )}

              <div className="[&>details]:mb-0">
                <MaisDetalhes titulo="Critérios de avaliação">
                  <p className="text-[12.5px] text-muted mb-3">A ordem aqui é a mesma da tabela de resultado.</p>
                  {criterios.map((c, i) => (
                    <Field key={i} label={`Critério ${i + 1}`} htmlFor={`criterio-${i}`}>
                      <input id={`criterio-${i}`} className="input" value={c} onChange={(e) => setCriterio(i, e.target.value)} />
                    </Field>
                  ))}
                </MaisDetalhes>
              </div>
            </CartaoEntrada>

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Analisando" : "Analisar a conversa"}</button>
            <button type="button" className="btn-secundario mt-2" disabled={carregando} onClick={verExemplo}>Ver a análise de exemplo</button>
          </form>

          <div className="card p-5 mt-4">
            <h2 className="font-bold text-[15px] mb-3">Treinar e acompanhar</h2>
            <div className="flex gap-2.5 flex-wrap mb-1.5">
              <button type="button" className="btn-ghost" disabled={criandoLinkTreino} onClick={criarLinkTreino}>{criandoLinkTreino ? "Gerando..." : "Criar link de treino"}</button>
              <button type="button" className="btn-ghost" disabled={gerandoPainel} onClick={verPainelEquipe}>{gerandoPainel ? "Montando..." : "Ver o painel da equipe"}</button>
            </div>
            <p className="text-[12.5px] text-muted">
              {comVoz
                ? "O vendedor abre o link e treina por voz com o cliente simulado."
                : <>Hoje o treino é por texto. Conecte a ElevenLabs para o vendedor treinar por voz. <Link href="/setup#elevenlabs-agente" className="btn-link">Conectar a ElevenLabs</Link></>}
            </p>
            {erroLinkTreino && <div className="mt-2.5"><Aviso tom="danger">{erroLinkTreino}</Aviso></div>}
            {erroPainel && <div className="mt-2.5"><Aviso tom="danger">{erroPainel}</Aviso></div>}
            {linkTreino && (
              <div className="flex items-center gap-3 flex-wrap mt-3">
                <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[220px]">{linkTreino}</code>
                <CopyButton texto={() => linkTreino} rotulo="Copiar link" />
              </div>
            )}
          </div>

          <div className="card p-5 mt-4">
            <Privacidade detalhe="A conversa e a análise ficam salvas neste app por 90 dias, até você apagar." />

            <MaisDetalhes titulo="Últimos resultados">
              {historico === null ? (
                <p className="text-muted text-sm">Carregando...</p>
              ) : historico.length === 0 ? (
                <p className="text-muted text-sm">Nenhum resultado salvo ainda.</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-1.5 text-sm mb-3">
                    {historico.slice(0, 3).map((h) => (
                      <li key={h.id} className="flex justify-between gap-3">
                        <Link href={`/r/${h.id}`} className="text-accent-ink font-semibold hover:underline truncate">{h.titulo}</Link>
                        <span className="text-muted shrink-0">{data(h.criadoEm)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-4">
                    <Link href="/historico" className="btn-link text-[13px]">Ver todos</Link>
                    <button type="button" className="btn-ghost" onClick={apagarHistorico}>Apagar tudo</button>
                  </div>
                </>
              )}
            </MaisDetalhes>
          </div>
        </div>

        <Stage>
          {estado.fase === "vazio" && <Previa itens={PROMESSA.itens} onExemplo={verExemplo} carregando={carregando} />}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} codigo={estado.codigo} acao={estado.acao} onTentarNovamente={() => gerar(estado.dados)} />}
          {estado.fase === "pronto" && <Resultado conversa={estado.conversa} analise={estado.analise} meta={estado.meta} id={estado.id} titulo={estado.titulo} acoesDoGestor />}
          {estado.fase === "painel" && <ResultadoPainel painel={estado.painel} meta={estado.meta} id={estado.id} titulo={estado.titulo} />}
        </Stage>
      </main>
    </>
  );
}

function tomDestaque(nota: number): "ok" | "warn" | "danger" {
  if (nota >= 7.5) return "ok";
  if (nota >= 5) return "warn";
  return "danger";
}

function tomChip(nota: number): "positivo" | "neutro" | "negativo" {
  if (nota >= 7.5) return "positivo";
  if (nota >= 5) return "neutro";
  return "negativo";
}

function interpretacaoNota(nota: number): string {
  if (nota >= 7.5) return "Conversa forte, boa referência para o time.";
  if (nota >= 5) return "Conversa satisfatória, com pontos claros para evoluir.";
  return "Conversa exige atenção antes da próxima ligação.";
}

function formatarSegundo(s?: number): string | null {
  if (s === undefined || s === null || !Number.isFinite(s)) return null;
  const min = Math.floor(s / 60);
  const seg = Math.floor(s % 60);
  return `${min}:${String(seg).padStart(2, "0")}`;
}

/**
 * `acoesDoGestor` liga as ações que só fazem sentido para quem administra o app (mandar a análise ao
 * vendedor, levar as notas ao CRM). A sala de treino (components/SalaSimulacao) renderiza este mesmo
 * componente para o vendedor, que não tem conta nem acesso a essas rotas, e troca o `demoTexto`: lá a
 * conversa exibida é a que o vendedor acabou de ter, só a avaliação é que é de exemplo.
 */
export function Resultado({ conversa, analise, meta, id, titulo, acoesDoGestor = false, demoTexto = "Exemplo fixo: a conversa da renovação em risco, não a que você colou." }: { conversa: Conversa; analise: Analise; meta: Meta; id?: string; titulo: string; acoesDoGestor?: boolean; demoTexto?: string }) {
  const [aviso, setAviso] = useState<{ tom: "ok" | "danger"; texto: string; acao?: { rotulo: string; url: string } } | null>(null);

  async function acao(caminho: string) {
    setAviso(null);
    try {
      const r = await fetch(caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resultadoId: id }) });
      if (!r.ok) {
        const info = await lerErro(r);
        setAviso({ tom: "danger", texto: info.mensagem, acao: info.acao });
        return;
      }
      const resposta = (await r.json()) as { mensagem: string };
      setAviso({ tom: "ok", texto: resposta.mensagem });
    } catch (e) {
      setAviso({ tom: "danger", texto: (await lerErro(e)).mensagem });
    }
  }

  const extras = acoesDoGestor && id
    ? [
        { rotulo: "Enviar a análise ao vendedor", onClick: () => void acao("/api/enviar-analise") },
        { rotulo: "Enviar as notas ao CRM", onClick: () => void acao("/api/crm") },
      ]
    : undefined;

  return (
    <article className="reveal">
      <ResultHead titulo={titulo} subtitulo={`${conversa.transcricao.length} falas · ${data(conversa.criadoEm)}`}>
        <Entregar id={id} titulo={titulo} texto={() => analiseParaTexto(analise)} extras={extras} />
      </ResultHead>

      <Origem meta={meta} demoTexto={demoTexto} />

      {aviso && (
        <div className="mb-4">
          <Aviso tom={aviso.tom} acao={aviso.acao ? { rotulo: aviso.acao.rotulo, url: aviso.acao.url } : undefined}>{aviso.texto}</Aviso>
        </div>
      )}

      <ConteudoAnalise conversa={conversa} analise={analise} />

      <SeloIA demo={meta.demo} />
    </article>
  );
}

/** Corpo da análise (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoAnalise({ conversa, analise }: { conversa: Conversa; analise: Analise }) {
  return (
    <>
      <Destaque valor={numero(analise.nota, 1)} rotulo="Nota geral" interpretacao={interpretacaoNota(analise.nota)} tom={tomDestaque(analise.nota)} />
      <p className="summary">{analise.resumo}</p>

      <Section titulo="Critérios de avaliação">
        <DataTable
          colunas={[
            { chave: "nome", titulo: "Critério", papel: "titulo", largura: "24%", render: (l) => <strong>{l.nome}</strong> },
            { chave: "nota", titulo: "Nota", papel: "chip", largura: "70px", render: (l) => <Chip nivel={tomChip(l.nota)}>{numero(l.nota, 1)}</Chip> },
            { chave: "evidencia", titulo: "Evidência", papel: "resumo", render: (l) => l.evidencia },
            { chave: "comoMelhorar", titulo: "Como melhorar", papel: "detalhe", render: (l) => l.comoMelhorar },
          ]}
          linhas={analise.criterios}
        />
      </Section>

      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5 mb-8">
        <Item>
          <h3 className="font-bold mb-2">Pontos fortes</h3>
          <ul className="text-sm text-muted flex flex-col gap-1.5">
            {analise.pontosFortes.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </Item>
        <Item>
          <h3 className="font-bold mb-2">O que melhorar</h3>
          <ul className="text-sm text-muted flex flex-col gap-1.5">
            {analise.oQueMelhorar.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </Item>
      </div>

      <Section titulo="Momentos-chave">
        <Item>
          <ul className="flex flex-col gap-2">
            {analise.momentos.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </Item>
      </Section>

      <details className="group">
        <summary className="text-[13px] font-bold text-accent-ink cursor-pointer marker:content-none flex items-center gap-1.5">
          <span className="transition-transform group-open:rotate-90">›</span>
          Ver a conversa completa
        </summary>
        <div className="mt-3 card shadow-none divide-y divide-line text-sm">
          {conversa.transcricao.map((l, i) => {
            const tempo = formatarSegundo(l.segundo);
            return (
              <div key={i} className="px-4 py-2.5">
                <span className="font-bold">{l.papel === "vendedor" ? "Vendedor" : "Cliente"}</span>
                {tempo && <span className="text-muted text-[12px]"> · {tempo}</span>}
                <p className="mt-0.5">{l.texto}</p>
              </div>
            );
          })}
        </div>
      </details>
    </>
  );
}

function analiseParaTexto(analise: Analise): string {
  const l: string[] = [`Nota geral: ${numero(analise.nota, 1)}`, "", analise.resumo, "", "Critérios:"];
  analise.criterios.forEach((c) => l.push(`- ${c.nome} (${numero(c.nota, 1)}): ${c.evidencia} | Como melhorar: ${c.comoMelhorar}`));
  l.push("", "Pontos fortes:");
  analise.pontosFortes.forEach((p) => l.push(`- ${p}`));
  l.push("", "O que melhorar:");
  analise.oQueMelhorar.forEach((p) => l.push(`- ${p}`));
  l.push("", "Momentos-chave:");
  analise.momentos.forEach((m) => l.push(`- ${m}`));
  return l.join("\n");
}

function tomVariacaoPainel(variacao: number | null): "ok" | "warn" | "danger" | "neutro" {
  if (variacao === null) return "neutro";
  if (variacao > 0) return "ok";
  if (variacao < 0) return "danger";
  return "neutro";
}

function interpretacaoVariacaoPainel(variacao: number | null): string {
  if (variacao === null) return "Sem conversas suficientes no período anterior para comparar.";
  const sinal = variacao > 0 ? "+" : "";
  return `${sinal}${numero(variacao, 1)} em relação aos 30 dias anteriores`;
}

export function ResultadoPainel({ painel, meta, id, titulo }: { painel: PainelEquipe; meta: Meta; id?: string; titulo: string }) {
  return (
    <article className="reveal">
      <ResultHead titulo={titulo} subtitulo={`${painel.vendedores.length} vendedor${painel.vendedores.length === 1 ? "" : "es"} com conversas no período`}>
        <Entregar id={id} titulo={titulo} texto={() => painelParaTexto(painel)} extras={[{ rotulo: "Baixar notas da equipe (CSV)", onClick: () => exportarNotasEquipeCSV(painel) }]} />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoPainel painel={painel} />

      <ReceberResumoEquipe />
    </article>
  );
}

type EstadoNotificacoes = { configurada: boolean; canal: "email" | "slack"; destino: string };
type RotinaResumoEquipe = { id: string; tipo: string };

/** Depois de ver o painel, oferece uma rotina semanal (toda sexta às 17h) com o resumo da equipe: conversas
 * da semana, nota média, quem mais evoluiu, quem não treinou e o critério mais fraco. Ao contrário da rotina
 * semanal do Radar de Sinais, não tem parâmetro nenhum (é sempre a mesma equipe), então só existe uma. */
function ReceberResumoEquipe() {
  const [notificacoes, setNotificacoes] = useState<EstadoNotificacoes | null>(null);
  const [rotinaId, setRotinaId] = useState<string | null | undefined>(undefined);
  const [criando, setCriando] = useState(false);
  const [erroRotina, setErroRotina] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        const integracao = (d.integracoes || []).find((i: { id: string }) => i.id === "notificacoes");
        const campos: { chave: string; valorVisivel?: string }[] = integracao?.campos || [];
        const canal = campos.find((c) => c.chave === "NOTIFICACOES_CANAL")?.valorVisivel === "slack" ? "slack" : "email";
        const destino = campos.find((c) => c.chave === "NOTIFICACOES_DESTINO")?.valorVisivel || "";
        setNotificacoes({ configurada: Boolean(integracao?.configurada), canal, destino });
      })
      .catch(() => setNotificacoes({ configurada: false, canal: "email", destino: "" }));
    fetch("/api/rotinas")
      .then((r) => r.json())
      .then((d) => {
        const existente = (d.itens || []).find((i: RotinaResumoEquipe) => i.tipo === "resumo-equipe");
        setRotinaId(existente?.id ?? null);
      })
      .catch(() => setRotinaId(null));
  }, []);

  async function criar() {
    if (!notificacoes?.configurada) return;
    setCriando(true);
    setErroRotina(null);
    try {
      const r = await fetch("/api/rotinas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "resumo-equipe", frequencia: "semanal", diaSemana: 5, hora: "17:00", canal: notificacoes.canal, destino: notificacoes.canal === "email" ? notificacoes.destino || undefined : undefined }),
      });
      if (!r.ok) {
        setErroRotina((await lerErro(r)).mensagem);
        return;
      }
      const d = await r.json();
      setRotinaId(d.id);
    } catch (e) {
      setErroRotina((await lerErro(e)).mensagem);
    } finally {
      setCriando(false);
    }
  }

  if (rotinaId === undefined || notificacoes === null) return null;

  return (
    <Item className="mt-4">
      {rotinaId ? (
        <p className="text-muted text-sm">Você já recebe o resumo da equipe toda sexta às 17h.</p>
      ) : notificacoes.configurada ? (
        <>
          <button type="button" className="btn-ghost !w-auto" onClick={criar} disabled={criando}>
            {criando ? "Criando..." : "Receber o resumo toda semana"}
          </button>
          {erroRotina && <div className="mt-2.5"><Aviso tom="danger">{erroRotina}</Aviso></div>}
        </>
      ) : (
        <>
          <a href="/setup#notificacoes" className="btn-ghost !w-auto">Receber o resumo toda semana</a>
          <p className="text-[12.5px] text-muted mt-2">Precisa das Notificações configuradas para o resumo chegar até você.</p>
        </>
      )}
    </Item>
  );
}

/** Corpo do painel (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoPainel({ painel }: { painel: PainelEquipe }) {
  const variacao = painel.notaMediaAnterior === null ? null : Math.round((painel.notaMedia - painel.notaMediaAnterior) * 10) / 10;
  return (
    <>
      <Destaque
        valor={numero(painel.notaMedia, 1)}
        rotulo={`Nota média da equipe (últimos ${painel.dias} dias)`}
        interpretacao={interpretacaoVariacaoPainel(variacao)}
        tom={tomVariacaoPainel(variacao)}
      />

      <Section titulo="Vendedores">
        <VendedoresPainel vendedores={painel.vendedores} />
      </Section>

      <Section titulo="Critérios mais fracos da equipe">
        <Item>
          <GraficoCriteriosFracos criterios={painel.criteriosFracos} />
        </Item>
      </Section>
    </>
  );
}

function painelParaTexto(painel: PainelEquipe): string {
  const l: string[] = [`Painel da equipe — últimos ${painel.dias} dias`, `Nota média: ${numero(painel.notaMedia, 1)}`, ""];
  l.push("Vendedores:");
  painel.vendedores.forEach((v) => l.push(`- ${v.nome}: ${numero(v.notaMedia, 1)} (${v.conversas} conversa${v.conversas === 1 ? "" : "s"}, tendência ${v.tendencia}, critério mais fraco: ${v.criterioMaisFraco})`));
  l.push("", "Critérios mais fracos da equipe:");
  painel.criteriosFracos.forEach((c) => l.push(`- ${c.nome}: ${numero(c.notaMedia, 1)}`));
  return l.join("\n");
}

function exportarNotasEquipeCSV(painel: PainelEquipe) {
  const cabecalho = ["Vendedor", "Conversas", "Nota média", "Tendência", "Critério mais fraco", "Última conversa"];
  const linhas = [cabecalho.join(";")];
  painel.vendedores.forEach((v) => {
    const campos = [v.nome, String(v.conversas), numero(v.notaMedia, 1), v.tendencia, v.criterioMaisFraco, v.ultimaConversa ? data(v.ultimaConversa) : ""];
    linhas.push(campos.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"));
  });
  const csv = "﻿" + linhas.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "notas-equipe.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

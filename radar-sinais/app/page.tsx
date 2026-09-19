"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Aviso, Chip, DataTable, Destaque, Entregar, ErrorBox, Field, Hero, Item, Loading, MaisDetalhes, Origem, Passos, Privacidade, ResultHead, Row, SeloIA, Section, Stage, Topbar, data, lerErro, useScrollToResult, useStatus, type Coluna, type ErroLido, type PassoIndicador } from "@/components/ui";
import { Grafo, grafoParaJSON } from "@/components/Grafo";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import { descreverFontes } from "@/lib/fontes";
import { Monitoramentos } from "@/components/Monitoramentos";
import type { DadosRadar, EstadoFonte, Fonte, Radar, Sinal } from "@/lib/types";

type ItemHistorico = { id: string; titulo: string; criadoEm: string; entrada: DadosRadar };

type Formulario = { temasTexto: string; periodoDias: number; setor: string };

const EXEMPLO: Formulario = {
  temasTexto: "Agentes de IA no atendimento ao cliente\nRegulação de inteligência artificial no Brasil\nConcorrência em pagamentos e carteiras digitais",
  periodoDias: 30,
  setor: "Serviços financeiros",
};

const VAZIO: Formulario = { temasTexto: "", periodoDias: 30, setor: "" };

const PERIODOS = [7, 30, 90];

/** Últimos temas ficam no navegador (não no servidor): quem volta encontra o formulário como deixou. */
const CHAVE_LEMBRAR = "radar-sinais:ultimos-temas";

const ETAPAS_CARREGANDO = ["Buscando notícias e comunidades...", "Agrupando sinais...", "Montando o mapa de conexões..."];

const TENDENCIA_LABEL: Record<Sinal["tendencia"], string> = { subindo: "↑ Subindo", estavel: "→ Estável", caindo: "↓ Perdendo força" };

// Textos do hero (economia de texto: título ≤ 8 palavras, apoio ≤ 20, itens ≤ 5 de até 6 palavras cada — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Estratégia",
  titulo: "Sinais de mercado antes da concorrência",
  apoio: "Informe os temas que acompanha: a IA busca em fontes reais e devolve sinais com força e o que fazer.",
  itens: [
    "Sinais com força e tendência",
    "O que fazer em cada um",
    "Fontes verificadas, com link",
    "Mapa de conexões entre sinais",
    "Alertas diários por e-mail ou Slack",
  ],
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Temas", apoio: "Um por linha" },
  { titulo: "Período", apoio: "7, 30 ou 90 dias" },
  { titulo: "Radar", apoio: "Sinais, fontes e conexões" },
];

function IconeTemas() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12l5.5-5.5" />
      <circle cx="16" cy="8" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconePeriodo() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3v4M16 3v4" />
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

/** Prévia de "o que você vai receber", exibida no lugar do resultado antes do primeiro radar. */
function Previa({ itens, onExemplo, carregando }: { itens: string[]; onExemplo: () => void; carregando: boolean }) {
  return (
    <div className="card p-7 max-md:p-5 h-full min-h-[420px] max-md:min-h-0 flex flex-col justify-center">
      <h2 className="font-bold text-[15px] mb-4">O que você vai receber</h2>
      <ul className="flex flex-col gap-3 mb-6">
        {itens.map((it) => (
          <li key={it} className="flex items-start gap-2.5 text-sm text-ink-2">
            <IconeItem />
            <span>{it}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn-secundario !w-auto self-start" onClick={onExemplo} disabled={carregando}>Usar temas de exemplo</button>
    </div>
  );
}

function parseTemas(texto: string): string[] {
  return texto.split("\n").map((t) => t.trim()).filter(Boolean);
}

function formParaDados(f: Formulario): DadosRadar {
  return { temas: parseTemas(f.temasTexto), periodoDias: f.periodoDias, setor: f.setor.trim() || undefined };
}

function dadosParaForm(d: DadosRadar): Formulario {
  return { temasTexto: d.temas.join("\n"), periodoDias: PERIODOS.includes(d.periodoDias) ? d.periodoDias : 30, setor: d.setor ?? "" };
}

/** Link que reabre a tela inicial já montando o radar destes temas ("Refazer com estes temas" em /r/[id]). */
function linkRefazer(d: DadosRadar): string {
  const params = new URLSearchParams({ temas: d.temas.join("\n"), periodo: String(d.periodoDias) });
  if (d.setor) params.set("setor", d.setor);
  return `/?${params.toString()}`;
}

function lerLembrado(): Formulario | null {
  try {
    const bruto = localStorage.getItem(CHAVE_LEMBRAR);
    if (!bruto) return null;
    const f = JSON.parse(bruto) as Partial<Formulario>;
    if (typeof f.temasTexto !== "string" || !f.temasTexto.trim()) return null;
    return { temasTexto: f.temasTexto, periodoDias: PERIODOS.includes(Number(f.periodoDias)) ? Number(f.periodoDias) : 30, setor: typeof f.setor === "string" ? f.setor : "" };
  } catch {
    return null;
  }
}

function lembrar(f: Formulario) {
  try {
    localStorage.setItem(CHAVE_LEMBRAR, JSON.stringify(f));
  } catch {
    // armazenamento indisponível (modo privado, cota): segue sem lembrar
  }
}

function novaRodada(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string }; repetir: () => void }
  | { fase: "pronto"; radar: Radar; dados: DadosRadar; meta: Meta; id?: string };

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [fontes, setFontes] = useState<EstadoFonte[] | null>(null);
  const [respondidas, setRespondidas] = useState<string[]>([]);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  function carregarHistorico() {
    fetch("/api/radar").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }

  useEffect(() => {
    carregarHistorico();
    fetch("/api/radar/fontes").then((r) => r.json()).then((d) => setFontes(d.fontes ?? [])).catch(() => setFontes([]));
  }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/radar", { method: "DELETE" }).then(carregarHistorico);
  }

  /** Monta o radar. `lerErro` lê { error, codigo, acao } da rota (respostaErro) e nunca deixa status HTTP cru chegar à tela;
   * enquanto espera, consulta a cada segundo quais fontes já responderam para o Loading mostrar. */
  async function montar(dados: DadosRadar) {
    const rodada = novaRodada();
    setRespondidas([]);
    setEstado({ fase: "carregando" });
    const acompanhar = setInterval(() => {
      fetch(`/api/radar/andamento?rodada=${rodada}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setRespondidas(d.respondidas ?? []))
        .catch(() => null);
    }, 1000);
    try {
      const r = await fetch("/api/radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...dados, rodada }) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (r.status === 401 && info.codigo === "sem_sessao") {
          router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
          return;
        }
        setEstado({ fase: "erro", mensagem: info.mensagem, codigo: info.codigo as CodigoErroIA | undefined, acao: info.acao, repetir: () => montar(dados) });
        return;
      }
      const resposta = await r.json();
      setEstado({ fase: "pronto", radar: resposta.radar, dados, meta: resposta.meta, id: resposta.id });
      carregarHistorico();
    } catch (e) {
      const info: ErroLido = await lerErro(e);
      setEstado({ fase: "erro", mensagem: info.mensagem, repetir: () => montar(dados) });
    } finally {
      clearInterval(acompanhar);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    lembrar(form);
    montar(formParaDados(form));
  }

  /** "Usar temas de exemplo" preenche E monta: quem quer ver o resultado não precisa rolar até o botão. */
  function usarExemplo() {
    setForm(EXEMPLO);
    montar(formParaDados(EXEMPLO));
  }

  /** "Refazer" num radar salvo: preenche com os temas dele e monta de novo (busca nova, período igual). */
  function refazer(d: DadosRadar) {
    const f = dadosParaForm(d);
    setForm(f);
    lembrar(f);
    montar(formParaDados(f));
  }

  // Atalhos: /?exemplo=1 preenche e envia o exemplo; /?temas=...&periodo=30 refaz um radar salvo (link de /r/[id]);
  // sem nenhum dos dois, recupera os últimos temas lembrados no navegador (sem enviar).
  useEffect(() => {
    if (autoEnviado.current) return;
    const params = new URLSearchParams(location.search);
    if (params.get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(usarExemplo, 0);
      return;
    }
    const temasParam = params.get("temas");
    if (temasParam && parseTemas(temasParam).length > 0) {
      autoEnviado.current = true;
      const periodo = Number(params.get("periodo"));
      const f: Formulario = { temasTexto: parseTemas(temasParam).join("\n"), periodoDias: PERIODOS.includes(periodo) ? periodo : 30, setor: params.get("setor") ?? "" };
      setTimeout(() => refazer(formParaDados(f)), 0);
      return;
    }
    const lembrado = lerLembrado();
    if (lembrado) setTimeout(() => setForm((atual) => (atual.temasTexto ? atual : lembrado)), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const carregando = estado.fase === "carregando";
  const temTemas = parseTemas(form.temasTexto).length > 0;
  const passoAtual = estado.fase === "pronto" ? 3 : temTemas ? 2 : 1;
  const iaConectada = Boolean(status?.ai);
  const buscaWeb = Boolean(status?.integrations?.buscaWeb);
  const fontesDaRodada = fontes ? fontes.filter((f) => f.estado !== "sem_chave") : null;

  return (
    <>
      <Topbar marca="R" nome="Radar de Sinais" area="Estratégia" status={status} erro={erro} resumo="Modo demonstração: o radar exibido é um exemplo." usuario={status?.usuario} />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Estratégia">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          <form onSubmit={onSubmit}>
            <CartaoEntrada icone={<IconeTemas />} titulo="Os temas">
              <Field label="Temas que você acompanha" htmlFor="temas" hint="Um tema por linha: mercado, concorrente ou tecnologia.">
                <textarea
                  id="temas"
                  className="input min-h-24 resize-y"
                  required
                  placeholder={"Agentes de IA no atendimento ao cliente\nRegulação de inteligência artificial no Brasil"}
                  value={form.temasTexto}
                  onChange={(e) => setForm((f) => ({ ...f, temasTexto: e.target.value }))}
                />
              </Field>
            </CartaoEntrada>

            <CartaoEntrada icone={<IconePeriodo />} titulo="Período e setor">
              <Row>
                <Field label="Período" htmlFor="periodo">
                  <select id="periodo" className="input" value={form.periodoDias} onChange={(e) => setForm((f) => ({ ...f, periodoDias: Number(e.target.value) }))}>
                    <option value={7}>Últimos 7 dias</option>
                    <option value={30}>Últimos 30 dias</option>
                    <option value={90}>Últimos 90 dias</option>
                  </select>
                </Field>
                <Field label="Setor da empresa (opcional)" htmlFor="setor" hint="Ajuda a priorizar o que fazer.">
                  <input id="setor" className="input" placeholder="Ex.: varejo, saúde" value={form.setor} onChange={(e) => setForm((f) => ({ ...f, setor: e.target.value }))} />
                </Field>
              </Row>
            </CartaoEntrada>

            {/* Linha sob o formulário: com a IA conectada, quais fontes entram na rodada e o convite para notícias em português. */}
            {iaConectada && fontesDaRodada && fontesDaRodada.length > 0 && (
              <p className="text-[12.5px] text-muted mb-3">
                Fontes desta rodada: {descreverFontes(fontesDaRodada)}.
                {!buscaWeb && (
                  <>
                    {" "}Para mais notícias em português e páginas da web, <a href="/setup#exa" className="btn-link text-[12.5px]">conecte Exa, Tavily ou Bright Data</a>.
                  </>
                )}
              </p>
            )}

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Montando o radar" : "Montar o radar"}</button>
            <button type="button" className="btn-secundario mt-2" disabled={carregando} onClick={usarExemplo}>Usar temas de exemplo</button>
          </form>

          <Monitoramentos dados={formParaDados(form)} onEditar={d => setForm(dadosParaForm(d))} />

          <div className="card p-5 mt-4">
            <Privacidade detalhe="O radar fica salvo neste app até você apagar em 'Últimos resultados'. Monitoramentos e termos cadastrados ficam salvos neste app." />

            <MaisDetalhes titulo="Últimos resultados">
              {historico === null ? (
                <p className="text-muted text-sm">Carregando...</p>
              ) : historico.length === 0 ? (
                <p className="text-muted text-sm">Nenhum resultado salvo ainda.</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-2 text-sm mb-3">
                    {historico.slice(0, 3).map((h) => (
                      <li key={h.id} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={`/r/${h.id}`} className="text-accent-ink font-semibold hover:underline block truncate">{h.titulo}</Link>
                          <span className="text-muted text-[12.5px]">{data(h.criadoEm)}</span>
                        </div>
                        <button type="button" className="btn-link text-[13px] shrink-0" disabled={carregando} onClick={() => refazer(h.entrada)}>Refazer com estes temas</button>
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
          {estado.fase === "vazio" && <Previa itens={PROMESSA.itens} onExemplo={usarExemplo} carregando={carregando} />}
          {estado.fase === "carregando" && (
            <div>
              <Loading etapas={ETAPAS_CARREGANDO} />
              {respondidas.length > 0 && <p className="text-[12.5px] text-muted mt-1" aria-live="polite">Já responderam: {respondidas.join(", ")}.</p>}
            </div>
          )}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} codigo={estado.codigo} acao={estado.acao} onTentarNovamente={estado.repetir} />}
          {estado.fase === "pronto" && <Resultado radar={estado.radar} dados={estado.dados} meta={estado.meta} id={estado.id} />}
        </Stage>
      </main>
    </>
  );
}

export function Resultado({ radar, dados, meta, id, mostrarRefazer = false }: { radar: Radar; dados: DadosRadar; meta: Meta; id?: string; mostrarRefazer?: boolean }) {
  const [avisoCopia, setAvisoCopia] = useState<"ok" | "falha" | null>(null);
  const recusadas = (radar.fontes ?? []).filter((f) => f.estado === "chave_recusada").map((f) => f.nome);

  async function copiarSinaisComoLista() {
    const texto = radar.sinais.map((s) => `- ${s.titulo} [força ${s.forca}, ${s.tendencia}]`).join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      setAvisoCopia("ok");
    } catch {
      setAvisoCopia("falha");
    }
    setTimeout(() => setAvisoCopia(null), 4000);
  }

  return (
    <article className="reveal">
      <ResultHead titulo="Radar de sinais" subtitulo={`Últimos ${radar.periodoDias} dias · ${dados.temas.join(", ")}`}>
        <Entregar id={id} titulo="Radar de sinais" texto={() => radarParaTexto(radar)} extras={[{ rotulo: "Copiar sinais como lista", onClick: copiarSinaisComoLista }]} />
      </ResultHead>
      {avisoCopia === "ok" && <div className="mb-4"><Aviso tom="ok">Lista de sinais copiada. Cole no e-mail ou na mensagem.</Aviso></div>}
      {avisoCopia === "falha" && <div className="mb-4"><Aviso tom="danger">Não foi possível copiar automaticamente. Use &ldquo;Copiar texto&rdquo; no menu Mais.</Aviso></div>}

      <Origem meta={meta} />

      {recusadas.length > 0 && (
        <div className="mb-4">
          <Aviso tom="warn">
            {recusadas.join(" e ")} {recusadas.length === 1 ? "recusou" : "recusaram"} a chave: este radar saiu sem essa fonte. <a href="/setup#exa" className="btn-link text-[13px]">Conferir a chave em Configurações</a>
          </Aviso>
        </div>
      )}

      <ConteudoRadar radar={radar} />

      {mostrarRefazer && (
        <Item className="mt-4">
          <Link href={linkRefazer(dados)} className="btn-ghost !w-auto">Refazer com estes temas</Link>
        </Item>
      )}

      <Link href="/#monitoramentos" className="btn-ghost mt-4">Configurar monitoramento diário</Link>

      <MaisDetalhes titulo="Para a equipe técnica">
        <p className="text-muted text-[13px] mb-3">Nós, conexões e grupos do mapa, no formato que ferramentas de grafo leem.</p>
        <button type="button" className="btn-ghost !w-auto" onClick={() => baixarGrafoJSON(radar)}>Baixar grafo (JSON)</button>
      </MaisDetalhes>

      <SeloIA demo={meta.demo} />
    </article>
  );
}

function FontesDoSinal({ fontes }: { fontes: Fonte[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {fontes.map((f, i) => (
        <li key={i}>
          {f.url ? (
            <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-accent-ink hover:underline">{f.titulo}</a>
          ) : (
            <span>{f.titulo}</span>
          )}
          {f.exemplo && <span className="text-muted"> (exemplo)</span>}
          <span className="text-muted"> · {f.veiculo} · {data(f.publicadoEm)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Corpo do radar (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoRadar({ radar }: { radar: Radar }) {
  const fortes = radar.sinais.filter((s) => s.forca === "alta").length;
  const vazio = radar.sinais.length === 0;

  const colunas: Coluna<Sinal>[] = [
    {
      chave: "titulo",
      titulo: "Sinal",
      papel: "titulo",
      largura: "24%",
      render: (s) => (
        <div>
          <strong className="block">{s.titulo}</strong>
          <div className="text-[12px] text-muted mt-0.5 font-normal">{s.temas.join(" · ")}</div>
        </div>
      ),
    },
    { chave: "forca", titulo: "Força", papel: "chip", largura: "96px", render: (s) => <Chip nivel={s.forca} /> },
    { chave: "tendencia", titulo: "Tendência", largura: "120px", render: (s) => TENDENCIA_LABEL[s.tendencia] },
    // Sem papel: inteira no desktop e sempre visível no cartão do celular (nunca atrás de "Ver mais").
    { chave: "oQueFazer", titulo: "O que fazer", render: (s) => s.oQueFazer },
    { chave: "fontes", titulo: "Fontes", papel: "detalhe", render: (s) => <FontesDoSinal fontes={s.fontes} /> },
  ];

  return (
    <>
      <Destaque
        valor={String(fortes)}
        rotulo={fortes === 1 ? "sinal forte no período" : "sinais fortes no período"}
        interpretacao={interpretacaoDestaque(fortes, radar)}
        tom={fortes >= 4 ? "warn" : fortes >= 1 ? "neutro" : "ok"}
      />

      {vazio ? (
        <Aviso tom="warn">
          A busca trouxe {radar.totalAchados ?? 0} {radar.totalAchados === 1 ? "achado" : "achados"}, mas nenhum sustentou um sinal com fonte verificada. Tente temas mais específicos ou um período maior.
        </Aviso>
      ) : (
        <>
          <p className="summary">{resumoRadar(radar)}</p>

          <Section titulo="Mapa de conexões">
            <Grafo nos={radar.nos} arestas={radar.arestas} sinais={radar.sinais} />
          </Section>

          <Section titulo="Sinais">
            <DataTable colunas={colunas} linhas={radar.sinais} />
          </Section>

          {radar.conexoes.length > 0 && (
            <Section titulo="Conexões que merecem atenção">
              <div className="flex flex-col gap-3">
                {radar.conexoes.map((c) => (
                  <Item key={c.titulo}>
                    <h3 className="font-bold mb-1">{c.titulo}</h3>
                    <p className="text-muted text-sm">{c.explicacao}</p>
                  </Item>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </>
  );
}

function pluralizar(n: number, singular: string, plural: string) {
  return n === 1 ? singular : plural;
}

function resumoRadar(radar: Radar): string {
  const temas = new Set(radar.sinais.flatMap((s) => s.temas));
  return `${radar.sinais.length} ${pluralizar(radar.sinais.length, "sinal mapeado", "sinais mapeados")} em ${temas.size} ${pluralizar(temas.size, "tema", "temas")}, com ${radar.conexoes.length} ${pluralizar(radar.conexoes.length, "conexão", "conexões")} entre eles, nos últimos ${radar.periodoDias} dias.`;
}

function interpretacaoDestaque(fortes: number, radar: Radar): string {
  if (fortes >= 4) return "Vários sinais fortes ao mesmo tempo: vale revisar prioridades ainda esta semana.";
  if (fortes >= 1) return "Pelo menos um sinal forte pede uma atenção mais próxima.";
  if (radar.sinais.length === 0) return "Nenhum sinal sustentado por fonte verificada neste período.";
  return "Nenhum sinal forte neste período: os sinais abaixo têm poucas fontes cada e merecem só acompanhamento.";
}

function baixarGrafoJSON(radar: Radar) {
  const payload = grafoParaJSON(radar.nos, radar.arestas);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "radar-grafo.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function radarParaTexto(radar: Radar): string {
  const l: string[] = [`Radar de sinais (últimos ${radar.periodoDias} dias)`, ""];
  radar.sinais.forEach((s) => {
    l.push(`- ${s.titulo} [força ${s.forca}, ${s.tendencia}]`);
    l.push(`    ${s.resumo}`);
    l.push(`    O que fazer: ${s.oQueFazer}`);
    s.fontes.forEach((f) => l.push(`    Fonte: ${f.titulo} (${f.veiculo}) ${f.url}${f.exemplo ? " [exemplo]" : ""}`));
  });
  if (radar.conexoes.length > 0) {
    l.push("", "Conexões que merecem atenção:");
    radar.conexoes.forEach((c) => l.push(`- ${c.titulo}: ${c.explicacao}`));
  }
  return l.join("\n");
}

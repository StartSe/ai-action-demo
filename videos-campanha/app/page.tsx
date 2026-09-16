"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Aviso, Chip, CopyButton, Dropzone, Entregar, ErrorBox, Field, Hero, Loading, MaisDetalhes, Origem, Passos, Privacidade, ResultHead, Row, Stage, Topbar, data, lerErro, useScrollToResult, useStatus, type PassoIndicador } from "@/components/ui";
import { DialogoGerar } from "@/components/DialogoGerar";
import { Storyboard } from "@/components/Storyboard";
import { VideoDoConceito } from "@/components/VideoDoConceito";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import { BRIEFING_DEMO } from "@/lib/demo";
import { legendaEmTexto, nomeDeArquivo, REDES, roteiroEmTexto, type Rede } from "@/lib/roteiro";
import { DURACOES, FORMATOS, OBJETIVOS, rotuloFormato, rotuloObjetivo, videoTerminou, type Briefing, type Campanha, type Conceito, type Duracao, type Formato, type Objetivo, type Saldo, type Video } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };
type ContaHiggsfield = { conectado: boolean; saldo: Saldo | null; efeitos: number; erro?: string };

type Formulario = Omit<Briefing, "imagemDataUrl">;

const VAZIO: Formulario = { produto: "", publico: "", objetivo: "lancamento", tom: "", formato: "9:16", duracaoSeg: 10 };

/** A imagem do produto de exemplo mora em public/exemplo-produto.jpg. */
const ARQUIVO_EXEMPLO = "/exemplo-produto.jpg";

const LIMITE_MB = 5;
const ETAPAS_CARREGANDO = ["Lendo o briefing...", "Pensando em três ângulos diferentes...", "Escrevendo o roteiro e o texto de cada cena...", "Preparando as legendas por rede..."];

// Textos do topo (economia de texto: título ≤ 8 palavras, apoio ≤ 20, itens ≤ 5 de até 6 palavras — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Marketing",
  titulo: "Sua campanha em vídeo",
  apoio: "Descreva a campanha, envie a imagem do produto e escolha o conceito antes de gastar créditos.",
  itens: [
    "Três conceitos com roteiro por cena",
    "Prévia na proporção escolhida",
    "Legendas prontas por rede",
    "Custo em créditos antes de gerar",
    "Vídeo feito com a sua imagem",
  ],
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Briefing", apoio: "Produto, público e formato" },
  { titulo: "Conceitos", apoio: "Três ângulos para escolher" },
  { titulo: "Vídeo", apoio: "Gerado com o seu produto" },
];

function IconeCampanha() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5v5a1 1 0 0 0 1 1h3l6 4V4.5l-6 4H5a1 1 0 0 0-1 1Z" />
      <path d="M18 9a4 4 0 0 1 0 6" />
    </svg>
  );
}

function IconeVideo() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5.5" width="13" height="13" rx="2.5" />
      <path d="m16 12 5-3.5v11L16 16" />
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

/** Cartão de entrada com ícone circular e título, no lugar da coluna única de campos crus. */
function CartaoEntrada({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <div className="card p-5 mb-3 [&>details:last-child]:mb-0">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0">{icone}</div>
        <h2 className="font-bold text-[15px]">{titulo}</h2>
      </div>
      {children}
    </div>
  );
}

/** Prévia de "o que você vai receber", exibida no lugar do resultado antes da primeira campanha. */
function Previa({ itens }: { itens: string[] }) {
  return (
    <div className="card p-7 max-md:p-5 h-full min-h-[420px] max-md:min-h-0 flex flex-col justify-center">
      <h2 className="font-bold text-[15px] mb-4">O que você vai receber</h2>
      <ul className="flex flex-col gap-3">
        {itens.map((it) => (
          <li key={it} className="flex items-start gap-2.5 text-sm text-ink-2">
            <IconeItem />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Tentativa = { arquivo: File | null; form: Formulario };
type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string }; tentativa?: Tentativa }
  | { fase: "pronto"; campanha: Campanha; meta: Meta; id: string };

export function lerComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    leitor.readAsDataURL(arquivo);
  });
}

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [avisoArquivo, setAvisoArquivo] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [conta, setConta] = useState<ContaHiggsfield | null>(null);
  const autoEnviado = useRef(false);
  const higgsfieldConectado = Boolean(status?.integrations?.higgsfield);

  useScrollToResult(estado.fase === "pronto");

  useEffect(() => {
    fetch("/api/conceitos").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }, []);

  // Saldo do Higgsfield para "Mais detalhes", só quando a integração está conectada.
  useEffect(() => {
    if (!higgsfieldConectado) return;
    fetch("/api/higgsfield").then((r) => r.json()).then(setConta).catch(() => setConta({ conectado: true, saldo: null, efeitos: 0, erro: "Não foi possível consultar o saldo." }));
  }, [higgsfieldConectado]);

  function apagarHistorico() {
    if (!window.confirm("Apagar todas as campanhas salvas? Essa ação não pode ser desfeita.")) return;
    fetch("/api/conceitos", { method: "DELETE" })
      .then(() => fetch("/api/conceitos").then((r) => r.json()).then((r) => setHistorico(r.itens)))
      .catch(() => setHistorico([]));
  }

  const set = (campo: keyof Formulario) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  function escolherArquivo(f: File | null) {
    setAvisoArquivo(null);
    if (!f) { setArquivo(null); return; }
    if (!/^image\/(png|jpeg)$/.test(f.type)) { setArquivo(null); setAvisoArquivo("Envie uma imagem PNG ou JPG."); return; }
    if (f.size > LIMITE_MB * 1024 * 1024) { setArquivo(null); setAvisoArquivo(`A imagem passa de ${LIMITE_MB} MB. Reduza e envie de novo.`); return; }
    setArquivo(f);
  }

  async function gerar(arq: File | null, f: Formulario) {
    setEstado({ fase: "carregando" });
    try {
      const imagemDataUrl = arq ? await lerComoDataUrl(arq) : undefined;
      const r = await fetch("/api/conceitos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, duracaoSeg: Number(f.duracaoSeg), imagemDataUrl }),
      });
      if (!r.ok) {
        // lerErro lê { error, codigo, acao } da rota (respostaErro) e nunca deixa status cru chegar à tela.
        const info = await lerErro(r);
        if (r.status === 401 && info.codigo === "sem_sessao") {
          router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
          return;
        }
        setEstado({ fase: "erro", mensagem: info.mensagem, codigo: info.codigo as CodigoErroIA | undefined, acao: info.acao, tentativa: { arquivo: arq, form: f } });
        return;
      }
      const resposta = await r.json();
      setEstado({ fase: "pronto", campanha: resposta.campanha, meta: resposta.meta, id: resposta.id });
      fetch("/api/conceitos").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
    } catch (e) {
      const info = await lerErro(e);
      setEstado({ fase: "erro", mensagem: info.mensagem, tentativa: { arquivo: arq, form: f } });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.produto.trim()) return;
    gerar(arquivo, form);
  }

  async function arquivoExemplo(): Promise<File | null> {
    try {
      const r = await fetch(ARQUIVO_EXEMPLO);
      if (!r.ok) return null;
      return new File([await r.blob()], "produto-exemplo.jpg", { type: "image/jpeg" });
    } catch {
      return null;
    }
  }

  /** "Usar um exemplo" preenche E cria: quem quer ver o resultado não precisa rolar até o botão. */
  function usarExemplo() {
    setForm(BRIEFING_DEMO);
    setAvisoArquivo(null);
    arquivoExemplo().then((f) => { setArquivo(f); gerar(f, BRIEFING_DEMO); });
  }

  // Atalho para demonstrações: /?exemplo=1 preenche o briefing de exemplo, carrega a imagem do produto e envia.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => {
        setForm(BRIEFING_DEMO);
        arquivoExemplo().then((f) => { setArquivo(f); gerar(f, BRIEFING_DEMO); });
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const carregando = estado.fase === "carregando";
  const passoAtual = estado.fase === "pronto" ? 2 : 1;
  // Só é lido depois que o resultado existe (nunca na primeira renderização), então não causa divergência
  // de hidratação — mesma guarda de `Entregar` em components/ui.tsx.
  const paraCaptura = typeof window !== "undefined" && new URLSearchParams(location.search).get("captura") === "1";

  return (
    <>
      <Topbar marca="V" nome="Vídeos de Campanha" area="Marketing" status={status} erro={erro} resumo="Modo demonstração: os conceitos exibidos são um exemplo." usuario={status?.usuario} />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Marketing">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          <form onSubmit={onSubmit} className="briefing">
            <CartaoEntrada icone={<IconeCampanha />} titulo="A campanha">
              <Field label="Produto ou oferta" htmlFor="produto">
                <input id="produto" className="input" required placeholder="Ex.: Garrafa térmica Vela 750 ml" value={form.produto} onChange={set("produto")} />
              </Field>
              <Field label="Para quem" htmlFor="publico">
                <input id="publico" className="input" required placeholder="Ex.: pessoas que treinam cedo e passam o dia fora" value={form.publico} onChange={set("publico")} />
              </Field>
              <MaisDetalhes>
                <Row>
                  <Field label="Objetivo" htmlFor="objetivo">
                    <select id="objetivo" className="input" value={form.objetivo} onChange={(e) => setForm((f) => ({ ...f, objetivo: e.target.value as Objetivo }))}>
                      {OBJETIVOS.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                    </select>
                  </Field>
                  <Field label="Tom" htmlFor="tom">
                    <input id="tom" className="input" placeholder="Ex.: direto e confiante" value={form.tom} onChange={set("tom")} />
                  </Field>
                </Row>
              </MaisDetalhes>
            </CartaoEntrada>

            <CartaoEntrada icone={<IconeVideo />} titulo="O vídeo">
              <Field label="Imagem do produto" htmlFor="imagem">
                <div className="dropzone-curta"><Dropzone id="imagem" accept="image/png,image/jpeg" tiposLabel="Uma foto com fundo limpo, em PNG ou JPG" maxSizeMB={LIMITE_MB} arquivo={arquivo} onArquivo={escolherArquivo} /></div>
              </Field>
              {avisoArquivo && <div className="mb-4"><Aviso tom="danger">{avisoArquivo}</Aviso></div>}
              {/* O título da dobra mostra a escolha atual: recolher formato e duração não pode esconder
                  qual proporção vai sair (é o que traz "Criar conceitos" para acima da dobra). */}
              <MaisDetalhes titulo={`${rotuloFormato(form.formato)} · ${form.duracaoSeg} segundos`}>
                <Row>
                  <Field label="Formato" htmlFor="formato">
                    <select id="formato" className="input" value={form.formato} onChange={(e) => setForm((f) => ({ ...f, formato: e.target.value as Formato }))}>
                      {FORMATOS.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
                    </select>
                  </Field>
                  <Field label="Duração" htmlFor="duracao">
                    <select id="duracao" className="input" value={form.duracaoSeg} onChange={(e) => setForm((f) => ({ ...f, duracaoSeg: Number(e.target.value) as Duracao }))}>
                      {DURACOES.map((d) => <option key={d} value={d}>{d} segundos</option>)}
                    </select>
                  </Field>
                </Row>
              </MaisDetalhes>
            </CartaoEntrada>

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Criando os conceitos" : "Criar conceitos"}</button>
            <button type="button" className="btn-secundario mt-2" disabled={carregando} onClick={usarExemplo}>Usar um exemplo</button>
          </form>

          <div className="card p-5 mt-4">
            <Privacidade detalhe="A imagem do produto e os conceitos ficam salvos neste app até você apagar. Nenhum vídeo é gerado nem crédito é gasto sem a sua confirmação." />

            <MaisDetalhes titulo="Conta do Higgsfield">
              {higgsfieldConectado ? (
                <dl className="text-sm flex flex-col gap-1.5">
                  <div className="flex justify-between gap-3"><dt className="text-muted">Situação</dt><dd className="font-semibold">Conectado</dd></div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Saldo</dt>
                    <dd className="font-semibold" data-saldo>{conta === null ? "Consultando..." : conta.saldo ? `${conta.saldo.creditos.toLocaleString("pt-BR")} créditos${conta.saldo.plano ? ` · plano ${conta.saldo.plano}` : ""}` : "não informado"}</dd>
                  </div>
                  {conta && conta.efeitos > 0 && <div className="flex justify-between gap-3"><dt className="text-muted">Efeitos disponíveis</dt><dd className="font-semibold">{conta.efeitos}</dd></div>}
                  {conta?.erro && <p className="text-danger text-[12.5px]">{conta.erro}</p>}
                </dl>
              ) : (
                <p className="text-muted text-sm">
                  Os conceitos saem sem gastar nada. Para gerar o vídeo de verdade, conecte o Higgsfield em{" "}
                  <a className="text-accent-ink font-semibold hover:underline" href="/setup#higgsfield">Configuração</a>: o custo em créditos aparece antes de cada geração.
                </p>
              )}
            </MaisDetalhes>

            <MaisDetalhes titulo="Últimas campanhas">
              {historico === null ? (
                <p className="text-muted text-sm">Carregando...</p>
              ) : historico.length === 0 ? (
                <p className="text-muted text-sm">Nenhuma campanha salva ainda.</p>
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
                    <Link href="/historico" className="btn-link text-[13px]">Ver todas</Link>
                    <button type="button" className="btn-ghost" onClick={apagarHistorico}>Apagar tudo</button>
                  </div>
                </>
              )}
            </MaisDetalhes>
          </div>
        </div>

        <Stage>
          {estado.fase === "vazio" && <Previa itens={PROMESSA.itens} />}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && (
            <ErrorBox
              mensagem={estado.mensagem}
              codigo={estado.codigo}
              acao={estado.acao}
              onTentarNovamente={estado.tentativa ? () => gerar(estado.tentativa!.arquivo, estado.tentativa!.form) : undefined}
            />
          )}
          {estado.fase === "pronto" && <Resultado key={estado.id} campanha={estado.campanha} meta={estado.meta} id={estado.id} conectado={higgsfieldConectado} paraCaptura={paraCaptura} />}
        </Stage>
      </main>
    </>
  );
}

/** Um conceito: título, efeito, prévia animada, roteiro por cena, chamada, legendas e a geração do vídeo pelo Higgsfield. */
function CartaoConceito({ conceito, briefing, indice, video, conectado, bloqueado, semImagem, avisoVideo, paraCaptura, onGerar }: {
  conceito: Conceito;
  briefing: Briefing;
  indice: number;
  video?: Video;
  /** O Higgsfield está autorizado. */
  conectado: boolean;
  /** Outro vídeo está sendo gerado (um por vez). */
  bloqueado: boolean;
  /** A campanha ainda não tem a imagem do produto (a área de envio aparece acima dos cartões). */
  semImagem: boolean;
  avisoVideo?: string | null;
  paraCaptura?: boolean;
  onGerar: (conceito: Conceito) => void;
}) {
  // "Conecte o Higgsfield" não entra aqui: a frase aparece uma vez só, acima dos cartões, com o link — por
  // isso o botão fica desabilitado sem repetir o motivo em cada um dos três cartões.
  const motivo = !conectado ? null : semImagem ? "Envie a imagem do produto acima" : bloqueado ? "Espere o vídeo em andamento terminar" : null;
  const podeGerar = conectado && !semImagem && !bloqueado;
  return (
    <section className="card p-4 flex flex-col gap-3.5" aria-labelledby={`conceito-${conceito.id}`}>
      <header>
        <div className="text-[12px] font-bold text-accent tracking-[0.02em] mb-1">Conceito {indice + 1}</div>
        <h3 id={`conceito-${conceito.id}`} className="text-[17px] font-extrabold leading-tight tracking-[-0.01em]">{conceito.titulo}</h3>
        <div className="mt-1.5"><Chip nivel="neutral">{conceito.efeitoSugerido}</Chip></div>
      </header>

      <Storyboard cenas={conceito.roteiro} formato={briefing.formato} imagem={briefing.imagemDataUrl} titulo={conceito.titulo} fixa={paraCaptura} />

      <ol className="flex flex-col gap-2 text-sm">
        {conceito.roteiro.map((c, i) => (
          <li key={i} className="border-l-2 border-accent-soft pl-3">
            <div className="text-[12px] font-bold text-muted">Cena {i + 1} · {c.segundos} s</div>
            <p className="text-ink">{c.cena}</p>
            <p className="font-semibold text-accent-ink">“{c.textoNaTela}”</p>
          </li>
        ))}
      </ol>

      <p className="text-sm"><span className="font-bold">Chamada:</span> {conceito.chamada}</p>

      <MaisDetalhes titulo="Legendas por rede">
        <dl className="flex flex-col gap-3 text-sm">
          {REDES.map(({ rede, rotulo }) => (
            <div key={rede}>
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <dt className="font-bold">{rotulo}</dt>
                {/* Copiar a legenda certa sem selecionar o texto à mão: um botão por rede, dentro do conceito.
                    O botão compartilhado é grande demais para uma linha de lista: encolhido só aqui. */}
                <div className="[&_button]:!px-3 [&_button]:!py-1 [&_button]:!text-[12.5px]">
                  <CopyButton texto={() => conceito.legenda[rede]} rotulo={`Copiar ${rotulo}`} />
                </div>
              </div>
              <dd className="whitespace-pre-line text-ink">{conceito.legenda[rede]}</dd>
            </div>
          ))}
        </dl>
      </MaisDetalhes>

      <div className="mt-auto pt-1">
        {video ? (
          <VideoDoConceito video={video} aviso={avisoVideo} onRefazer={videoTerminou(video) && podeGerar ? () => onGerar(conceito) : undefined} />
        ) : (
          <>
            <button type="button" className="btn-primary" disabled={!podeGerar} onClick={() => onGerar(conceito)}>Gerar este vídeo</button>
            {motivo && <p className="text-muted text-[13px] mt-2 text-center">{motivo}</p>}
          </>
        )}
      </div>
    </section>
  );
}

/** Copia um texto para a área de transferência; devolve false quando o navegador não permite (o chamador avisa na tela). */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

/** Baixa um texto como arquivo .txt (mesmo padrão dos outros apps: Blob + link temporário). */
function baixarTexto(nomeArquivo: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Abre o arquivo do vídeo pronto para baixar (o endereço é do provedor, então o navegador abre em outra aba quando não consegue salvar direto). */
function baixarVideo(video: Video) {
  if (!video.url) return;
  const a = document.createElement("a");
  a.href = video.url;
  a.download = `${nomeDeArquivo(video.efeito)}-${video.formato.replace(":", "x")}.mp4`;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Intervalo entre consultas do andamento de um vídeo no Higgsfield. */
const INTERVALO_ACOMPANHAMENTO_MS = 5000;

/** Envio da imagem do produto depois dos conceitos criados: PATCH /api/conceitos/<id>, sem refazer nada. */
function EnvioDaImagem({ id, onImagem }: { id: string; onImagem: (dataUrl: string) => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  async function escolher(f: File | null) {
    setAviso(null);
    setArquivo(f);
    if (!f) return;
    if (!/^image\/(png|jpeg)$/.test(f.type)) { setArquivo(null); setAviso("Envie uma imagem PNG ou JPG."); return; }
    if (f.size > 5 * 1024 * 1024) { setArquivo(null); setAviso("A imagem passa de 5 MB. Reduza e envie de novo."); return; }
    setEnviando(true);
    try {
      const imagemDataUrl = await lerComoDataUrl(f);
      const r = await fetch(`/api/conceitos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imagemDataUrl }) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (r.status === 401 && info.codigo === "sem_sessao") { router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`); return; }
        setArquivo(null);
        setAviso(info.mensagem);
        return;
      }
      onImagem(imagemDataUrl);
    } catch (e) {
      setArquivo(null);
      setAviso((await lerErro(e)).mensagem);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="card p-4 mb-4">
      <h3 className="font-bold text-[15px] mb-1">Falta a imagem do produto</h3>
      <p className="text-muted text-sm mb-3">Envie agora para gerar o vídeo. Os conceitos continuam os mesmos.</p>
      <div className="dropzone-curta"><Dropzone id="imagem-depois" accept="image/png,image/jpeg" tiposLabel="Uma foto com fundo limpo, em PNG ou JPG" maxSizeMB={5} arquivo={arquivo} onArquivo={escolher} /></div>
      {enviando && <p className="text-muted text-[13px] mt-2">Guardando a imagem...</p>}
      {aviso && <div className="mt-3"><Aviso tom="danger">{aviso}</Aviso></div>}
    </div>
  );
}

/**
 * Resultado completo (cabeçalho, proveniência e os três conceitos), reaproveitado pela página /r/[id]. Também cuida da
 * geração dos vídeos: abre o diálogo de confirmação, guarda o vídeo mais recente de cada conceito e consulta o andamento
 * dos pendentes a cada 5 s. `conectado` diz se o Higgsfield está autorizado; `videosIniciais` vêm do banco em /r/[id].
 */
export function Resultado({ campanha: campanhaInicial, meta, id, conectado = false, videosIniciais = [], paraCaptura = false }: { campanha: Campanha; meta: Meta; id: string; conectado?: boolean; videosIniciais?: Video[]; paraCaptura?: boolean }) {
  // A imagem do produto pode chegar depois dos conceitos (EnvioDaImagem), então a campanha é estado local.
  const [campanha, setCampanha] = useState<Campanha>(campanhaInicial);
  const b = campanha.briefing;
  const [videos, setVideos] = useState<Record<string, Video>>(() => {
    const porConceito: Record<string, Video> = {};
    // Mais recentes primeiro: o primeiro de cada conceito vence.
    for (const v of videosIniciais) if (!porConceito[v.conceitoId]) porConceito[v.conceitoId] = v;
    return porConceito;
  });
  const [dialogo, setDialogo] = useState<Conceito | null>(null);
  const [avisoVideo, setAvisoVideo] = useState<string | null>(null);
  const [falhaCopia, setFalhaCopia] = useState(false);

  async function copiarLegenda(texto: string) {
    const ok = await copiarTexto(texto);
    setFalhaCopia(!ok);
    if (!ok) setTimeout(() => setFalhaCopia(false), 4000);
  }

  const pendentes = Object.values(videos).filter((v) => !videoTerminou(v));
  // O vídeo pronto mais recente define o "conceito escolhido": é dele que saem "Baixar vídeo" e as legendas.
  const videoPronto = Object.values(videos)
    .filter((v) => v.estado === "pronto" && v.url)
    .sort((a, b2) => b2.atualizadoEm.localeCompare(a.atualizadoEm))[0];
  const conceitoEscolhido = videoPronto ? campanha.conceitos.find((c) => c.id === videoPronto.conceitoId) : undefined;
  // Sem conceito escolhido, a legenda de cada rede já tem um botão próprio dentro do cartão: o menu "Mais"
  // não repete as três legendas somadas, que ninguém publica assim.
  const extras = [
    ...(videoPronto ? [{ rotulo: "Baixar vídeo", onClick: () => baixarVideo(videoPronto) }] : []),
    ...(conceitoEscolhido ? REDES.map(({ rede, rotulo }: { rede: Rede; rotulo: string }) => ({ rotulo: `Copiar legenda do ${rotulo}`, onClick: () => copiarLegenda(legendaEmTexto(campanha, rede, conceitoEscolhido)) })) : []),
    { rotulo: "Baixar roteiro (texto)", onClick: () => baixarTexto(`${nomeDeArquivo(campanha.titulo)}-roteiro.txt`, roteiroEmTexto(campanha)) },
  ];

  // Consulta o andamento dos vídeos pendentes a cada 5 s. `videos` muda a cada resposta, e reiniciar o intervalo
  // nesse momento mantém o ritmo de 5 s depois da última atualização.
  useEffect(() => {
    const ids = Object.values(videos).filter((v) => !videoTerminou(v)).map((v) => v.id);
    if (ids.length === 0) return;
    const timer = setInterval(() => {
      for (const videoId of ids) {
        fetch(`/api/videos/${videoId}`)
          .then(async (r) => {
            const resposta = await r.json();
            if (r.ok && resposta.video) {
              setAvisoVideo(null);
              setVideos((atual) => ({ ...atual, [resposta.video.conceitoId]: resposta.video }));
            } else {
              setAvisoVideo(resposta.error || "Não foi possível consultar o andamento. Tentando de novo em instantes.");
            }
          })
          .catch(() => setAvisoVideo("Sem resposta do servidor. Tentando de novo em instantes."));
      }
    }, INTERVALO_ACOMPANHAMENTO_MS);
    return () => clearInterval(timer);
  }, [videos]);

  function iniciado(video: Video) {
    setDialogo(null);
    setAvisoVideo(null);
    setVideos((atual) => ({ ...atual, [video.conceitoId]: video }));
  }

  return (
    <article className="reveal" data-id={id}>
      <ResultHead titulo={campanha.titulo} subtitulo={`${rotuloFormato(b.formato)} · ${b.duracaoSeg} s · ${rotuloObjetivo(b.objetivo)}`}>
        <Entregar id={id} titulo={campanha.titulo} texto={() => roteiroEmTexto(campanha)} extras={extras} />
      </ResultHead>
      <Origem meta={meta} />
      {falhaCopia && <div className="mb-4"><Aviso tom="danger">Não foi possível copiar automaticamente. Abra a legenda no conceito e copie com Ctrl+C (ou Cmd+C no Mac).</Aviso></div>}

      {/* A frase do Higgsfield aparece UMA vez, acima dos três cartões, e leva ao cartão dele na configuração. */}
      {!conectado && (
        <div className="mb-4">
          <Aviso>
            Os conceitos estão prontos. Para gerar o vídeo de verdade, conecte o Higgsfield:{" "}
            <a className="btn-link text-[13px]" href="/setup#higgsfield">Conectar o Higgsfield</a>
          </Aviso>
        </div>
      )}
      {conectado && !b.imagemDataUrl && (
        <EnvioDaImagem id={id} onImagem={(imagemDataUrl) => setCampanha((c) => ({ ...c, briefing: { ...c.briefing, imagemDataUrl } }))} />
      )}

      <div className="grid gap-4 md:grid-cols-3 items-stretch">
        {campanha.conceitos.map((c, i) => (
          <CartaoConceito
            key={c.id}
            conceito={c}
            briefing={b}
            indice={i}
            video={videos[c.id]}
            conectado={conectado}
            bloqueado={pendentes.length > 0}
            semImagem={!b.imagemDataUrl}
            avisoVideo={videos[c.id] && !videoTerminou(videos[c.id]) ? avisoVideo : null}
            paraCaptura={paraCaptura}
            onGerar={setDialogo}
          />
        ))}
      </div>
      {dialogo && <DialogoGerar campanhaId={id} conceito={dialogo} onFechar={() => setDialogo(null)} aoIniciar={iniciado} />}
    </article>
  );
}

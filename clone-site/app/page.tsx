"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Aviso, Dropzone, ErrorBox, Field, Hero, Loading, MaisDetalhes, Origem, Passos, Privacidade, ResultHead, Row, Stage, Topbar, data, lerErro, useScrollToResult, useStatus, type PassoIndicador } from "@/components/ui";
import { EditorPagina } from "@/components/EditorPagina";
import { EntregarPagina } from "@/components/EntregarPagina";
import { PreviaPagina } from "@/components/PreviaPagina";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import type { Marca, Pagina, Stack } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

type Formulario = { stack: Stack; instrucoes: string; marcaNome: string; corPrimaria: string; corSecundaria: string };

const FORMATOS: { valor: Stack; rotulo: string }[] = [
  { valor: "html-tailwind", rotulo: "HTML com Tailwind" },
  { valor: "html-css", rotulo: "HTML com CSS" },
];

const VAZIO: Formulario = { stack: "html-tailwind", instrucoes: "", marcaNome: "", corPrimaria: "", corSecundaria: "" };

/** Marca do exemplo (a captura de exemplo mora em public/exemplo-referencia.png). */
const EXEMPLO: Formulario = { stack: "html-tailwind", instrucoes: "", marcaNome: "Nimbus Finanças", corPrimaria: "#0f766e", corSecundaria: "#f59e0b" };
const ARQUIVO_EXEMPLO = "/exemplo-referencia.png";

const LIMITE_MB = 5;
const ETAPAS_CARREGANDO = ["Lendo a captura...", "Reconhecendo a estrutura da página...", "Escrevendo o código com a sua marca...", "Conferindo o arquivo gerado..."];
const COR_HEX = /^#[0-9a-f]{6}$/i;

// Textos do hero (economia de texto: título ≤ 8 palavras, apoio ≤ 20, itens ≤ 5 de até 6 palavras — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Marketing e Produto",
  titulo: "A sua página em minutos",
  apoio: "Envie a captura de uma página e receba a sua versão, na sua marca.",
  itens: [
    "Página pronta em um arquivo",
    "Textos em português, na sua marca",
    "Prévia no computador e no celular",
    "Link público para compartilhar",
    "Ajustes por instrução, sem código",
  ],
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Referência", apoio: "A captura que você gosta" },
  { titulo: "Marca", apoio: "Nome e cores" },
  { titulo: "Página", apoio: "Prévia e link no ar" },
];

function IconeReferencia() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M3 9h18" />
      <path d="M7 13h5M7 16h8" />
    </svg>
  );
}

function IconeMarca() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5 4.5 7v5.5c0 4.2 3.1 7.3 7.5 8.5 4.4-1.2 7.5-4.3 7.5-8.5V7L12 3.5Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
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

/** Prévia de "o que você vai receber", exibida no lugar do resultado antes de gerar a primeira página. */
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

type Tentativa = { imagem: string; form: Formulario };
type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string }; tentativa?: Tentativa }
  | { fase: "pronto"; pagina: Pagina; meta: Meta; id: string; referencia?: string };

function lerComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    leitor.readAsDataURL(arquivo);
  });
}

function montarMarca(f: Formulario): Marca | undefined {
  const nome = f.marcaNome.trim();
  const corPrimaria = f.corPrimaria.trim();
  const corSecundaria = f.corSecundaria.trim();
  if (!nome && !corPrimaria && !corSecundaria) return undefined;
  const marca: Marca = { nome, corPrimaria };
  if (corSecundaria) marca.corSecundaria = corSecundaria;
  return marca;
}

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [captura, setCaptura] = useState<string | null>(null);
  const [endereco, setEndereco] = useState("");
  const [buscandoEndereco, setBuscandoEndereco] = useState(false);
  const [servicoConectado, setServicoConectado] = useState<boolean | null>(null);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [avisoArquivo, setAvisoArquivo] = useState<{ tom: "warn" | "danger"; texto: string; acao?: { rotulo: string; url: string } } | null>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  useEffect(() => {
    fetch("/api/pagina").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
    fetch("/api/captura").then((r) => r.json()).then((r) => setServicoConectado(Boolean(r.servicoConectado))).catch(() => setServicoConectado(false));
  }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todas as páginas salvas? Essa ação não pode ser desfeita.")) return;
    fetch("/api/pagina", { method: "DELETE" })
      .then(() => fetch("/api/pagina").then((r) => r.json()).then((r) => setHistorico(r.itens)))
      .catch(() => setHistorico([]));
  }

  const set = (campo: keyof Formulario) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  function escolherArquivo(f: File | null) {
    setAvisoArquivo(null);
    setCaptura(null);
    if (!f) { setArquivo(null); return; }
    if (!/^image\/(png|jpeg)$/.test(f.type)) { setArquivo(null); setAvisoArquivo({ tom: "danger", texto: "Envie uma imagem PNG ou JPG." }); return; }
    if (f.size > LIMITE_MB * 1024 * 1024) { setArquivo(null); setAvisoArquivo({ tom: "danger", texto: `A captura passa de ${LIMITE_MB} MB. Reduza a imagem e envie de novo.` }); return; }
    setArquivo(f);
    lerComoDataUrl(f).then(setCaptura).catch(() => setCaptura(null));
  }

  /** "ou cole um endereço": uma imagem publicada é baixada direto; um site vira captura pelo serviço de /setup. */
  async function trazerDoEndereco() {
    if (!endereco.trim()) { setAvisoArquivo({ tom: "danger", texto: "Cole o endereço da captura ou do site de referência." }); return; }
    setBuscandoEndereco(true);
    setAvisoArquivo(null);
    try {
      const r = await fetch("/api/captura", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: endereco }) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (r.status === 401 && info.codigo === "sem_sessao") { router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`); return; }
        setAvisoArquivo({ tom: "danger", texto: info.mensagem, acao: info.acao });
        return;
      }
      const resposta = await r.json();
      setArquivo(null);
      setCaptura(resposta.imagem);
      setAvisoArquivo({ tom: "warn", texto: resposta.origem === "site" ? "Captura pronta a partir do site." : "Captura pronta a partir do endereço." });
    } catch (e) {
      setAvisoArquivo({ tom: "danger", texto: (await lerErro(e)).mensagem });
    } finally {
      setBuscandoEndereco(false);
    }
  }

  async function gerar(imagem: string, f: Formulario) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/pagina", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagem, stack: f.stack, instrucoes: f.instrucoes, marca: montarMarca(f) }),
      });
      if (!r.ok) {
        // lerErro lê { error, codigo, acao } da rota (respostaErro) e nunca deixa status HTTP cru chegar à tela.
        const info = await lerErro(r);
        if (r.status === 401 && info.codigo === "sem_sessao") {
          router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
          return;
        }
        setEstado({ fase: "erro", mensagem: info.mensagem, codigo: info.codigo as CodigoErroIA | undefined, acao: info.acao, tentativa: { imagem, form: f } });
        return;
      }
      const resposta = await r.json();
      setEstado({ fase: "pronto", pagina: resposta.pagina, meta: resposta.meta, id: resposta.id, referencia: imagem });
      fetch("/api/pagina").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
    } catch (e) {
      const info = await lerErro(e);
      setEstado({ fase: "erro", mensagem: info.mensagem, tentativa: { imagem, form: f } });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!captura) { setAvisoArquivo({ tom: "danger", texto: "Envie a captura da página de referência antes de gerar." }); return; }
    gerar(captura, form);
  }

  async function capturaDeExemplo(): Promise<string> {
    const r = await fetch(ARQUIVO_EXEMPLO);
    if (!r.ok) throw new Error("A captura de exemplo não está disponível.");
    return lerComoDataUrl(new File([await r.blob()], "referencia-exemplo.png", { type: "image/png" }));
  }

  /** "Usar uma referência de exemplo" preenche E gera: quem quer ver o resultado não precisa rolar até o botão. */
  function usarExemplo() {
    setForm(EXEMPLO);
    setArquivo(null);
    capturaDeExemplo()
      .then((imagem) => { setCaptura(imagem); gerar(imagem, EXEMPLO); })
      .catch(() => setAvisoArquivo({ tom: "danger", texto: "A captura de exemplo não está disponível. Envie a sua." }));
  }

  // Atalho para demonstrações: /?exemplo=1 carrega a captura de exemplo, preenche a marca e envia.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => {
        setForm(EXEMPLO);
        capturaDeExemplo()
          .then((imagem) => { setCaptura(imagem); gerar(imagem, EXEMPLO); })
          .catch((e) => setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." }));
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const carregando = estado.fase === "carregando";
  const corPrimariaValida = COR_HEX.test(form.corPrimaria) ? form.corPrimaria : "#792a3f";
  const corSecundariaValida = COR_HEX.test(form.corSecundaria) ? form.corSecundaria : "#bc342f";
  const passoAtual = estado.fase === "pronto" ? 3 : captura ? 2 : 1;

  return (
    <>
      <Topbar marca="C" nome="Clone de Site" area="Marketing e Produto" status={status} erro={erro} resumo="Modo demonstração: a página exibida é um exemplo." usuario={status?.usuario} />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Marketing">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          <form onSubmit={onSubmit}>
            <CartaoEntrada icone={<IconeReferencia />} titulo="A referência">
              <Field label="Captura da página" htmlFor="captura">
                <div className="dropzone-baixa"><Dropzone id="captura" accept="image/png,image/jpeg" tiposLabel="A página inteira, em PNG ou JPG" maxSizeMB={LIMITE_MB} arquivo={arquivo} onArquivo={escolherArquivo} /></div>
                {captura && (
                  <div className="mt-2.5 flex items-center gap-3">
                    <div
                      role="img"
                      aria-label="Miniatura da captura enviada"
                      className="w-[76px] h-[52px] shrink-0 rounded-[7px] border border-line bg-white bg-top bg-cover"
                      style={{ backgroundImage: `url("${captura}")` }}
                    />
                    <button type="button" className="btn-link text-[13px]" onClick={() => { setArquivo(null); setCaptura(null); setAvisoArquivo(null); }}>Trocar a captura</button>
                  </div>
                )}
              </Field>

              <Field
                label="Ou cole um endereço"
                htmlFor="endereco"
                hint={servicoConectado ? "O endereço de uma imagem ou de um site que você quer usar como referência." : "O endereço de uma imagem já publicada (terminado em .png ou .jpg)."}
              >
                <div className="flex gap-2 max-md:flex-col">
                  <input id="endereco" type="url" className="input flex-1 min-w-0" placeholder="https://..." value={endereco} onChange={(e) => setEndereco(e.target.value)} />
                  <button type="button" className="btn-ghost shrink-0 max-w-full whitespace-normal" disabled={buscandoEndereco || carregando} onClick={trazerDoEndereco}>
                    {buscandoEndereco ? "Buscando..." : "Trazer"}
                  </button>
                </div>
              </Field>
              {avisoArquivo && (
                <div className="mb-4">
                  <Aviso tom={avisoArquivo.tom} acao={avisoArquivo.acao}>{avisoArquivo.texto}</Aviso>
                </div>
              )}
            </CartaoEntrada>

            <CartaoEntrada icone={<IconeMarca />} titulo="A sua marca">
              <Row>
                <Field label="Nome da marca" htmlFor="marcaNome">
                  <input id="marcaNome" className="input" placeholder="Entra no lugar do nome da referência" value={form.marcaNome} onChange={set("marcaNome")} />
                </Field>
                <Field label="Cor principal" htmlFor="corPrimaria">
                  <div className="flex gap-2 items-center">
                    <input id="corPrimaria" className="input" placeholder="#0f766e" value={form.corPrimaria} onChange={set("corPrimaria")} />
                    <input type="color" aria-label="Escolher a cor principal" className="w-11 h-11 shrink-0 rounded-[10px] border border-line bg-white cursor-pointer" value={corPrimariaValida} onChange={set("corPrimaria")} />
                  </div>
                </Field>
              </Row>
              <MaisDetalhes>
                <Field label="Cor secundária (opcional)" htmlFor="corSecundaria">
                  <div className="flex gap-2 items-center">
                    <input id="corSecundaria" className="input" placeholder="#f59e0b" value={form.corSecundaria} onChange={set("corSecundaria")} />
                    <input type="color" aria-label="Escolher a cor secundária" className="w-11 h-11 shrink-0 rounded-[10px] border border-line bg-white cursor-pointer" value={corSecundariaValida} onChange={set("corSecundaria")} />
                  </div>
                </Field>
                <Field label="O que mudar em relação à referência (opcional)" htmlFor="instrucoes">
                  <textarea id="instrucoes" className="input min-h-20 resize-y" placeholder="Ex.: troque o formulário de contato por um botão de WhatsApp; deixe o cabeçalho escuro." value={form.instrucoes} onChange={set("instrucoes")} />
                </Field>
                <Field label="Formato do arquivo" htmlFor="formato" hint="Tailwind facilita ajustes rápidos; CSS puro não depende de nada externo.">
                  <select id="formato" className="input" value={form.stack} onChange={set("stack")}>
                    {FORMATOS.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
                  </select>
                </Field>
              </MaisDetalhes>
            </CartaoEntrada>

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Gerando a página" : "Gerar a página"}</button>
            <button type="button" className="btn-secundario mt-2" disabled={carregando} onClick={usarExemplo}>Usar uma referência de exemplo</button>
          </form>

          <div className="card p-5 mt-4">
            <Privacidade detalhe="A captura é usada só para gerar a página e não fica salva. O código gerado fica neste app até você apagar." />

            <MaisDetalhes titulo="Últimos resultados">
              {historico === null ? (
                <p className="text-muted text-sm">Carregando...</p>
              ) : historico.length === 0 ? (
                <p className="text-muted text-sm">Nenhuma página salva ainda.</p>
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
          {estado.fase === "vazio" && <Previa itens={PROMESSA.itens} />}
          {estado.fase === "carregando" && (
            <div className="flex flex-col gap-3">
              <Loading etapas={ETAPAS_CARREGANDO} />
              {status?.ai && <p className="text-muted text-[13px] text-center">Isso leva de 1 a 2 minutos com o modelo gratuito.</p>}
            </div>
          )}
          {estado.fase === "erro" && (
            <ErrorBox
              mensagem={estado.mensagem}
              codigo={estado.codigo}
              acao={estado.acao}
              onTentarNovamente={estado.tentativa ? () => gerar(estado.tentativa!.imagem, estado.tentativa!.form) : undefined}
            />
          )}
          {estado.fase === "pronto" && <Resultado key={estado.id} pagina={estado.pagina} meta={estado.meta} id={estado.id} referencia={estado.referencia} />}
        </Stage>
      </main>
    </>
  );
}

function rotuloFormato(html: string): string {
  return /cdn\.tailwindcss\.com/.test(html) ? "HTML com Tailwind" : "HTML com CSS";
}

/** Resultado completo (cabeçalho, proveniência, prévia e editor de versões), reaproveitado pela página /r/[id]. */
export function Resultado({ pagina: inicial, meta: metaInicial, id, referencia }: { pagina: Pagina; meta: Meta; id: string; referencia?: string }) {
  // A página muda a cada edição/volta de versão sem sair da tela; a proveniência exibida passa a ser a da última mudança.
  const [pagina, setPagina] = useState<Pagina>(inicial);
  const [meta, setMeta] = useState<Meta>(metaInicial);
  const atual = pagina.versoes[pagina.versoes.length - 1];
  const modeloGratuito = !meta.demo && meta.model.endsWith(":free");
  return (
    <article className="reveal" data-id={id} data-versao={atual.n}>
      {/* Subtítulo sem o nome da marca: ele já está no título da página gerada, logo acima. */}
      <ResultHead titulo={pagina.titulo} subtitulo={`Versão ${atual.n} · ${rotuloFormato(atual.html)}`}>
        <EntregarPagina id={id} titulo={pagina.titulo} html={atual.html} versao={atual.n} />
      </ResultHead>
      {/* A faixa logo abaixo é que explica o que aconteceu e o que fazer; aqui fica só a proveniência. */}
      <Origem meta={meta} demoTexto="Exemplo ilustrativo, sem usar inteligência artificial." />

      {meta.demo && (
        <div className="mb-4">
          <Aviso>
            Esta é uma página de exemplo fixa: a sua captura não foi lida.{" "}
            <a className="btn-link text-[13px]" href="/setup#openrouter">Conecte a inteligência artificial para gerar a sua versão</a>
          </Aviso>
        </div>
      )}
      {modeloGratuito && (
        <div className="mb-4">
          <Aviso>
            Gerado com o modelo gratuito.{" "}
            <a className="btn-link text-[13px]" href="/setup#qualidade-da-pagina">Para páginas mais fiéis, troque o modelo que lê a captura</a>
          </Aviso>
        </div>
      )}

      <PreviaPagina key={atual.n} html={atual.html} titulo={pagina.titulo} referencia={referencia} />
      <EditorPagina pagina={pagina} demo={meta.demo} onAtualizada={(nova, novaMeta) => { setPagina(nova); if (novaMeta) setMeta(novaMeta); }} />
    </article>
  );
}

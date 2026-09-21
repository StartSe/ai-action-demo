"use client";
// Tela inicial: "Criar um site" à esquerda (três caminhos: clonar uma referência, pelo endereço do site ou
// descrevendo a empresa; mais a marca) e "Meus sites" à direita, com estado por site. Criar não espera a
// geração: o site entra no topo da lista em "Gerando" e a pessoa pode sair da tela (o sino avisa ao terminar).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Aviso, Dropzone, Field, Hero, MaisDetalhes, Passos, Privacidade, Row, Stage, lerErro, type PassoIndicador } from "@/components/ui";
import { AmpliarImagem } from "@/components/Ampliar";
import { MeusSites, buscarSites } from "@/components/MeusSites";
import { TopbarSite } from "@/components/TopbarSite";
import type { OrigemProjeto, Projeto, Stack } from "@/lib/types";

type Aba = OrigemProjeto | "endereco";
type Formulario = { nomeSite: string; stack: Stack; instrucoes: string; marcaNome: string; corPrimaria: string; corSecundaria: string; briefing: string };

const FORMATOS: { valor: Stack; rotulo: string }[] = [
  { valor: "html-tailwind", rotulo: "HTML com Tailwind" },
  { valor: "html-css", rotulo: "HTML com CSS" },
];

const ABAS: { valor: Aba; rotulo: string }[] = [
  { valor: "referencia", rotulo: "Clonar uma referência" },
  { valor: "endereco", rotulo: "Pelo endereço do site" },
  { valor: "briefing", rotulo: "Descrever a empresa" },
];

const VAZIO: Formulario = { nomeSite: "", stack: "html-tailwind", instrucoes: "", marcaNome: "", corPrimaria: "", corSecundaria: "", briefing: "" };

/** Marca do exemplo (a captura de exemplo mora em public/exemplo-referencia.png). */
const EXEMPLO: Formulario = { ...VAZIO, nomeSite: "Nimbus Finanças", marcaNome: "Nimbus Finanças", corPrimaria: "#0f766e", corSecundaria: "#f59e0b" };
const ARQUIVO_EXEMPLO = "/exemplo-referencia.png";

const LIMITE_MB = 5;
const COR_HEX = /^#[0-9a-f]{6}$/i;
const MINIMO_BRIEFING = 20;

// Textos do hero (economia de texto: título ≤ 8 palavras, apoio ≤ 20, itens ≤ 5 de até 6 palavras — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Marketing e Produto",
  titulo: "O site da sua empresa, no ar hoje",
  apoio: "Clone uma referência ou descreva a empresa. Um agente edita, publica e mede o site com você.",
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Referência ou briefing", apoio: "De onde o site nasce" },
  { titulo: "Marca e imagens", apoio: "Nome, cores e logo" },
  { titulo: "No ar com o agente", apoio: "Link, edições e métricas" },
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

/** Cartão de entrada com ícone circular e título. */
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

function lerComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    leitor.readAsDataURL(arquivo);
  });
}

function montarMarca(f: Formulario) {
  const nome = f.marcaNome.trim();
  const corPrimaria = f.corPrimaria.trim();
  const corSecundaria = f.corSecundaria.trim();
  if (!nome && !corPrimaria && !corSecundaria) return undefined;
  return { nome, corPrimaria, ...(corSecundaria ? { corSecundaria } : {}) };
}

type AvisoTela = { tom: "ok" | "warn" | "danger"; texto: string; acao?: { rotulo: string; url: string } };

export default function Page() {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("referencia");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [captura, setCaptura] = useState<string | null>(null);
  const [endereco, setEndereco] = useState("");
  const [buscandoEndereco, setBuscandoEndereco] = useState(false);
  const [servicoConectado, setServicoConectado] = useState<boolean | null>(null);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [nomeDigitado, setNomeDigitado] = useState(false);
  const [aviso, setAviso] = useState<AvisoTela | null>(null);
  const [criando, setCriando] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [sites, setSites] = useState<Projeto[] | null>(null);
  const autoEnviado = useRef(false);
  const leituraAtual = useRef(0);

  useEffect(() => {
    fetch("/api/captura").then((r) => r.json()).then((r) => setServicoConectado(Boolean(r.servicoConectado))).catch(() => setServicoConectado(false));
  }, []);

  const set = (campo: keyof Formulario) => (e: { target: { value: string } }) => {
    const valor = e.target.value;
    setForm((f) => {
      const proximo = { ...f, [campo]: valor };
      // O nome do site acompanha o nome da marca até a pessoa digitar um nome próprio.
      if (campo === "marcaNome" && !nomeDigitado) proximo.nomeSite = valor;
      return proximo;
    });
    if (campo === "nomeSite") setNomeDigitado(valor.trim().length > 0);
  };

  async function escolherArquivo(f: File | null) {
    if (!f || criando || preparando || buscandoEndereco) return;
    setAviso(null);
    if (!/^image\/(png|jpeg)$/.test(f.type)) { setAviso({ tom: "danger", texto: captura ? "Envie uma imagem PNG ou JPG. A referência anterior foi mantida." : "Envie uma imagem PNG ou JPG." }); return; }
    if (f.size > LIMITE_MB * 1024 * 1024) { setAviso({ tom: "danger", texto: `A captura passa de ${LIMITE_MB} MB. Reduza a imagem e envie de novo.` }); return; }
    const leitura = ++leituraAtual.current;
    setPreparando(true);
    try {
      const imagem = await lerComoDataUrl(f);
      if (leitura !== leituraAtual.current) return;
      setArquivo(f);
      setCaptura(imagem);
    } catch {
      if (leitura === leituraAtual.current) setAviso({ tom: "danger", texto: "Não foi possível ler a imagem. Escolha o arquivo novamente." });
    } finally {
      if (leitura === leituraAtual.current) setPreparando(false);
    }
  }

  /** Aba "Pelo endereço do site": uma imagem publicada é baixada direto; um site vira captura pelo serviço configurado. */
  async function trazerDoEndereco(): Promise<string | null> {
    if (!endereco.trim()) { setAviso({ tom: "danger", texto: "Cole o endereço do site de referência, começando com https://." }); return null; }
    const leitura = ++leituraAtual.current;
    setBuscandoEndereco(true);
    setAviso(null);
    try {
      const r = await fetch("/api/captura", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: endereco }) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (r.status === 401 && info.codigo === "sem_sessao") { router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`); return null; }
        setAviso({ tom: "danger", texto: info.mensagem, acao: info.acao });
        return null;
      }
      const resposta = await r.json();
      if (leitura !== leituraAtual.current) return null;
      setArquivo(null);
      setCaptura(resposta.imagem);
      setAviso({ tom: "ok", texto: resposta.origem === "site" ? "Captura pronta a partir do site." : "Captura pronta a partir do endereço." });
      return resposta.imagem as string;
    } catch (e) {
      setAviso({ tom: "danger", texto: (await lerErro(e)).mensagem });
      return null;
    } finally {
      setBuscandoEndereco(false);
    }
  }

  /** Cria o site e dispara a geração; a tela não espera: o site entra no topo de "Meus sites" em "Gerando". */
  async function criar(origem: OrigemProjeto, f: Formulario, imagem?: string) {
    if (criando) return;
    setCriando(true);
    setAviso(null);
    try {
      const corpo = {
        nome: f.nomeSite.trim() || f.marcaNome.trim() || undefined,
        origem,
        imagem,
        briefing: origem === "briefing" ? f.briefing.trim() : undefined,
        stack: f.stack,
        instrucoes: f.instrucoes,
        marca: montarMarca(f),
        gerar: true,
      };
      const r = await fetch("/api/sites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (r.status === 401 && info.codigo === "sem_sessao") { router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`); return; }
        setAviso({ tom: "danger", texto: info.mensagem, acao: info.acao });
        return;
      }
      const { projeto } = (await r.json()) as { projeto: Projeto };
      setSites((lista) => [projeto, ...(lista ?? []).filter((s) => s.id !== projeto.id)]);
      setForm(VAZIO);
      setNomeDigitado(false);
      setArquivo(null);
      setCaptura(null);
      setEndereco("");
      setAviso({ tom: "ok", texto: `Estamos criando «${projeto.nome}». Você pode sair desta tela: avisamos no sino quando ficar pronto.` });
      const stage = document.getElementById("stage");
      if (stage && window.matchMedia("(max-width: 767px)").matches && !new URLSearchParams(location.search).get("captura")) stage.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      setAviso({ tom: "danger", texto: (await lerErro(e)).mensagem });
    } finally {
      setCriando(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (criando || preparando || buscandoEndereco) return;
    if ([form.corPrimaria, form.corSecundaria].some((cor) => cor.trim() && !COR_HEX.test(cor.trim()))) { setAviso({ tom: "danger", texto: "Use seis dígitos nas cores, como #792a3f, ou escolha pela paleta." }); return; }
    if (aba === "briefing") {
      if (form.briefing.trim().length < MINIMO_BRIEFING) { setAviso({ tom: "danger", texto: "Conte em pelo menos uma frase o que a empresa faz e o que o site precisa ter." }); return; }
      await criar("briefing", form);
      return;
    }
    let imagem = captura;
    if (aba === "endereco" && !imagem) imagem = await trazerDoEndereco();
    if (!imagem) { if (aba === "referencia") setAviso({ tom: "danger", texto: "Envie a captura da página de referência antes de criar o site." }); return; }
    await criar("referencia", form, imagem);
  }

  async function capturaDeExemplo(): Promise<string> {
    const r = await fetch(ARQUIVO_EXEMPLO);
    if (!r.ok) throw new Error("A captura de exemplo não está disponível.");
    return lerComoDataUrl(new File([await r.blob()], "referencia-exemplo.png", { type: "image/png" }));
  }

  /** Preenche para revisão antes de criar. */
  async function usarExemplo() {
    if (criando) return;
    setPreparando(true);
    const leitura = ++leituraAtual.current;
    try {
      const imagem = await capturaDeExemplo();
      if (leitura !== leituraAtual.current) return;
      setAba("referencia");
      setForm(EXEMPLO);
      setNomeDigitado(true);
      setArquivo(null);
      setCaptura(imagem);
      setAviso(null);
      document.getElementById("criar-site")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      setAviso({ tom: "danger", texto: "A captura de exemplo não está disponível. Envie a sua." });
    } finally {
      setPreparando(false);
    }
  }

  // Atalho para demonstrações: /?exemplo=1 carrega a captura de exemplo, preenche a marca e cria o site.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => {
        setForm(EXEMPLO);
        capturaDeExemplo()
          .then((imagem) => { setCaptura(imagem); return criar("referencia", EXEMPLO, imagem); })
          .catch(async (e) => setAviso({ tom: "danger", texto: (await lerErro(e)).mensagem }));
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const ocupado = criando || preparando || buscandoEndereco;
  const corPrimariaValida = COR_HEX.test(form.corPrimaria) ? form.corPrimaria : "#792a3f";
  const corSecundariaValida = COR_HEX.test(form.corSecundaria) ? form.corSecundaria : "#bc342f";
  const temSites = Boolean(sites && sites.length);
  const passoAtual = temSites ? 3 : captura || form.briefing.trim().length >= MINIMO_BRIEFING ? 2 : 1;
  const podeCriar = aba === "briefing" ? form.briefing.trim().length >= MINIMO_BRIEFING : aba === "endereco" ? Boolean(captura || endereco.trim()) : Boolean(captura);

  const statusTexto = preparando
    ? "Preparando a referência..."
    : buscandoEndereco
      ? "Buscando a captura. Isso pode levar até 90 segundos."
      : criando
        ? "Criando o site..."
        : aba === "briefing"
          ? form.briefing.trim().length < MINIMO_BRIEFING ? "Conte o que a empresa faz para começar." : "Confira a marca e crie o site."
          : !captura
            ? aba === "endereco" ? "Cole o endereço e crie: a captura é feita sozinha." : "Escolha uma referência para começar."
            : "Confira a referência e a marca antes de criar.";

  return (
    <>
      <TopbarSite />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Marketing">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          <form onSubmit={onSubmit} id="criar-site">
            <fieldset disabled={ocupado} className="min-w-0">
              <CartaoEntrada icone={<IconeReferencia />} titulo="Criar um site">
                <div role="tablist" aria-label="De onde o site nasce" className="flex gap-1 p-1 border border-line rounded-[10px] bg-surface mb-4 max-md:flex-col">
                  {ABAS.map((a) => (
                    <button
                      key={a.valor}
                      type="button"
                      role="tab"
                      aria-selected={aba === a.valor}
                      className={`flex-1 px-3 py-2 rounded-lg text-[13.5px] font-bold cursor-pointer transition-colors ${aba === a.valor ? "bg-accent text-white" : "text-ink hover:bg-bg"}`}
                      onClick={() => { setAba(a.valor); setAviso(null); }}
                    >
                      {a.rotulo}
                    </button>
                  ))}
                </div>

                {aba === "referencia" && (
                  <Field label="Captura da página de referência" htmlFor="captura">
                    <div className="dropzone-baixa"><Dropzone id="captura" accept="image/png,image/jpeg" tiposLabel="A página inteira, em PNG ou JPG" maxSizeMB={LIMITE_MB} arquivo={arquivo} onArquivo={escolherArquivo} /></div>
                    {captura && (
                      <div className="mt-2.5 flex items-center gap-3">
                        <AmpliarImagem src={captura} />
                        <span className="text-sm text-ink-2">Referência pronta</span>
                        <button type="button" className="btn-link text-[13px]" onClick={() => { leituraAtual.current++; setArquivo(null); setCaptura(null); setAviso(null); }}>Trocar a captura</button>
                      </div>
                    )}
                  </Field>
                )}

                {aba === "endereco" && (
                  <>
                    <Field label="Endereço do site de referência" htmlFor="endereco" hint="Cole o endereço completo, começando com https://. A captura é feita sozinha.">
                      <div className="flex gap-2 max-md:flex-col">
                        <input id="endereco" type="url" className="input flex-1 min-w-0" placeholder="https://..." value={endereco} onChange={(e) => { setEndereco(e.target.value); if (captura && !arquivo) setCaptura(null); }} />
                        <button type="button" className="btn-ghost shrink-0 max-w-full whitespace-normal" disabled={buscandoEndereco || criando} onClick={trazerDoEndereco}>
                          {buscandoEndereco ? "Buscando..." : "Ver a captura"}
                        </button>
                      </div>
                    </Field>
                    {captura && (
                      <div className="mb-4 flex items-center gap-3">
                        <AmpliarImagem src={captura} />
                        <span className="text-sm text-ink-2">Captura pronta</span>
                      </div>
                    )}
                    {servicoConectado === false && <p className="text-muted text-[13px] mb-3">Para capturar um site pelo endereço, <Link className="btn-link" href="/setup#captura">conecte o serviço de captura</Link>. Ou envie uma imagem em &ldquo;Clonar uma referência&rdquo;.</p>}
                  </>
                )}

                {aba === "briefing" && (
                  <Field label="O que a empresa faz, para quem e o que o site precisa ter" htmlFor="briefing" hint="Quanto mais concreto, melhor: produtos, diferenciais, público, cidade, chamada principal.">
                    <textarea id="briefing" className="input min-h-28 resize-y" placeholder="Ex.: clínica odontológica em Curitiba, foco em implantes e atendimento no mesmo dia; quero destacar a avaliação gratuita e o WhatsApp." value={form.briefing} onChange={set("briefing")} />
                  </Field>
                )}

                {aviso && (
                  <div className="mb-1">
                    <Aviso tom={aviso.tom} acao={aviso.acao}>{aviso.texto}</Aviso>
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
                <Field label="Nome do site" htmlFor="nomeSite" hint="Como ele aparece em Meus sites e no endereço público.">
                  <input id="nomeSite" className="input" placeholder="Ex.: Landing de lançamento" value={form.nomeSite} onChange={set("nomeSite")} />
                </Field>
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

              <button type="submit" className="btn-primary" disabled={ocupado || !podeCriar}>{criando ? "Criando o site" : "Criar o site"}</button>
              <button type="button" className="btn-secundario mt-2" disabled={ocupado} onClick={usarExemplo}>Preencher com um exemplo</button>
            </fieldset>
            <p role="status" className="text-muted text-[13px] mt-2">{statusTexto}</p>
          </form>

          <div className="card p-5 mt-4">
            <Privacidade detalhe="A captura fica guardada só até o site ficar pronto e é apagada em seguida. Se falhar, ela permanece para você tentar de novo, até apagar o site. Logo, imagens e o código ficam neste app até você apagar." />
          </div>
        </div>

        <Stage>
          <MeusSites
            sites={sites}
            aoMudar={setSites}
            aoPreencherExemplo={usarExemplo}
            rodape={temSites ? (
              <div className="flex items-center gap-4 pt-1">
                <Link href="/historico" className="btn-link text-[13px]">Ver o histórico</Link>
                <button
                  type="button"
                  className="btn-link !text-muted text-[13px]"
                  onClick={() => {
                    if (!window.confirm("Apagar todos os sites e páginas salvos? Essa ação não pode ser desfeita.")) return;
                    fetch("/api/pagina", { method: "DELETE" }).then(() => buscarSites()).then(setSites).catch(() => {});
                  }}
                >
                  Apagar tudo
                </button>
              </div>
            ) : undefined}
          />
        </Stage>
      </main>
    </>
  );
}

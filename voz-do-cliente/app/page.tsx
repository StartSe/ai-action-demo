"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarraSentimento } from "@/components/BarraSentimento";
import { CampoArquivo } from "@/components/CampoArquivo";
import { MatrizPrioridade } from "@/components/MatrizPrioridade";
import {
  Aviso,
  Chip,
  CopyButton,
  DataTable,
  Destaque,
  Entregar,
  ErrorBox,
  Field,
  Hero,
  Loading,
  MaisDetalhes,
  Origem,
  Passos,
  Privacidade,
  ResultHead,
  Section,
  SeloIA,
  Stage,
  Topbar,
  data,
  lerErro,
  numero,
  useConfirmacao,
  useScrollToResult,
  useStatus,
  type Coluna,
  type ErroLido,
  type PassoIndicador,
} from "@/components/ui";
import {
  adivinharColunaNota,
  adivinharColunaTexto,
  comentariosDoArquivo,
  comentariosDoTexto,
  lerArquivo,
  type ArquivoDados,
} from "@/lib/parse";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import { COMENTARIOS_EXEMPLO } from "@/lib/demo";
import type { Analise, Comentario, SaidaAnalise, Tema } from "@/lib/types";

const LIMITE_COMENTARIOS = 500;
const CONTEXTO_EXEMPLO = "app do banco";

const ETAPAS_CARREGANDO = ["Lendo os comentários...", "Agrupando por tema...", "Medindo o sentimento e priorizando ações..."];

// Textos do hero (economia de texto: título ≤ 8 palavras, apoio ≤ 20, itens ≤ 5 de até 6 palavras cada — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Experiência do Cliente",
  titulo: "Centenas de comentários lidos em minutos",
  apoio: "Cole comentários, envie um arquivo ou colete pela pesquisa por link: a IA agrupa por tema e prioriza.",
  itens: [
    "Resumo executivo em três frases",
    "Sentimento e NPS calculados",
    "Temas mais citados com citações",
    "O que elogiam e reclamam",
    "Matriz de prioridade para agir",
  ],
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Comentários", apoio: "Cole, envie ou colete" },
  { titulo: "Contexto", apoio: "Sobre o que são" },
  { titulo: "Análise", apoio: "Temas, NPS e prioridades" },
];

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };
type PesquisaAtiva = { codigo: string; titulo: string; total: number; criadoEm: string };

function IconeComentarios() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4h-0A2.5 2.5 0 0 1 4 13.5v-7Z" />
      <path d="M8 9h8M8 12.5h5" />
    </svg>
  );
}

function IconeContexto() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
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

/** Prévia de "o que você vai receber", exibida no lugar do resultado antes da primeira análise. */
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
      <button type="button" className="btn-secundario !w-auto self-start" onClick={onExemplo} disabled={carregando}>Usar comentários de exemplo</button>
    </div>
  );
}

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string }; repetir?: () => void }
  | { fase: "pronto"; contexto: string; saida: SaidaAnalise; meta: Meta; id?: string };

type RespostaAnalise = { analise: Analise; total_enviado: number; total_analisado: number; truncado: boolean; meta: Meta; id?: string; contexto?: string; colunaNota?: string | null };

/** Uma fonte secundária de comentários (pesquisa, tickets, planilha): 400 "vazio" vira aviso inline e mantém o resultado atual. */
type Fonte = { pedido: () => Promise<Response>; contexto: string; repetir: () => void; aoVazio?: (mensagem: string) => void };

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const { confirmar, Dialogo } = useConfirmacao();
  const [contexto, setContexto] = useState("");
  const [textoComentarios, setTextoComentarios] = useState("");
  const [arquivoBruto, setArquivoBruto] = useState<File | null>(null);
  const [arquivoDados, setArquivoDados] = useState<ArquivoDados | null>(null);
  const [usarArquivo, setUsarArquivo] = useState(false);
  const [idxTexto, setIdxTexto] = useState(0);
  const [idxNota, setIdxNota] = useState(-1);
  const [comentariosExemplo, setComentariosExemplo] = useState<Comentario[] | null>(null);
  const [notasDescartadas, setNotasDescartadas] = useState(false);
  const [semComentarios, setSemComentarios] = useState(false);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [tituloPesquisa, setTituloPesquisa] = useState("");
  const [criandoPesquisa, setCriandoPesquisa] = useState(false);
  const [avisoPesquisa, setAvisoPesquisa] = useState<{ tom: "ok" | "warn" | "danger"; texto: string } | null>(null);
  const [pesquisas, setPesquisas] = useState<PesquisaAtiva[] | null>(null);
  const [periodoPesquisa, setPeriodoPesquisa] = useState("30");
  const [avisoRespostas, setAvisoRespostas] = useState("");
  const [ocupadoRespostas, setOcupadoRespostas] = useState(false);
  const [periodoTickets, setPeriodoTickets] = useState("30");
  const [avisoTickets, setAvisoTickets] = useState("");
  const [ocupadoTickets, setOcupadoTickets] = useState(false);
  const [avisoPlanilha, setAvisoPlanilha] = useState("");
  const [ocupadoPlanilha, setOcupadoPlanilha] = useState(false);
  const [enderecoLocal, setEnderecoLocal] = useState(false);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  function carregarHistorico() {
    fetch("/api/analisar").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }

  function carregarPesquisas() {
    fetch("/api/pesquisas").then((r) => r.json()).then((r) => setPesquisas(r.itens)).catch(() => setPesquisas([]));
  }

  useEffect(() => {
    carregarHistorico();
    carregarPesquisas();
    // O link da pesquisa usa o endereço desta página: no seu computador ele não chega a nenhum cliente. Definido só no
    // cliente, depois da hidratação (o servidor não sabe o endereço), por isso dentro de um setTimeout.
    const t = setTimeout(() => setEnderecoLocal(/^(localhost|127\.0\.0\.1)$/.test(location.hostname)), 0);
    return () => clearTimeout(t);
  }, []);

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/analisar", { method: "DELETE" }).then(carregarHistorico);
  }

  /** Sessão expirada: leva para "Entrar" e volta para cá depois. Devolve true quando redirecionou. */
  function tratarSemSessao(r: Response, codigo?: string): boolean {
    if (r.status === 401 && codigo === "sem_sessao") {
      router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
      return true;
    }
    return false;
  }

  /** Roda uma análise a partir de qualquer fonte. `lerErro` lê { error, codigo, acao } da rota (respostaErro) e nunca deixa status HTTP cru chegar à tela. */
  async function rodar({ pedido, contexto: ctx, repetir, aoVazio }: Fonte) {
    const anterior = estado;
    // Fonte secundária: o 400 "vazio" volta rápido (antes da IA); só troca o palco por "carregando" se a rota demorar.
    const timer = aoVazio ? setTimeout(() => setEstado({ fase: "carregando" }), 600) : null;
    if (!aoVazio) setEstado({ fase: "carregando" });
    try {
      let r: Response;
      try {
        r = await pedido();
      } catch (e) {
        throw await lerErro(e);
      }
      if (!r.ok) {
        const lido = await lerErro(r);
        if (tratarSemSessao(r, lido.codigo)) return;
        if (aoVazio && r.status === 400 && lido.codigo === "vazio") {
          if (timer) clearTimeout(timer);
          setEstado(anterior);
          aoVazio(lido.mensagem);
          return;
        }
        throw lido;
      }
      const resposta: RespostaAnalise = await r.json();
      setEstado({
        fase: "pronto",
        contexto: resposta.contexto ?? ctx,
        saida: { analise: resposta.analise, totalEnviado: resposta.total_enviado, totalAnalisado: resposta.total_analisado, truncado: resposta.truncado },
        meta: resposta.meta,
        id: resposta.id,
      });
      carregarHistorico();
    } catch (e) {
      const info = e as Partial<ErroLido>;
      setEstado({
        fase: "erro",
        mensagem: info.mensagem || "Não foi possível analisar agora. Tente de novo.",
        codigo: info.codigo as CodigoErroIA | undefined,
        acao: info.acao,
        repetir,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function analisar(lista: Comentario[], ctx: string) {
    const pedido = () => fetch("/api/analisar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comentarios: lista, contexto: ctx }) });
    return rodar({ pedido, contexto: ctx, repetir: () => analisar(lista, ctx) });
  }

  async function analisarRespostasPesquisa() {
    setAvisoRespostas("");
    setOcupadoRespostas(true);
    const dias = periodoPesquisa ? Number(periodoPesquisa) : null;
    const pedido = () => fetch("/api/pesquisas/analisar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ diasAtras: dias }) });
    try {
      await rodar({ pedido, contexto: "respostas da pesquisa pública", repetir: analisarRespostasPesquisa, aoVazio: setAvisoRespostas });
    } finally {
      setOcupadoRespostas(false);
    }
  }

  async function importarTicketsClick() {
    setAvisoTickets("");
    setOcupadoTickets(true);
    const pedido = () => fetch("/api/tickets/importar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ diasAtras: Number(periodoTickets) }) });
    try {
      await rodar({ pedido, contexto: "tickets de atendimento importados", repetir: importarTicketsClick, aoVazio: setAvisoTickets });
    } finally {
      setOcupadoTickets(false);
    }
  }

  async function lerPlanilhaClick() {
    setAvisoPlanilha("");
    setOcupadoPlanilha(true);
    const pedido = () => fetch("/api/planilha/importar", { method: "POST" });
    try {
      await rodar({ pedido, contexto: "respostas lidas da planilha conectada", repetir: lerPlanilhaClick, aoVazio: setAvisoPlanilha });
    } finally {
      setOcupadoPlanilha(false);
    }
  }

  async function criarPesquisa() {
    const titulo = tituloPesquisa.trim();
    if (!titulo) {
      setAvisoPesquisa({ tom: "warn", texto: "Dê um título à pesquisa: é a pergunta que o cliente vai ler." });
      return;
    }
    setCriandoPesquisa(true);
    setAvisoPesquisa(null);
    try {
      let r: Response;
      try {
        r = await fetch("/api/pesquisas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo }) });
      } catch (e) {
        throw await lerErro(e);
      }
      if (!r.ok) {
        const lido = await lerErro(r);
        if (tratarSemSessao(r, lido.codigo)) return;
        throw lido;
      }
      setTituloPesquisa("");
      setAvisoPesquisa({ tom: "ok", texto: "Pesquisa criada. Copie o link abaixo e envie aos clientes." });
      carregarPesquisas();
    } catch (e) {
      const info = e as Partial<ErroLido>;
      setAvisoPesquisa({ tom: "danger", texto: info.mensagem || "Não foi possível criar a pesquisa. Tente de novo." });
    } finally {
      setCriandoPesquisa(false);
    }
  }

  async function encerrarPesquisaClick(codigo: string) {
    if (!(await confirmar("Encerrar esta pesquisa? O link deixa de aceitar novas respostas.", { confirmarRotulo: "Encerrar" }))) return;
    await fetch(`/api/pesquisas/${codigo}/encerrar`, { method: "POST" }).catch(() => null);
    carregarPesquisas();
  }

  const comentarios: Comentario[] = useMemo(() => {
    if (usarArquivo && arquivoDados) return comentariosDoArquivo(arquivoDados, idxTexto, idxNota);
    if (comentariosExemplo) return comentariosExemplo;
    return comentariosDoTexto(textoComentarios);
  }, [usarArquivo, arquivoDados, idxTexto, idxNota, comentariosExemplo, textoComentarios]);

  const headersCSV = usarArquivo && arquivoDados && arquivoDados.tipo === "csv" ? arquivoDados.headers : null;

  const textoContagem = comentarios.length === 0 ? "Nenhum comentário detectado ainda." : `${comentarios.length} comentário${comentarios.length === 1 ? "" : "s"} detectado${comentarios.length === 1 ? "" : "s"}.`;

  // Linha sob a entrada: a pessoa sabe antes de analisar se o NPS vai ou não aparecer no resultado.
  const infoNps: string | null = (() => {
    if (!comentarios.length) return null;
    if (headersCSV) {
      return idxNota >= 0
        ? `Nota NPS detectada na coluna “${headersCSV[idxNota] || `Coluna ${idxNota + 1}`}”: o NPS será calculado.`
        : "Sem coluna de nota: o NPS não será calculado. Escolha a coluna com a nota de 0 a 10 abaixo ou use a Pesquisa NPS por link.";
    }
    if (comentariosExemplo) return "Notas NPS incluídas no exemplo: o NPS será calculado.";
    return "Sem coluna de nota: o NPS não será calculado. Envie um CSV com uma coluna 0 a 10 ou use a Pesquisa NPS por link.";
  })();

  const avisoLimite = comentarios.length > LIMITE_COMENTARIOS ? `Detectamos ${comentarios.length} comentários. O limite é ${LIMITE_COMENTARIOS} por análise: vamos analisar os ${LIMITE_COMENTARIOS} primeiros.` : "";

  function onTextoChange(v: string) {
    setTextoComentarios(v);
    // Editar o texto do exemplo descarta as notas (o texto colado não tem nota): avisa em vez de calar.
    if (comentariosExemplo) setNotasDescartadas(true);
    setComentariosExemplo(null);
    setSemComentarios(false);
    if (v.trim()) {
      setUsarArquivo(false);
      setArquivoDados(null);
      setArquivoBruto(null);
    }
  }

  async function onArquivo(file: File | null) {
    setArquivoBruto(file);
    setNotasDescartadas(false);
    setSemComentarios(false);
    if (!file) {
      setUsarArquivo(false);
      setArquivoDados(null);
      return;
    }
    const dados = await lerArquivo(file);
    setArquivoDados(dados);
    setUsarArquivo(true);
    setTextoComentarios("");
    setComentariosExemplo(null);
    if (dados.tipo === "csv") {
      setIdxTexto(Math.max(0, adivinharColunaTexto(dados.headers)));
      setIdxNota(adivinharColunaNota(dados.headers));
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const lista = comentarios.slice(0, LIMITE_COMENTARIOS);
    if (!lista.length) {
      setSemComentarios(true);
      return;
    }
    setSemComentarios(false);
    analisar(lista, contexto);
  }

  /** "Usar comentários de exemplo" preenche E analisa: quem quer ver o resultado não precisa rolar até o botão. */
  function usarExemplo() {
    setContexto(CONTEXTO_EXEMPLO);
    setUsarArquivo(false);
    setArquivoDados(null);
    setArquivoBruto(null);
    setNotasDescartadas(false);
    setSemComentarios(false);
    setTextoComentarios(COMENTARIOS_EXEMPLO.map((c) => c.texto).join("\n"));
    setComentariosExemplo(COMENTARIOS_EXEMPLO);
    analisar(COMENTARIOS_EXEMPLO.slice(0, LIMITE_COMENTARIOS), CONTEXTO_EXEMPLO);
  }

  // Atalho para demonstrações: /?exemplo=1 preenche e envia o formulário.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(usarExemplo, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const carregando = estado.fase === "carregando";
  const passoAtual = estado.fase === "pronto" ? 3 : comentarios.length ? 2 : 1;
  const crmConectado = status ? Boolean(status.integrations?.mcpCrm) : undefined;
  const planilhaConectada = status ? Boolean(status.integrations?.mcpDados) : undefined;

  return (
    <>
      <Topbar marca="V" nome="Voz do Cliente" area="Experiência do Cliente e Marketing" status={status} erro={erro} resumo="Modo demonstração: a análise exibida é um exemplo." usuario={status?.usuario} />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Marketing">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          <form onSubmit={onSubmit}>
            <CartaoEntrada icone={<IconeComentarios />} titulo="Os comentários">
              <Field label="Cole os comentários, um por linha" htmlFor="comentarios">
                <textarea
                  id="comentarios"
                  className="input min-h-24 resize-y"
                  placeholder="Ex.: O app trava toda vez que tento fazer um Pix..."
                  value={textoComentarios}
                  onChange={(e) => onTextoChange(e.target.value)}
                />
                <span className="text-[12.5px] text-muted">{textoContagem}{infoNps ? ` ${infoNps}` : ""}</span>
              </Field>
              {notasDescartadas && (
                <div className="mb-3">
                  <Aviso tom="warn">Você editou o texto do exemplo: as notas NPS dele foram descartadas e o NPS não será calculado. Para voltar, clique em “Usar comentários de exemplo”.</Aviso>
                </div>
              )}
              {avisoLimite && (
                <div className="mb-3">
                  <Aviso tom="warn">{avisoLimite}</Aviso>
                </div>
              )}
              {semComentarios && (
                <div className="mb-3">
                  <Aviso tom="danger">Cole ao menos um comentário ou envie um arquivo antes de analisar.</Aviso>
                </div>
              )}
              <CampoArquivo arquivo={arquivoBruto} headers={headersCSV} idxTexto={idxTexto} idxNota={idxNota} onArquivo={onArquivo} onColTexto={setIdxTexto} onColNota={setIdxNota} />
            </CartaoEntrada>

            <CartaoEntrada icone={<IconeContexto />} titulo="Contexto">
              <Field label="Sobre o que são os comentários? (opcional)" htmlFor="contexto">
                <input id="contexto" className="input" placeholder="Ex.: app do banco" value={contexto} onChange={(e) => setContexto(e.target.value)} />
              </Field>
            </CartaoEntrada>

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Analisando" : "Analisar comentários"}</button>
            <button type="button" className="btn-secundario mt-2" disabled={carregando} onClick={usarExemplo}>Usar comentários de exemplo</button>
          </form>

          <div className="card p-5 mt-4">
            <Privacidade detalhe="A análise fica salva neste app até você apagar em 'Últimos resultados'. Os comentários brutos não ficam salvos." />

            <MaisDetalhes titulo="Pesquisa NPS por link">
              <Field label="Título da pesquisa" htmlFor="tituloPesquisa">
                <input id="tituloPesquisa" className="input" placeholder="Ex.: O quanto você nos recomendaria?" value={tituloPesquisa} onChange={(e) => setTituloPesquisa(e.target.value)} />
              </Field>
              <button type="button" className="btn-ghost !w-auto mb-4" disabled={criandoPesquisa} onClick={criarPesquisa}>
                {criandoPesquisa ? "Criando..." : "Criar pesquisa"}
              </button>
              {avisoPesquisa && (
                <div className="mb-4">
                  <Aviso tom={avisoPesquisa.tom}>{avisoPesquisa.texto}</Aviso>
                </div>
              )}
              {enderecoLocal && pesquisas && pesquisas.length > 0 && (
                <div className="mb-4">
                  <Aviso tom="warn">O link aponta para o seu computador: publique o app num endereço público antes de enviá-lo aos clientes.</Aviso>
                </div>
              )}

              {pesquisas === null ? (
                <p className="text-muted text-sm mb-4">Carregando...</p>
              ) : pesquisas.length === 0 ? (
                <p className="text-muted text-sm mb-4">Nenhuma pesquisa ativa ainda.</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-2.5 text-sm mb-4">
                    {pesquisas.map((p) => (
                      <li key={p.codigo} className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <Link href={`/f/${p.codigo}`} target="_blank" className="text-accent-ink font-semibold hover:underline truncate">{p.titulo}</Link>
                          <div className="text-muted text-[12.5px]">{p.total} resposta{p.total === 1 ? "" : "s"} recebida{p.total === 1 ? "" : "s"}</div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <CopyButton texto={() => `${location.origin}/f/${p.codigo}`} rotulo="Copiar link" />
                          <button type="button" className="btn-ghost !w-auto" onClick={() => encerrarPesquisaClick(p.codigo)}>Encerrar</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <ReceberAnaliseSemanal />
                </>
              )}

              <Field label="Analisar respostas recebidas de" htmlFor="periodoPesquisa">
                <select id="periodoPesquisa" className="input" value={periodoPesquisa} onChange={(e) => setPeriodoPesquisa(e.target.value)}>
                  <option value="7">Últimos 7 dias</option>
                  <option value="30">Últimos 30 dias</option>
                  <option value="90">Últimos 90 dias</option>
                  <option value="">Todo o período</option>
                </select>
              </Field>
              <button type="button" className="btn-ghost !w-auto" disabled={carregando || ocupadoRespostas} onClick={analisarRespostasPesquisa}>
                {ocupadoRespostas ? "Analisando..." : "Analisar respostas recebidas"}
              </button>
              {avisoRespostas && (
                <div className="mt-3">
                  <Aviso tom="warn">{avisoRespostas}</Aviso>
                </div>
              )}
            </MaisDetalhes>

            <MaisDetalhes titulo="Tickets de atendimento (CRM)">
              <p className="text-muted text-[13px] mb-3">Importe os tickets do seu CRM ou sistema de suporte (HubSpot, Zendesk, Intercom) para incluir quem reclamou na análise.</p>
              {crmConectado === undefined ? null : crmConectado ? (
                <>
                  <Field label="Importar tickets de" htmlFor="periodoTickets">
                    <select id="periodoTickets" className="input" value={periodoTickets} onChange={(e) => setPeriodoTickets(e.target.value)}>
                      <option value="7">Últimos 7 dias</option>
                      <option value="30">Últimos 30 dias</option>
                      <option value="90">Últimos 90 dias</option>
                    </select>
                  </Field>
                  <button type="button" className="btn-ghost !w-auto" disabled={carregando || ocupadoTickets} onClick={importarTicketsClick}>
                    {ocupadoTickets ? "Importando..." : "Importar tickets do período"}
                  </button>
                </>
              ) : (
                <a href="/setup#mcp-crm" className="btn-ghost !w-auto">Conectar um CRM em 1 minuto</a>
              )}
              {avisoTickets && (
                <div className="mt-3">
                  <Aviso tom="warn">{avisoTickets}</Aviso>
                </div>
              )}
            </MaisDetalhes>

            <MaisDetalhes titulo="Planilha de NPS (fonte de dados)">
              <p className="text-muted text-[13px] mb-3">Se as respostas de NPS já caem numa planilha viva, leia as notas e os comentários direto de lá, sem exportar CSV.</p>
              {planilhaConectada === undefined ? null : planilhaConectada ? (
                <button type="button" className="btn-ghost !w-auto" disabled={carregando || ocupadoPlanilha} onClick={lerPlanilhaClick}>
                  {ocupadoPlanilha ? "Lendo..." : "Ler a planilha agora"}
                </button>
              ) : (
                <a href="/setup#mcp-dados" className="btn-ghost !w-auto">Conectar a planilha</a>
              )}
              {avisoPlanilha && (
                <div className="mt-3">
                  <Aviso tom="warn">{avisoPlanilha}</Aviso>
                </div>
              )}
            </MaisDetalhes>

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
          {estado.fase === "vazio" && <Previa itens={PROMESSA.itens} onExemplo={usarExemplo} carregando={carregando} />}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} codigo={estado.codigo} acao={estado.acao} onTentarNovamente={estado.repetir} />}
          {estado.fase === "pronto" && <Resultado saida={estado.saida} contexto={estado.contexto} meta={estado.meta} id={estado.id} />}
        </Stage>
      </main>
      {Dialogo}
    </>
  );
}

type EstadoNotificacoes = { configurada: boolean; canal: "email" | "slack"; destino: string };
type RotinaExistente = { id: string; tipo: string };

/** Depois de haver ao menos uma pesquisa ativa, oferece automatizar o acompanhamento: uma análise semanal
 * (compara sentimento e NPS com a semana anterior) e um alerta diário quando o percentual de detratores subir. */
function ReceberAnaliseSemanal() {
  const [notificacoes, setNotificacoes] = useState<EstadoNotificacoes | null>(null);
  const [rotinaId, setRotinaId] = useState<string | null | undefined>(undefined);
  const [limite, setLimite] = useState("10");
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<{ mensagem: string; motivo?: string } | null>(null);

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
        const existente = (d.itens || []).find((i: RotinaExistente) => i.tipo === "analise-semanal");
        setRotinaId(existente?.id ?? null);
      })
      .catch(() => setRotinaId(null));
  }, []);

  /** Cria uma rotina; a rota responde { error, motivo } (motivo "notificacoes" = falta canal/destino) e a mensagem já vem pronta. */
  async function criarRotina(corpo: Record<string, unknown>, fallback: string): Promise<{ id: string }> {
    const r = await fetch("/api/rotinas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw { mensagem: d.error || fallback, motivo: d.motivo };
    return d;
  }

  async function criar() {
    if (!notificacoes?.configurada) return;
    setCriando(true);
    setErro(null);
    try {
      const canal = notificacoes.canal;
      const destino = canal === "email" ? notificacoes.destino || undefined : undefined;
      const semanal = await criarRotina({ tipo: "analise-semanal", frequencia: "semanal", diaSemana: 1, hora: "08:00", canal, destino }, "Não foi possível criar a análise semanal.");
      await criarRotina(
        { tipo: "alerta-sentimento", frequencia: "diaria", hora: "08:00", canal, destino, parametros: { limite: Number(limite) || 10 } },
        "Análise semanal criada, mas não foi possível criar o alerta de sentimento."
      );
      setRotinaId(semanal.id);
    } catch (e) {
      const info = e as { mensagem?: string; motivo?: string };
      setErro({ mensagem: info.mensagem || "Não foi possível criar a análise semanal.", motivo: info.motivo });
    } finally {
      setCriando(false);
    }
  }

  if (rotinaId === undefined || notificacoes === null) return null;

  return (
    <div className="mb-4">
      {rotinaId ? (
        <p className="text-muted text-sm">Você já recebe a análise toda semana e um alerta quando o percentual de detratores subir.</p>
      ) : (
        <div className="flex items-center gap-2.5 flex-wrap">
          <label className="flex items-center gap-1.5 text-[13px] font-semibold">
            Avisar quando o negativo subir mais de
            <input type="number" min={1} max={100} className="input !w-20" value={limite} onChange={(e) => setLimite(e.target.value)} />
            pontos em 7 dias
          </label>
          {notificacoes.configurada ? (
            <button type="button" className="btn-ghost !w-auto" onClick={criar} disabled={criando}>
              {criando ? "Criando..." : "Receber a análise toda semana"}
            </button>
          ) : (
            <a href="/setup#notificacoes" className="btn-ghost !w-auto">Receber a análise toda semana</a>
          )}
        </div>
      )}
      {erro && (
        <div className="mt-3">
          <Aviso tom="danger">
            {erro.mensagem}
            {erro.motivo === "notificacoes" && (
              <>
                {" "}
                <a className="btn-link text-[13px]" href="/setup#notificacoes">Configurar notificações</a>
              </>
            )}
          </Aviso>
        </div>
      )}
    </div>
  );
}

export function Resultado({ saida, contexto, meta, id }: { saida: SaidaAnalise; contexto: string; meta: Meta; id?: string }) {
  const { analise, totalAnalisado, totalEnviado, truncado } = saida;
  const titulo = `Análise de ${totalAnalisado} comentário${totalAnalisado === 1 ? "" : "s"}`;
  const subtitulo = `${sentenceCase(contexto || "sem contexto informado")}${truncado ? ` · analisamos os ${totalAnalisado} primeiros de ${totalEnviado}` : ""}`;

  return (
    <article className="reveal">
      <ResultHead titulo={titulo} subtitulo={subtitulo}>
        <Entregar id={id} titulo={titulo} texto={() => analiseParaTexto(analise, contexto)} extras={[{ rotulo: "Exportar CSV", onClick: () => exportarCSV(analise.temas) }]} />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoAnalise analise={analise} />

      <SeloIA demo={meta.demo} />
    </article>
  );
}

const ROTULO_ORIGEM: Record<string, string> = { pesquisa: "Pesquisa", arquivo: "Arquivo", ticket: "Ticket", planilha: "Planilha" };

/** Nome do tema como gatilho de <details>: clicar revela os comentários reais por trás da contagem. */
function TemaComComentarios({ tema }: { tema: Tema }) {
  return (
    <details>
      <summary className="font-bold cursor-pointer marker:content-none underline decoration-dotted decoration-muted underline-offset-4 hover:text-accent-ink">
        {tema.tema}
      </summary>
      <ul className="mt-1.5 flex flex-col gap-1.5 text-[13px] text-muted font-normal">
        {tema.exemplos.map((e, i) => (
          <li key={i} className="flex items-start gap-1.5 flex-wrap">
            <span>&ldquo;{e.texto}&rdquo;</span>
            {e.origem && <Chip nivel="cinza">{ROTULO_ORIGEM[e.origem]}</Chip>}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Barra horizontal proporcional ao maior número de menções entre os temas, com o valor ao lado. */
function BarraMencoes({ valor, maximo }: { valor: number; maximo: number }) {
  const pct = Math.max(6, Math.round((valor / maximo) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="h-[7px] w-16 rounded-full bg-[#eef0f2] overflow-hidden shrink-0">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[13px] tabular-nums text-muted">{valor}</span>
    </div>
  );
}

function sentenceCase(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Corpo da análise (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoAnalise({ analise }: { analise: Analise }) {
  const destaque = destaqueDoResultado(analise);
  const maxMencoes = Math.max(1, ...analise.temas.map((t) => t.mencoes));
  const colunasTemas: Coluna<Tema>[] = [
    { chave: "tema", titulo: "Tema", papel: "titulo", largura: "26%", render: (t) => <TemaComComentarios tema={t} /> },
    { chave: "mencoes", titulo: "Menções", largura: "120px", render: (t) => <BarraMencoes valor={t.mencoes} maximo={maxMencoes} /> },
    { chave: "sentimento", titulo: "Sentimento", papel: "chip", largura: "112px", render: (t) => <Chip nivel={t.sentimento_dominante} /> },
    { chave: "acao", titulo: "Ação sugerida", papel: "detalhe", render: (t) => t.acao_sugerida },
  ];

  return (
    <>
      <Destaque valor={destaque.valor} rotulo={destaque.rotulo} interpretacao={destaque.interpretacao} tom={destaque.tom} />

      <p className="summary">{analise.resumo_executivo}</p>

      <Section titulo="Sentimento geral">
        <BarraSentimento sentimento={analise.sentimento} nps={analise.nps} />
      </Section>

      <Section titulo="Temas mais citados">
        <DataTable colunas={colunasTemas} linhas={analise.temas} />
      </Section>

      <Section titulo="O que elogiam e do que reclamam">
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5">
          <div>
            <h3 className="font-bold mb-1.5">O que elogiam</h3>
            <ul className="list-disc pl-5 grid gap-2 text-sm">
              {analise.elogios_frequentes.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
          <div>
            <h3 className="font-bold mb-1.5">Do que reclamam</h3>
            <ul className="list-disc pl-5 grid gap-2 text-sm">
              {analise.reclamacoes_frequentes.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        </div>
      </Section>

      <Section titulo="Matriz de prioridade">
        <MatrizPrioridade acoes={analise.acoes_prioritarias} />
      </Section>

      <Section titulo="Citações marcantes">
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5">
          {analise.citacoes_marcantes.map((c, i) => (
            <div key={i} className="quote-block">
              <Chip nivel={c.sentimento} />
              <p>&ldquo;{c.texto}&rdquo;</p>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

/** NPS quando há notas; senão, o percentual de comentários positivos — o "dado que decide" deste app. */
function destaqueDoResultado(analise: Analise): { valor: string; rotulo: string; interpretacao: string; tom: "ok" | "warn" | "danger" } {
  if (analise.nps) {
    const { score, promotores, neutros, detratores } = analise.nps;
    const tom: "ok" | "warn" | "danger" = score >= 50 ? "ok" : score >= 0 ? "warn" : "danger";
    return {
      valor: numero(score),
      rotulo: "NPS (Net Promoter Score)",
      interpretacao: `${promotores} promotores, ${neutros} neutros, ${detratores} detratores`,
      tom,
    };
  }
  const s = analise.sentimento;
  const total = Math.max(1, s.positivo + s.neutro + s.negativo);
  const pct = Math.round((s.positivo / total) * 100);
  const tom: "ok" | "warn" | "danger" = pct >= 60 ? "ok" : pct >= 40 ? "warn" : "danger";
  return {
    valor: `${pct}%`,
    rotulo: "Comentários positivos",
    interpretacao: `${s.positivo} de ${total} comentários`,
    tom,
  };
}

function exportarCSV(temas: Tema[]) {
  const cabecalho = ["Tema", "Menções", "Sentimento", "Exemplo", "Ação sugerida"];
  const linhas = [cabecalho.join(";")];
  temas.forEach((t) => {
    const campos = [t.tema, String(t.mencoes), t.sentimento_dominante, t.exemplos.map((e) => e.texto).join(" | "), t.acao_sugerida];
    linhas.push(campos.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"));
  });
  const csv = "﻿" + linhas.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "temas.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function analiseParaTexto(analise: Analise, contexto: string): string {
  const s = analise.sentimento;
  const linhas: string[] = [
    `Voz do Cliente — análise de comentários (${contexto || "sem contexto"})`,
    "",
    analise.resumo_executivo,
    "",
    `Sentimento: ${s.positivo} positivos, ${s.neutro} neutros, ${s.negativo} negativos`,
  ];
  if (analise.nps) linhas.push(`NPS: ${analise.nps.score} (promotores ${analise.nps.promotores}, neutros ${analise.nps.neutros}, detratores ${analise.nps.detratores})`);
  linhas.push("", "Temas mais citados:");
  analise.temas.forEach((t) => linhas.push(`- ${t.tema} (${t.mencoes} menções, ${t.sentimento_dominante}): ${t.acao_sugerida}`));
  linhas.push("", "Elogios frequentes:");
  analise.elogios_frequentes.forEach((e) => linhas.push(`- ${e}`));
  linhas.push("", "Reclamações frequentes:");
  analise.reclamacoes_frequentes.forEach((e) => linhas.push(`- ${e}`));
  linhas.push("", "Ações prioritárias:");
  analise.acoes_prioritarias.forEach((a) => linhas.push(`- ${a.acao} (impacto ${a.impacto}, esforço ${a.esforco}): ${a.justificativa}`));
  return linhas.join("\n");
}

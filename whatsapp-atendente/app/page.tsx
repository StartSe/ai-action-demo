"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Aviso,
  Chip,
  CopyButton,
  DataTable,
  Empty,
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
  Row,
  SeloIA,
  Stage,
  Topbar,
  data,
  lerErro,
  useConfirmacao,
  useScrollToResult,
  useStatus,
  type Coluna,
  type ErroLido,
  type PassoIndicador,
} from "@/components/ui";
import { AcoesResposta, Celular, horaAtual, type AoSalvarBase, type BolhaChat } from "@/components/Celular";
import type { Meta } from "@/lib/ai";
import type { ParBase } from "@/lib/base";
import { ACAO_CONECTAR_NUMERO, AVISO_CONVERSAS_EXEMPLO, soConversasDeExemplo } from "@/lib/demo";
import type { Sugestao } from "@/lib/sugestoes";
import { rotuloContato, rotuloOrigem } from "@/lib/rotulos";
import type { Config, Conversa, ItemRelatorioAtendimento, PerguntaPendente } from "@/lib/types";

const CONFIG_VAZIA: Config = { negocio: "", atendente: "", tom: "cordial", horario: "", baseConhecimento: "", naoSei: "humano" };

const SUGESTOES = ["Quanto custa o clareamento dental?", "Vocês atendem aos sábados?", "Fazem cirurgia cardíaca?"];

const ETAPAS_CARREGANDO = ["Abrindo as conversas...", "Quase pronto..."];

// Textos do hero (economia de texto: título ≤ 8 palavras, apoio ≤ 20 — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Atendimento e Vendas",
  titulo: "Um atendente que já conhece o negócio",
  apoio: "Diga o que ele pode responder, teste no celular ao lado e conecte o número da empresa quando quiser.",
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Ensine", apoio: "O que ele pode responder" },
  { titulo: "Teste", apoio: "Pergunte como um cliente" },
  { titulo: "Conecte", apoio: "O número da empresa" },
];

const ACEITA_ARQUIVO = ".txt,.md,.pdf,text/plain,application/pdf";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

type EstadoNotificacoes = { configurada: boolean; canal: "email" | "slack"; destino: string };

function IconeNegocio() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V10Z" />
      <path d="M4 10 6 4h12l2 6" />
      <path d="M10 21v-6h4v6" />
    </svg>
  );
}

function IconeBase() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  );
}

/** Balão de conversa (estilo WhatsApp) com três pontos de "digitando", no lugar de um glifo genérico no estado vazio. */
function IlustracaoConversa() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="9" width="50" height="34" rx="8" />
      <path d="M20 43l-4 10 12-10" />
      <circle cx="22" cy="26" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="32" cy="26" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="42" cy="26" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Cartão de entrada com ícone circular e título, no lugar da coluna única de campos crus. */
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

type EstadoConversas = { fase: "carregando" } | { fase: "erro"; erro: ErroLido } | { fase: "pronto"; conversas: Conversa[]; meta: Meta; id?: string };

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const { confirmar, Dialogo } = useConfirmacao();
  const [config, setConfig] = useState<Config>(CONFIG_VAZIA);
  const [configSalva, setConfigSalva] = useState<Config>(CONFIG_VAZIA);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erroConfig, setErroConfig] = useState<ErroLido | null>(null);
  const [importando, setImportando] = useState(false);
  const [avisoImportacao, setAvisoImportacao] = useState<{ tom: "ok" | "danger"; texto: string } | null>(null);

  const [mensagens, setMensagens] = useState<BolhaChat[]>([]);
  const [valor, setValor] = useState("");
  const [enviando, setEnviando] = useState(false);

  const [estadoConversas, setEstadoConversas] = useState<EstadoConversas>({ fase: "carregando" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [base, setBase] = useState<ParBase[] | null>(null);
  const [pendentes, setPendentes] = useState<PerguntaPendente[] | null>(null);
  const [sugestoesCodigo, setSugestoesCodigo] = useState<string | null | undefined>(undefined);
  const [sugestoes, setSugestoes] = useState<Sugestao[] | null>(null);
  const [criandoLinkSugestoes, setCriandoLinkSugestoes] = useState(false);
  const [tratandoSugestao, setTratandoSugestao] = useState<string | null>(null);
  const [avisoPainel, setAvisoPainel] = useState<ErroLido | null>(null);
  const [notificacoes, setNotificacoes] = useState<EstadoNotificacoes | null>(null);
  const [relatorioId, setRelatorioId] = useState<string | null | undefined>(undefined);
  const [criandoRelatorio, setCriandoRelatorio] = useState(false);
  const [atenderNumero, setAtenderNumero] = useState<string | null>(null);
  const [corrigirFocada, setCorrigirFocada] = useState(false);
  const autoEnviado = useRef(false);
  const configAlterada = JSON.stringify(config) !== JSON.stringify(configSalva);
  // Espelha o rascunho mais recente para o simulador, sem tornar `enviarSimulada` reativo a `config`
  // (o que forçaria listá-la como dependência do efeito de auto-envio de ?exemplo=1).
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useScrollToResult(mensagens.length > 0);

  function carregarConversas() {
    fetch("/api/conversas")
      .then((r) => r.json())
      .then((r) => setEstadoConversas({ fase: "pronto", conversas: r.itens, meta: r.meta }))
      .catch(async (e) => setEstadoConversas({ fase: "erro", erro: await lerErro(e) }));
  }

  function carregarPendentes() {
    fetch("/api/pendentes").then((r) => r.json()).then((r) => setPendentes(r.itens)).catch(() => setPendentes([]));
  }

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((c) => { setConfig(c); setConfigSalva(c); }).catch(() => {});
    // Com ?exemplo=1, o envio automático abaixo já traz a lista de conversas atualizada;
    // carregar aqui também correria com aquela resposta e poderia sobrescrevê-la.
    if (new URLSearchParams(location.search).get("exemplo") !== "1") carregarConversas();
    fetch("/api/simular").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
    fetch("/api/base").then((r) => r.json()).then((r) => setBase(r.itens)).catch(() => setBase([]));
    fetch("/api/pendentes").then((r) => r.json()).then((r) => setPendentes(r.itens)).catch(() => setPendentes([]));
    fetch("/api/sugestoes")
      .then((r) => r.json())
      .then((d) => {
        setSugestoesCodigo(d.codigo ?? null);
        setSugestoes(d.itens || []);
      })
      .catch(() => {
        setSugestoesCodigo(null);
        setSugestoes([]);
      });

    const numero = new URLSearchParams(location.search).get("atender");
    if (numero) {
      const corrigir = new URLSearchParams(location.search).get("corrigir") === "1";
      setTimeout(() => {
        setAtenderNumero(numero);
        setCorrigirFocada(corrigir);
      }, 0);
    }

    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        const notificacoesIntegracao = (d.integracoes || []).find((i: { id: string }) => i.id === "notificacoes");
        const campos: { chave: string; valorVisivel?: string }[] = notificacoesIntegracao?.campos || [];
        const canal = campos.find((c) => c.chave === "NOTIFICACOES_CANAL")?.valorVisivel === "slack" ? "slack" : "email";
        const destino = campos.find((c) => c.chave === "NOTIFICACOES_DESTINO")?.valorVisivel || "";
        setNotificacoes({ configurada: Boolean(notificacoesIntegracao?.configurada), canal, destino });
      })
      .catch(() => setNotificacoes({ configurada: false, canal: "email", destino: "" }));
    fetch("/api/rotinas")
      .then((r) => r.json())
      .then((d) => setRelatorioId((d.itens || []).find((i: { tipo: string }) => i.tipo === "relatorio-atendimento")?.id ?? null))
      .catch(() => setRelatorioId(null));
  }, []);

  /** 401 com codigo "sem_sessao" significa sessão expirada: a tela de entrar resolve, o ErrorBox não. */
  function sessaoExpirada(r: Response, info: ErroLido) {
    if (r.status !== 401 || info.codigo !== "sem_sessao") return false;
    router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
    return true;
  }

  async function criarRelatorio() {
    if (!notificacoes?.configurada) return;
    setCriandoRelatorio(true);
    setAvisoPainel(null);
    try {
      const r = await fetch("/api/rotinas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "relatorio-atendimento", frequencia: "diaria", hora: "08:00", canal: notificacoes.canal, destino: notificacoes.canal === "email" ? notificacoes.destino || undefined : undefined }),
      });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirada(r, info)) return;
        setAvisoPainel(info);
        return;
      }
      const d = await r.json();
      setRelatorioId(d.id);
    } catch (e) {
      setAvisoPainel(await lerErro(e));
    } finally {
      setCriandoRelatorio(false);
    }
  }

  const salvarBase: AoSalvarBase = (pergunta, resposta) => {
    fetch("/api/base", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pergunta, resposta }) })
      .then((r) => r.json())
      .then((r) => {
        if (r.itens) setBase(r.itens);
        carregarPendentes();
      })
      .catch(() => {});
  };

  /** Lê um manual, tabela de preços ou documento de perguntas frequentes e acrescenta ao campo da base. */
  async function importarArquivo(arquivo: File | null) {
    if (!arquivo) return;
    setImportando(true);
    setAvisoImportacao(null);
    try {
      const corpo = new FormData();
      corpo.append("arquivo", arquivo);
      const r = await fetch("/api/base/arquivo", { method: "POST", body: corpo });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirada(r, info)) return;
        setAvisoImportacao({ tom: "danger", texto: info.mensagem });
        return;
      }
      const d = await r.json();
      setConfig((c) => ({ ...c, baseConhecimento: c.baseConhecimento.trim() ? `${c.baseConhecimento.trim()}\n\n${d.texto}` : d.texto }));
      setAvisoImportacao({
        tom: "ok",
        texto: d.cortado
          ? `Trouxemos os primeiros 20 mil caracteres de ${arquivo.name}, de ${d.caracteres.toLocaleString("pt-BR")}. Confira o texto e salve.`
          : `Conteúdo de ${arquivo.name} acrescentado à base. Confira o texto e salve.`,
      });
    } catch (e) {
      setAvisoImportacao({ tom: "danger", texto: (await lerErro(e)).mensagem });
    } finally {
      setImportando(false);
    }
  }

  async function criarLinkSugestoes() {
    setCriandoLinkSugestoes(true);
    setAvisoPainel(null);
    try {
      const r = await fetch("/api/sugestoes", { method: "POST" });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirada(r, info)) return;
        setAvisoPainel(info);
        return;
      }
      const d = await r.json();
      setSugestoesCodigo(d.codigo);
    } catch (e) {
      setAvisoPainel(await lerErro(e));
    } finally {
      setCriandoLinkSugestoes(false);
    }
  }

  async function tratarSugestao(id: string, acao: "aprovar" | "descartar") {
    setTratandoSugestao(id);
    setAvisoPainel(null);
    try {
      const r = await fetch("/api/sugestoes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, acao }) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirada(r, info)) return;
        setAvisoPainel(info);
        return;
      }
      const d = await r.json();
      setSugestoes(d.itens);
      if (acao === "aprovar") {
        fetch("/api/base").then((r2) => r2.json()).then((r2) => setBase(r2.itens)).catch(() => {});
        carregarPendentes();
      }
    } catch (e) {
      setAvisoPainel(await lerErro(e));
    } finally {
      setTratandoSugestao(null);
    }
  }

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/simular", { method: "DELETE" }).then(() =>
      fetch("/api/simular").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]))
    );
  }

  function setCampo<K extends keyof Config>(campo: K, valor: Config[K]) {
    setConfig((c) => ({ ...c, [campo]: valor }));
  }

  async function salvarConfig(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErroConfig(null);
    try {
      const r = await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirada(r, info)) return;
        setErroConfig(info);
        return;
      }
      const salvoAgora = await r.json();
      setConfig(salvoAgora);
      setConfigSalva(salvoAgora);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 1500);
    } catch (err) {
      setErroConfig(await lerErro(err));
    } finally {
      setSalvando(false);
    }
  }

  async function enviarSimulada(textoBruto: string) {
    const texto = textoBruto.trim();
    if (!texto) return;
    setMensagens((m) => [...m, { papel: "cliente", texto, hora: horaAtual() }, { papel: "atendente", texto: "digitando...", pendente: true }]);
    setEnviando(true);
    try {
      const r = await fetch("/api/simular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ de: "simulador", texto, config: configRef.current }) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirada(r, info)) return;
        setMensagens((m) => [...m.filter((x) => !x.pendente), { papel: "atendente", texto: info.mensagem, erro: true, acao: info.acao, hora: horaAtual() }]);
        return;
      }
      const resposta = await r.json();
      setMensagens((m) => {
        const semPendente = m.filter((x) => !x.pendente);
        // Sem resposta: a conversa foi assumida por uma pessoa e a IA não responde por ela.
        if (!resposta.resposta) return semPendente;
        return [...semPendente, { papel: "atendente", texto: resposta.resposta, transferido: resposta.transferir, ferramentaUsada: resposta.ferramentaUsada, hora: horaAtual() }];
      });
      setEstadoConversas({ fase: "pronto", conversas: resposta.conversas, meta: resposta.meta });
      fetch("/api/simular").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
      carregarPendentes();
    } catch (err) {
      const info = await lerErro(err);
      setMensagens((m) => [...m.filter((x) => !x.pendente), { papel: "atendente", texto: info.mensagem, erro: true, acao: info.acao, hora: horaAtual() }]);
    } finally {
      setEnviando(false);
    }
  }

  async function limparConversa(numero: string) {
    const doSimulador = numero === "simulador";
    const ok = await confirmar(
      doSimulador
        ? "Apagar as conversas do simulador? Essa ação não pode ser desfeita."
        : "Apagar esta conversa? Essa ação não pode ser desfeita.",
      { confirmarRotulo: "Apagar" }
    );
    if (!ok) return;
    try {
      await fetch(`/api/conversas/${encodeURIComponent(numero)}`, { method: "DELETE" });
      carregarConversas();
      carregarPendentes();
    } catch {
      // A lista continua na tela como está; o próximo carregamento corrige.
    }
  }

  // Atalho para demonstrações: /?exemplo=1 envia duas perguntas no simulador (uma que casa com a base, outra que não).
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(async () => {
        await enviarSimulada("Quanto custa o clareamento dental?");
        await enviarSimulada("Fazem cirurgia cardíaca?");
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const conectado = Boolean(status?.integrations?.whatsapp);
  const carregando = estadoConversas.fase === "carregando";
  const passoAtual = mensagens.length > 0 ? 3 : config.baseConhecimento.trim() ? 2 : 1;
  // Link "Aprovar"/"Corrigir" do relatório diário chega com ?atender=<numero>: posiciona a tela nessa conversa.
  const conversaSelecionada = atenderNumero && estadoConversas.fase === "pronto" ? estadoConversas.conversas.find((c) => c.numero === atenderNumero) : undefined;
  // Respostas já dadas que ninguém conferiu ainda: a base aprovada é a fila de "conferido". As
  // conversas de exemplo ficam de fora — nada do que a demonstração respondeu precisa de conferência.
  const aprovadas = new Set((base ?? []).map((p) => p.pergunta.trim().toLowerCase()));
  const aguardandoAprovacao =
    base === null || estadoConversas.fase !== "pronto"
      ? 0
      : estadoConversas.conversas.filter((c) => !c.exemplo && c.ultima_resposta && !aprovadas.has(c.ultima_mensagem.trim().toLowerCase())).length;

  return (
    <>
      <Topbar
        marca="W"
        nome="Atendente no WhatsApp"
        area="Atendimento e Vendas"
        status={status}
        erro={erro}
        resumo="Modo demonstração: as respostas vêm de uma busca simples na base de conhecimento, não da IA."
        usuario={status?.usuario}
      />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Atendimento">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          <form id="form-config" onSubmit={salvarConfig}>
            <CartaoEntrada icone={<IconeNegocio />} titulo="Seu negócio">
              <Row>
                <Field label="Nome do negócio" htmlFor="negocio">
                  <input id="negocio" className="input" required placeholder="Sorriso Pleno Odontologia" value={config.negocio} onChange={(e) => setCampo("negocio", e.target.value)} />
                </Field>
                <Field label="Nome do atendente" htmlFor="atendenteNome">
                  <input id="atendenteNome" className="input" required placeholder="Bia" value={config.atendente} onChange={(e) => setCampo("atendente", e.target.value)} />
                </Field>
              </Row>
            </CartaoEntrada>

            <CartaoEntrada icone={<IconeBase />} titulo="O que ele pode responder">
              <Field label="Base de conhecimento" htmlFor="baseConhecimento" hint="O atendente não inventa nada fora daqui.">
                <textarea
                  id="baseConhecimento"
                  className="input min-h-[150px] resize-y"
                  required
                  placeholder="Produtos, preços, prazos, políticas e perguntas frequentes do seu negócio..."
                  value={config.baseConhecimento}
                  onChange={(e) => setCampo("baseConhecimento", e.target.value)}
                />
              </Field>
              <div className="flex items-center gap-3 flex-wrap -mt-1 mb-4">
                <label htmlFor="arquivo-base" className="btn-ghost !w-auto text-[13px] px-3 py-2 cursor-pointer">
                  {importando ? "Lendo o arquivo" : "Trazer de um arquivo"}
                </label>
                <input
                  id="arquivo-base"
                  type="file"
                  accept={ACEITA_ARQUIVO}
                  hidden
                  disabled={importando}
                  onChange={(e) => { importarArquivo(e.target.files?.[0] ?? null); e.target.value = ""; }}
                />
                <span className="text-muted text-[12.5px]">Texto ou PDF, até 10 MB</span>
              </div>
              {avisoImportacao && <div className="mb-4"><Aviso tom={avisoImportacao.tom}>{avisoImportacao.texto}</Aviso></div>}

              <MaisDetalhes>
                <Row>
                  <Field label="Tom de voz" htmlFor="tom">
                    <select id="tom" className="input" value={config.tom} onChange={(e) => setCampo("tom", e.target.value as Config["tom"])}>
                      <option value="cordial">Cordial</option>
                      <option value="direto">Direto</option>
                      <option value="descontraido">Descontraído</option>
                    </select>
                  </Field>
                  <Field label="Horário de atendimento humano" htmlFor="horario">
                    <input id="horario" className="input" placeholder="segunda a sexta, das 8h às 18h" value={config.horario} onChange={(e) => setCampo("horario", e.target.value)} />
                  </Field>
                </Row>
                <Field label="Quando não souber a resposta" htmlFor="naoSei">
                  <select id="naoSei" className="input" value={config.naoSei} onChange={(e) => setCampo("naoSei", e.target.value as Config["naoSei"])}>
                    <option value="humano">Avisar que um humano vai responder</option>
                    <option value="contato">Pedir e-mail e telefone</option>
                    <option value="site">Indicar o site</option>
                  </select>
                </Field>
              </MaisDetalhes>
              {erroConfig && <Aviso tom="danger" acao={erroConfig.acao}>{erroConfig.mensagem}</Aviso>}
            </CartaoEntrada>
          </form>

          <div className="card p-5 mt-4">
            <Privacidade detalhe="As conversas ficam salvas neste app até você apagar em 'Últimos resultados'." />

            <MaisDetalhes titulo={`Perguntas sem resposta da semana${pendentes?.length ? ` (${pendentes.length})` : ""}`}>
              {pendentes === null ? (
                <p className="text-muted text-sm">Carregando...</p>
              ) : pendentes.length === 0 ? (
                <p className="text-muted text-sm">Nenhuma pergunta ficou sem resposta nos últimos 7 dias. O que aparecer aqui vira um item novo da base em dois cliques.</p>
              ) : (
                <ul className="flex flex-col gap-2.5 text-sm">
                  {pendentes.map((p) => (
                    <li key={p.pergunta} className="border-b border-line pb-2.5 last:border-0 last:pb-0">
                      <p className="font-semibold">{p.pergunta}</p>
                      <div className="flex gap-1.5 flex-wrap my-1.5">
                        {p.transferida && <Chip nivel="media">Ficou sem resposta</Chip>}
                        {p.frequencia > 1 && <Chip nivel="neutral">{p.frequencia} clientes perguntaram</Chip>}
                      </div>
                      <AcoesResposta pergunta={p.pergunta} resposta={p.ultimaResposta ?? ""} onCorrigir={salvarBase} rotuloCorrigir="Escrever a resposta certa" />
                    </li>
                  ))}
                </ul>
              )}
            </MaisDetalhes>

            <MaisDetalhes titulo={`Base de respostas aprovadas${base?.length ? ` (${base.length})` : ""}`}>
              {base === null ? (
                <p className="text-muted text-sm">Carregando...</p>
              ) : base.length === 0 ? (
                <p className="text-muted text-sm">
                  Nenhuma resposta aprovada ainda. Use &quot;Aprovar&quot; ou &quot;Corrigir&quot; nas respostas do simulador ou das conversas para alimentar a base.
                </p>
              ) : (
                <ul className="flex flex-col gap-2.5 text-sm">
                  {base.map((p, i) => (
                    <li key={i} className="border-b border-line pb-2.5 last:border-0 last:pb-0">
                      <p className="font-semibold">{p.pergunta}</p>
                      <p className="text-muted">{p.resposta}</p>
                    </li>
                  ))}
                </ul>
              )}
            </MaisDetalhes>

            <MaisDetalhes titulo="Sugestões da equipe">
              {sugestoesCodigo === undefined ? (
                <p className="text-muted text-sm mb-3.5">Carregando...</p>
              ) : sugestoesCodigo ? (
                <div className="card p-3.5 mb-3.5 flex items-center gap-2 flex-wrap">
                  <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[200px]">{`${location.origin}/f/${sugestoesCodigo}`}</code>
                  <CopyButton texto={() => `${location.origin}/f/${sugestoesCodigo}`} rotulo="Copiar link do formulário" />
                </div>
              ) : (
                <button type="button" className="btn-ghost mb-3.5" onClick={criarLinkSugestoes} disabled={criandoLinkSugestoes}>
                  {criandoLinkSugestoes ? "Criando..." : "Alimentar a base por formulário"}
                </button>
              )}

              {sugestoes === null ? (
                <p className="text-muted text-sm">Carregando...</p>
              ) : sugestoes.length === 0 ? (
                <p className="text-muted text-sm">Nenhuma sugestão recebida ainda. Compartilhe o link acima com a equipe para receber perguntas e respostas.</p>
              ) : (
                <ul className="flex flex-col gap-2.5 text-sm">
                  {sugestoes.map((s) => (
                    <li key={s.id} className="border-b border-line pb-2.5 last:border-0 last:pb-0">
                      <p className="font-semibold">{s.pergunta}</p>
                      <p className="text-muted">{s.resposta}</p>
                      {s.categoria && <p className="text-muted text-[12.5px] mt-0.5">Categoria: {s.categoria}</p>}
                      <div className="flex gap-2 mt-2">
                        <button type="button" className="btn-ghost" onClick={() => tratarSugestao(s.id, "aprovar")} disabled={tratandoSugestao === s.id}>Aprovar</button>
                        <button type="button" className="btn-ghost" onClick={() => tratarSugestao(s.id, "descartar")} disabled={tratandoSugestao === s.id}>Descartar</button>
                      </div>
                    </li>
                  ))}
                </ul>
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

            {avisoPainel && <div className="mt-3.5"><Aviso tom="danger" acao={avisoPainel.acao}>{avisoPainel.mensagem}</Aviso></div>}

            {relatorioId === undefined || notificacoes === null ? null : relatorioId ? (
              <p className="text-muted text-sm mt-3.5">Você já recebe o relatório do atendimento todo dia, às 8h.</p>
            ) : notificacoes.configurada ? (
              <button type="button" className="btn-ghost mt-3.5" onClick={criarRelatorio} disabled={criandoRelatorio}>
                {criandoRelatorio ? "Criando..." : "Receber o relatório diário"}
              </button>
            ) : (
              <div className="mt-3.5">
                <Aviso>
                  Para receber o relatório diário do atendimento, escolha antes para onde o aviso vai (e-mail ou Slack) no cartão Notificações.{" "}
                  <a className="btn-link text-[13px]" href="/setup#notificacoes">Escolher agora</a>
                </Aviso>
              </div>
            )}
          </div>

          {(configAlterada || salvo) && (
            <div className="sticky bottom-0 mt-4 px-5 py-4 bg-surface border border-line rounded-card shadow-card flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-accent-ink">{configAlterada ? "Alterações não salvas" : "Configuração salva"}</span>
              <button type="submit" form="form-config" className="btn-primary !w-auto" disabled={salvando}>
                {salvando ? "Salvando" : "Salvar"}
              </button>
            </div>
          )}
        </div>

        <Stage>
          {conversaSelecionada && (
            <ConversaSelecionada conversa={conversaSelecionada} corrigirFocada={corrigirFocada} onAprovar={salvarBase} onCorrigir={salvarBase} />
          )}

          <Celular
            nome={config.atendente}
            negocio={config.negocio}
            mensagens={mensagens}
            valor={valor}
            onValorChange={setValor}
            onEnviar={enviarSimulada}
            enviando={enviando}
            onAprovar={salvarBase}
            onCorrigir={salvarBase}
          />

          <div className="flex flex-wrap gap-2 justify-center mb-8">
            {SUGESTOES.map((s) => (
              <button
                key={s}
                type="button"
                className="bg-accent-soft text-accent-ink rounded-full px-3.5 py-1.5 text-[13px] font-semibold cursor-pointer border-0 hover:bg-accent-soft/70 transition-colors"
                onClick={() => enviarSimulada(s)}
              >
                {s}
              </button>
            ))}
          </div>

          {carregando && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estadoConversas.fase === "erro" && (
            <ErrorBox mensagem={estadoConversas.erro.mensagem} acao={estadoConversas.erro.acao} onTentarNovamente={carregarConversas} />
          )}
          {estadoConversas.fase === "pronto" && estadoConversas.conversas.length === 0 && (
            <Empty
              ilustracao={<IlustracaoConversa />}
              titulo="Nenhuma conversa ainda"
              descricao="Teste uma pergunta no celular acima ou aguarde mensagens reais do WhatsApp."
              acao="Testar com uma pergunta"
              onAcao={() => enviarSimulada(SUGESTOES[0])}
            />
          )}
          {estadoConversas.fase === "pronto" && estadoConversas.conversas.length > 0 && (
            <Resultado
              conversas={estadoConversas.conversas}
              meta={estadoConversas.meta}
              id={estadoConversas.id}
              aguardandoAprovacao={aguardandoAprovacao}
              onLimpar={limparConversa}
              onAprovar={salvarBase}
              onCorrigir={salvarBase}
            />
          )}

          {conectado ? (
            <div className="flex items-center gap-2.5 px-4 py-3.5 bg-accent-soft text-accent-ink rounded-[10px] font-semibold mt-8">Conectado ao número configurado.</div>
          ) : (
            <div className="mt-8 text-center">
              <Link href="/setup#whatsapp" className="btn-link">Conectar meu número</Link>
            </div>
          )}
        </Stage>
      </main>
      {Dialogo}
    </>
  );
}

/** Destaca uma conversa específica, com as ações Aprovar/Corrigir prontas — para onde os links do relatório diário levam (?atender=<numero>&corrigir=1). */
function ConversaSelecionada({
  conversa,
  corrigirFocada,
  onAprovar,
  onCorrigir,
}: {
  conversa: Conversa;
  corrigirFocada: boolean;
  onAprovar: AoSalvarBase;
  onCorrigir: AoSalvarBase;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  return (
    <div ref={ref} className="card p-4 border-accent mb-6">
      <p className="text-[11px] font-bold uppercase tracking-wide text-accent-ink mb-1.5">Conversa selecionada</p>
      <p className="font-semibold mb-1">{rotuloContato(conversa.numero, conversa.nome)}</p>
      <p className="text-sm text-muted mb-2.5">{conversa.ultima_mensagem}</p>
      {conversa.ultima_resposta ? (
        <AcoesResposta
          pergunta={conversa.ultima_mensagem}
          resposta={conversa.ultima_resposta}
          onAprovar={onAprovar}
          onCorrigir={onCorrigir}
          modoInicial={corrigirFocada ? "corrigindo" : "padrao"}
        />
      ) : (
        <p className="text-sm text-muted">Nenhuma resposta registrada ainda para essa conversa.</p>
      )}
    </div>
  );
}

export function Resultado({
  conversas,
  meta,
  id,
  aguardandoAprovacao,
  onLimpar,
  onAprovar,
  onCorrigir,
}: {
  conversas: Conversa[];
  meta: Meta;
  id?: string;
  /** Só a tela principal calcula isso (precisa da base aprovada carregada); /r/[id] não passa nada. */
  aguardandoAprovacao?: number;
  onLimpar?: (numero: string) => void;
  onAprovar?: AoSalvarBase;
  onCorrigir?: AoSalvarBase;
}) {
  return (
    <article className="reveal">
      <ResultHead titulo="Conversas recebidas">
        <Entregar id={id} titulo="Conversas recebidas" texto={() => conversasParaTexto(conversas)} />
      </ResultHead>

      {aguardandoAprovacao ? (
        <div className="mb-3">
          <Chip nivel="media">{aguardandoAprovacao === 1 ? "1 resposta aguardando aprovação" : `${aguardandoAprovacao} respostas aguardando aprovação`}</Chip>
        </div>
      ) : null}

      <Origem meta={meta} />

      {soConversasDeExemplo(conversas) && (
        <div className="mb-4">
          <Aviso acao={ACAO_CONECTAR_NUMERO}>{AVISO_CONVERSAS_EXEMPLO}</Aviso>
        </div>
      )}

      <ConteudoConversas conversas={conversas} onLimpar={onLimpar} onAprovar={onAprovar} onCorrigir={onCorrigir} />

      <SeloIA demo={meta.demo} />
    </article>
  );
}

/** Corpo da lista de conversas (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoConversas({
  conversas,
  onLimpar,
  onAprovar,
  onCorrigir,
}: {
  conversas: Conversa[];
  onLimpar?: (numero: string) => void;
  onAprovar?: AoSalvarBase;
  onCorrigir?: AoSalvarBase;
}) {
  const colunas: Coluna<Conversa>[] = [
    // A hora vive dentro da célula do número: com o palco na metade da tela, uma coluna só para ela
    // espremia a mensagem a ponto de todas as linhas ganharem "Ver mais".
    {
      chave: "numero",
      titulo: "Número",
      papel: "titulo",
      largura: "20%",
      render: (c) => (
        <>
          <strong>{rotuloContato(c.numero, c.nome)}</strong>
          <span className="block text-[12px] text-muted font-normal">{c.hora}</span>
        </>
      ),
    },
    { chave: "ultima_mensagem", titulo: "Última mensagem", papel: "resumo", largura: "34%", linhas: 3, render: (c) => c.ultima_mensagem },
    {
      chave: "status",
      titulo: "Status",
      papel: "chip",
      largura: "150px",
      render: (c) => (
        <div className="flex gap-1.5 flex-wrap justify-end">
          {c.transferir && <Chip nivel="media">Transferida</Chip>}
          <Chip nivel="neutral">{rotuloOrigem(c.origem)}</Chip>
        </div>
      ),
    },
  ];
  if (onAprovar || onCorrigir)
    colunas.push({
      chave: "aprovacao",
      titulo: "Aprovar resposta",
      papel: "detalhe",
      render: (c) =>
        c.ultima_resposta ? (
          <AcoesResposta pergunta={c.ultima_mensagem} resposta={c.ultima_resposta} onAprovar={onAprovar} onCorrigir={onCorrigir} />
        ) : null,
    });
  if (onLimpar)
    colunas.push({
      chave: "acoes",
      titulo: "",
      render: (c) => (
        // Coluna estreita no palco de meia tela: o rótulo longo quebrava em quatro linhas e esticava
        // a linha inteira. A frase completa fica no aviso de confirmação, que já diz o que será apagado.
        <button type="button" className="btn-link whitespace-nowrap" onClick={() => onLimpar(c.numero)}>
          {c.numero === "simulador" ? "Apagar teste" : "Apagar"}
        </button>
      ),
    });

  return <DataTable colunas={colunas} linhas={conversas} />;
}

export function ResultadoRelatorio({ itens, meta, id }: { itens: ItemRelatorioAtendimento[]; meta: Meta; id?: string }) {
  return (
    <article className="reveal">
      <ResultHead titulo="Relatório diário do atendimento">
        <Entregar id={id} titulo="Relatório diário do atendimento" texto={() => relatorioParaTexto(itens)} />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoRelatorio itens={itens} />

      <SeloIA demo={meta.demo} />
    </article>
  );
}

/** Corpo do relatório (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoRelatorio({ itens }: { itens: ItemRelatorioAtendimento[] }) {
  if (itens.length === 0) {
    return <p className="text-muted text-sm">Nenhuma pergunta frequente, sem resposta ou transferida para um humano. Base de conhecimento em dia.</p>;
  }
  return (
    <ul className="flex flex-col gap-4">
      {itens.map((item, i) => (
        <li key={i} className="card p-4">
          <p className="font-semibold mb-1.5">{item.pergunta}</p>
          <div className="flex gap-1.5 flex-wrap mb-2.5">
            {item.transferida && <Chip nivel="media">Transferida</Chip>}
            {item.frequencia > 1 && <Chip nivel="neutral">Perguntada {item.frequencia} vezes</Chip>}
          </div>
          <div className="mb-3">
            <p className="text-sm text-muted">Resposta sugerida: {item.respostaSugerida}</p>
            {item.ferramentaUsada && (
              <p className="text-[11px] text-muted mt-0.5" title={`Ferramenta consultada: ${item.ferramentaUsada}`}>
                Consultado em {item.ferramentaUsada}
              </p>
            )}
          </div>
          <div className="flex gap-4">
            <a className="btn-link" href={`/?atender=${encodeURIComponent(item.numero)}`}>Aprovar</a>
            <a className="btn-link" href={`/?atender=${encodeURIComponent(item.numero)}&corrigir=1`}>Corrigir</a>
          </div>
        </li>
      ))}
    </ul>
  );
}

function relatorioParaTexto(itens: ItemRelatorioAtendimento[]): string {
  const l: string[] = ["Relatório diário do atendimento", ""];
  if (itens.length === 0) {
    l.push("Nenhuma pergunta frequente, sem resposta ou transferida para um humano. Base de conhecimento em dia.");
    return l.join("\n");
  }
  itens.forEach((i) => {
    l.push(`${i.pergunta}${i.transferida ? " (transferida)" : ""}${i.frequencia > 1 ? ` (${i.frequencia}x)` : ""}`);
    l.push(`Resposta sugerida: ${i.respostaSugerida}`);
    if (i.ferramentaUsada) l.push(`Consultado em ${i.ferramentaUsada}`);
    l.push("");
  });
  return l.join("\n").trim();
}

function conversasParaTexto(conversas: Conversa[]): string {
  const l: string[] = ["Conversas recebidas", ""];
  conversas.forEach((c) => l.push(`${rotuloContato(c.numero, c.nome)} (${rotuloOrigem(c.origem)}${c.transferir ? ", transferida" : ""}): ${c.ultima_mensagem} — ${c.hora}`));
  return l.join("\n");
}

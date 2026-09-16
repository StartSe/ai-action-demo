"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Chat, type MensagemChat, type Sugestao } from "@/components/Chat";
import { Quadro as QuadroBoard } from "@/components/Quadro";
import { Aviso, CopyButton, Empty, ErrorBox, Hero, Loading, MaisDetalhes, Origem, Passos, Privacidade, ResultHead, Stage, Topbar, data, Entregar, lerErro, useConfirmacao, useStatus, type ErroLido, type PassoIndicador } from "@/components/ui";
import { ACAO_NOTIFICACOES } from "@/lib/acoes";
import type { Acao, Desfazer, HistoricoItem } from "@/lib/agente";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import type { Cartao, Quadro } from "@/lib/quadro";

const MENSAGEM_BOAS_VINDAS =
  "Olá. Eu opero o quadro por você: crio, movo, comento e arquivo cartões a partir do que você pedir em português. Escolha um atalho abaixo ou descreva o que precisa.";

const EXEMPLO_COMPOSTO =
  "Crie um cartão para entrevistar a candidata Paula na quinta em A fazer e mova o onboarding do Pedro para concluído";

const ETAPAS_CARREGANDO = ["Abrindo o quadro...", "Organizando as colunas...", "Quase pronto..."];

// Textos do topo (economia de texto: título ate 8 palavras, apoio ate 20 — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Gestão e RH",
  titulo: "Fale com o quadro, não com o mouse",
  apoio: "Descreva o que precisa: o agente cria, move, comenta e arquiva os cartões por você.",
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Peça", apoio: "Em português" },
  { titulo: "Confirme", apoio: "Antes de agir" },
  { titulo: "Pronto", apoio: "Quadro atualizado" },
];

const SUGESTAO_RESUMO: Sugestao = { rotulo: "Resumo do quadro", mensagem: "Como está o quadro?" };
const SUGESTOES_BASE: Sugestao[] = [
  { rotulo: "Criar cartão de entrevista", mensagem: "Crie um cartão para entrevistar a candidata Paula na quinta em A fazer" },
  { rotulo: "Mover onboarding do Pedro", mensagem: "Mova o onboarding do Pedro para concluído" },
];

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

type EstadoNotificacoes = { configurada: boolean; canal: "email" | "slack"; destino: string };

type PedidoRecebido = { id: string; quemPede: string; oQuePrecisa: string; resultadoId: string | null; criadoEm: string };

function novoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function IconeConversa() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-8 8H7l-4 3 1.2-4.2A8 8 0 1 1 21 12Z" />
      <path d="M8.5 11h7M8.5 14.5h4" />
    </svg>
  );
}

/** Ilustração de um quadro com três colunas, no lugar de um glifo genérico no estado vazio. */
function IlustracaoQuadro() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="10" width="15" height="44" rx="3" />
      <rect x="24.5" y="10" width="15" height="44" rx="3" />
      <rect x="43" y="10" width="15" height="44" rx="3" />
      <path d="M9 18h9M9 24h6M28 18h9M28 24h6M28 30h9M47 18h9" />
    </svg>
  );
}

/** Cartão de entrada com ícone circular e título, no desenho da suíte. */
function CartaoEntrada({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <div className="card p-5 mb-2.5">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0">{icone}</div>
        <h2 className="font-bold text-[15px]">{titulo}</h2>
      </div>
      {children}
    </div>
  );
}

function totalCartoes(quadro: Quadro): number {
  return quadro.listas.reduce((soma, l) => soma + l.cartoes.length, 0);
}

function quadroParaTexto(quadro: Quadro, resposta?: string): string {
  const linhas: string[] = [];
  if (resposta) linhas.push(resposta, "");
  for (const lista of quadro.listas) {
    linhas.push(`${lista.nome} (${lista.cartoes.length})`);
    lista.cartoes.forEach((c) => linhas.push(`- ${c.nome}${c.responsavel ? ` — ${c.responsavel}` : ""}${c.vencimento ? ` (${c.vencimento})` : ""}`));
    linhas.push("");
  }
  return linhas.join("\n").trim();
}

type EstadoQuadro =
  | { fase: "carregando" }
  | { fase: "erro"; erro: ErroLido }
  | { fase: "pronto"; quadro: Quadro; alterados: string[]; meta: Meta; id?: string; resposta?: string; quadroDemo: boolean; quadroNome: string | null };

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [mensagens, setMensagens] = useState<MensagemChat[]>([{ id: novoId(), papel: "assistente", texto: MENSAGEM_BOAS_VINDAS }]);
  const [historicoConversa, setHistoricoConversa] = useState<HistoricoItem[]>([]);
  const [valor, setValor] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [estadoQuadro, setEstadoQuadro] = useState<EstadoQuadro>({ fase: "carregando" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [reiniciando, setReiniciando] = useState(false);
  const [planoPendente, setPlanoPendente] = useState<{ mensagem: string; historico: HistoricoItem[]; itens: Acao[] } | null>(null);
  const [desfazerPendente, setDesfazerPendente] = useState<Desfazer | null>(null);
  const [desfazendo, setDesfazendo] = useState(false);
  const [notificacoes, setNotificacoes] = useState<EstadoNotificacoes | null>(null);
  const [resumoMatinalId, setResumoMatinalId] = useState<string | null | undefined>(undefined);
  const [criandoResumoMatinal, setCriandoResumoMatinal] = useState(false);
  const [caixaEntradaCodigo, setCaixaEntradaCodigo] = useState<string | null | undefined>(undefined);
  const [criandoCaixaEntrada, setCriandoCaixaEntrada] = useState(false);
  const [pedidosRecebidos, setPedidosRecebidos] = useState<PedidoRecebido[] | null>(null);
  // Avisos inline do painel, no lugar de window.alert: cada ação secundária escreve aqui a sua falha.
  const [avisoAcoes, setAvisoAcoes] = useState<string | null>(null);
  // "O que fazer agora" da última falha do agente, ao lado da bolha de erro da conversa.
  const [acaoDoErro, setAcaoDoErro] = useState<{ rotulo: string; url: string } | null>(null);
  const { confirmar, Dialogo } = useConfirmacao();
  const autoEnviado = useRef(false);
  const primeiraCarga = useRef(true);
  const desfazerTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (desfazerTimeout.current) clearTimeout(desfazerTimeout.current); }, []);

  async function carregarQuadro() {
    try {
      const r = await fetch("/api/quadro");
      if (!r.ok) return setEstadoQuadro({ fase: "erro", erro: await lerErro(r) });
      const resposta = await r.json();
      const { meta: metaGerada, quadroDemo, quadroNome, ...quadro } = resposta;
      setEstadoQuadro({ fase: "pronto", quadro: quadro as Quadro, alterados: [], meta: metaGerada, quadroDemo, quadroNome: quadroNome ?? null });
    } catch (e) {
      setEstadoQuadro({ fase: "erro", erro: await lerErro(e) });
    }
  }

  async function reiniciarQuadro() {
    if (!(await confirmar("Reiniciar o quadro de exemplo? Os cartões voltam ao estado inicial.", { confirmarRotulo: "Reiniciar" }))) return;
    setReiniciando(true);
    setAvisoAcoes(null);
    try {
      const r = await fetch("/api/quadro/reiniciar", { method: "POST" });
      if (!r.ok) {
        setAvisoAcoes((await lerErro(r)).mensagem);
        return;
      }
      const resposta = await r.json();
      const { meta: metaGerada, quadroDemo, quadroNome, ...quadro } = resposta;
      setEstadoQuadro({ fase: "pronto", quadro: quadro as Quadro, alterados: [], meta: metaGerada, quadroDemo, quadroNome: quadroNome ?? null });
    } catch (e) {
      setAvisoAcoes((await lerErro(e)).mensagem);
    } finally {
      setReiniciando(false);
    }
  }

  function atribuir(cartao: Cartao) {
    setValor(`Atribua o cartão "${cartao.nome}" a `);
  }

  // Com ?exemplo=1, o envio automático abaixo já carrega o quadro atualizado; chamar
  // carregarQuadro aqui também correria com aquela resposta e poderia sobrescrevê-la.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("exemplo") === "1") return;
    const t = setTimeout(() => carregarQuadro(), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    fetch("/api/agente").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }, []);

  useEffect(() => {
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
      .then((d) => setResumoMatinalId((d.itens || []).find((i: { tipo: string }) => i.tipo === "resumo-quadro")?.id ?? null))
      .catch(() => setResumoMatinalId(null));
  }, []);

  useEffect(() => {
    fetch("/api/caixa-entrada")
      .then((r) => r.json())
      .then((d) => {
        setCaixaEntradaCodigo(d.codigo ?? null);
        setPedidosRecebidos(d.itens || []);
      })
      .catch(() => {
        setCaixaEntradaCodigo(null);
        setPedidosRecebidos([]);
      });
  }, []);

  async function criarCaixaEntrada() {
    setCriandoCaixaEntrada(true);
    setAvisoAcoes(null);
    try {
      const r = await fetch("/api/caixa-entrada", { method: "POST" });
      if (!r.ok) {
        setAvisoAcoes((await lerErro(r)).mensagem);
        return;
      }
      const d = await r.json();
      setCaixaEntradaCodigo(d.codigo);
    } catch (e) {
      setAvisoAcoes((await lerErro(e)).mensagem);
    } finally {
      setCriandoCaixaEntrada(false);
    }
  }

  async function criarResumoMatinal() {
    if (!notificacoes?.configurada) return;
    setCriandoResumoMatinal(true);
    setAvisoAcoes(null);
    try {
      const r = await fetch("/api/rotinas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "resumo-quadro",
          frequencia: "diaria",
          hora: "08:00",
          canal: notificacoes.canal,
          destino: notificacoes.canal === "email" ? notificacoes.destino || undefined : undefined,
        }),
      });
      if (!r.ok) {
        setAvisoAcoes((await lerErro(r)).mensagem);
        return;
      }
      const d = await r.json();
      setResumoMatinalId(d.id);
    } catch (e) {
      setAvisoAcoes((await lerErro(e)).mensagem);
    } finally {
      setCriandoResumoMatinal(false);
    }
  }

  async function apagarHistorico() {
    if (!(await confirmar("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.", { confirmarRotulo: "Apagar" }))) return;
    await fetch("/api/agente", { method: "DELETE" });
    fetch("/api/agente").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
  }

  // No celular, rola até o quadro quando ele é atualizado por uma resposta do agente
  // (não na carga inicial). Desligado com ?captura=1.
  useEffect(() => {
    if (estadoQuadro.fase !== "pronto") return;
    if (primeiraCarga.current) {
      primeiraCarga.current = false;
      return;
    }
    if (window.innerWidth > 768 || location.search.includes("captura")) return;
    document.getElementById("stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [estadoQuadro]);

  /** Aplica a resposta de uma execução real (direta em demo, ou após "Confirmar"): atualiza o chat, o quadro e o Desfazer. */
  function aplicarResultadoExecutado(
    resposta: { resposta?: string; quadro?: Quadro; alterados?: string[]; meta: Meta; id?: string; quadroDemo?: boolean; quadroNome?: string | null; desfazer?: Desfazer | null; avisoDesfazer?: string | null },
    historicoBase: HistoricoItem[]
  ) {
    const textoResposta = resposta.resposta || "Ação concluída.";
    setMensagens((atual) => [...atual, { id: novoId(), papel: "assistente", texto: textoResposta }]);
    setHistoricoConversa([...historicoBase, { role: "assistant", content: textoResposta }]);
    if (resposta.quadro) {
      setEstadoQuadro({ fase: "pronto", quadro: resposta.quadro, alterados: resposta.alterados || [], meta: resposta.meta, id: resposta.id, resposta: textoResposta, quadroDemo: Boolean(resposta.quadroDemo), quadroNome: resposta.quadroNome ?? null });
    }
    if (desfazerTimeout.current) clearTimeout(desfazerTimeout.current);
    if (resposta.desfazer) {
      setDesfazerPendente(resposta.desfazer);
      desfazerTimeout.current = setTimeout(() => setDesfazerPendente(null), 30_000);
    } else {
      setDesfazerPendente(null);
      if (resposta.avisoDesfazer) {
        setMensagens((atual) => [...atual, { id: novoId(), papel: "assistente", texto: resposta.avisoDesfazer as string }]);
      }
    }
    fetch("/api/agente").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
  }

  /** Falha de uma chamada ao agente: a frase curada vira uma bolha de erro no chat, com a ação logo abaixo. */
  async function mostrarFalhaDoAgente(origem: Response | unknown) {
    const lido = await lerErro(origem);
    if (lido.codigo === "sem_sessao") {
      router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    setMensagens((atual) => [...atual, { id: novoId(), papel: "erro", texto: lido.mensagem }]);
    setAvisoAcoes(null);
    if (lido.acao) setAcaoDoErro(lido.acao);
  }

  async function enviarMensagem(mensagem: string) {
    setMensagens((atual) => [...atual, { id: novoId(), papel: "usuario", texto: mensagem }]);
    const novoHistorico = [...historicoConversa, { role: "user" as const, content: mensagem }];
    setHistoricoConversa(novoHistorico);
    setValor("");
    setPlanoPendente(null);
    setAcaoDoErro(null);
    setCarregando(true);
    try {
      const r = await fetch("/api/agente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem, historico: novoHistorico }),
      });
      if (!r.ok) return await mostrarFalhaDoAgente(r);
      const resposta = await r.json();
      if (resposta.plano) {
        setPlanoPendente({ mensagem, historico: novoHistorico, itens: resposta.plano });
        setMensagens((atual) => [...atual, { id: novoId(), papel: "assistente", texto: "Antes de mexer no seu quadro, veja o plano abaixo e confirme." }]);
        return;
      }
      aplicarResultadoExecutado(resposta, novoHistorico);
    } catch (e) {
      await mostrarFalhaDoAgente(e);
    } finally {
      setCarregando(false);
    }
  }

  async function confirmarPlano() {
    if (!planoPendente) return;
    const { mensagem, historico: historicoBase } = planoPendente;
    setPlanoPendente(null);
    setAcaoDoErro(null);
    setCarregando(true);
    try {
      const r = await fetch("/api/agente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem, historico: historicoBase, confirmar: true }),
      });
      if (!r.ok) return await mostrarFalhaDoAgente(r);
      aplicarResultadoExecutado(await r.json(), historicoBase);
    } catch (e) {
      await mostrarFalhaDoAgente(e);
    } finally {
      setCarregando(false);
    }
  }

  function cancelarPlano() {
    setPlanoPendente(null);
    setMensagens((atual) => [...atual, { id: novoId(), papel: "assistente", texto: "Tudo bem, não fiz nada." }]);
  }

  async function desfazerUltimaAcao() {
    if (!desfazerPendente) return;
    setDesfazendo(true);
    setAvisoAcoes(null);
    try {
      const r = await fetch("/api/agente/desfazer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desfazer: desfazerPendente }),
      });
      if (!r.ok) {
        setAvisoAcoes((await lerErro(r)).mensagem);
        return;
      }
      const resposta = await r.json();
      setEstadoQuadro((atual) => (atual.fase === "pronto" ? { ...atual, quadro: resposta.quadro as Quadro, alterados: [] } : atual));
      setMensagens((atual) => [...atual, { id: novoId(), papel: "assistente", texto: "Desfeito." }]);
    } catch (e) {
      setAvisoAcoes((await lerErro(e)).mensagem);
    } finally {
      setDesfazendo(false);
      if (desfazerTimeout.current) clearTimeout(desfazerTimeout.current);
      setDesfazerPendente(null);
    }
  }

  // Atalho para demonstrações: /?exemplo=1 envia um comando composto que cria e move cartões.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => enviarMensagem(EXEMPLO_COMPOSTO), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const quadroDemo = estadoQuadro.fase === "pronto" && estadoQuadro.quadroDemo;
  // Enquanto o quadro carrega (ou quando ele falha em carregar), quem responde "há quadro real
  // conectado?" são as integrações já configuradas; depois, o próprio quadro carregado.
  const quadroReal =
    estadoQuadro.fase === "pronto"
      ? !estadoQuadro.quadroDemo
      : Boolean(status?.integrations?.trello || status?.integrations?.["mcp-tarefas"]);
  // Com um quadro real conectado, "Resumo do quadro" vem primeiro: é a única sugestão que não
  // mexe em nada e serve para conferir se o agente está enxergando o quadro certo.
  const sugestoes = quadroReal ? [SUGESTAO_RESUMO, ...SUGESTOES_BASE] : [...SUGESTOES_BASE, SUGESTAO_RESUMO];
  const passoAtual = planoPendente ? 2 : estadoQuadro.fase === "pronto" && estadoQuadro.resposta ? 3 : 1;

  return (
    <>
      <Topbar
        marca="K"
        nome="Agente de Kanban"
        area="Gestão e RH"
        status={status}
        erro={erro}
        usuario={status?.usuario}
        resumo="Modo demonstração: sem IA conectada, o agente segue por palavras-chave; sem um quadro real conectado, ele opera um quadro de exemplo só seu, que você pode reiniciar quando quiser."
      />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Gestão">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          <CartaoEntrada icone={<IconeConversa />} titulo="O que você precisa">
            <Chat mensagens={mensagens} carregando={carregando} valor={valor} sugestoes={sugestoes} onValorChange={setValor} onEnviar={enviarMensagem} />

            {acaoDoErro && (
              <div className="mt-3">
                <Aviso tom="danger" acao={acaoDoErro}>Resolva o ponto acima e peça de novo.</Aviso>
              </div>
            )}

            {planoPendente && (
              <div className="card p-3.5 mt-3 border-accent">
                <p className="text-[13px] font-bold mb-2">Antes de agir no seu quadro, vou:</p>
                <ul className="text-sm flex flex-col gap-1 mb-3 list-disc pl-4">
                  {planoPendente.itens.map((a, i) => (
                    <li key={i}>{a.descricao}</li>
                  ))}
                </ul>
                <div className="flex gap-2 flex-wrap">
                  <button type="button" className="btn-primary !w-auto px-4" onClick={confirmarPlano} disabled={carregando}>Confirmar</button>
                  <button type="button" className="btn-ghost !w-auto max-w-full whitespace-normal" onClick={cancelarPlano} disabled={carregando}>Cancelar</button>
                </div>
              </div>
            )}

            {(desfazerPendente || quadroDemo) && (
              <div className="flex flex-wrap gap-2 mt-3.5 min-w-0">
                {desfazerPendente && (
                  <button type="button" className="btn-ghost !w-auto max-w-full whitespace-normal" onClick={desfazerUltimaAcao} disabled={desfazendo}>
                    {desfazendo ? "Desfazendo..." : "Desfazer última ação"}
                  </button>
                )}
                {quadroDemo && (
                  <button type="button" className="btn-ghost !w-auto max-w-full whitespace-normal" onClick={reiniciarQuadro} disabled={reiniciando}>
                    {reiniciando ? "Reiniciando..." : "Reiniciar quadro de exemplo"}
                  </button>
                )}
              </div>
            )}

            {avisoAcoes && (
              <div className="mt-3">
                <Aviso tom="danger">{avisoAcoes}</Aviso>
              </div>
            )}
          </CartaoEntrada>

          <div className="card p-5 mt-4">
            <Privacidade detalhe="As ações ficam salvas neste app até você apagar em 'Últimos resultados'." />

            <MaisDetalhes titulo="Mais ações">
              <div className="flex flex-col gap-3">
                <div>
                  {resumoMatinalId === undefined || notificacoes === null ? (
                    <p className="text-muted text-sm">Carregando...</p>
                  ) : resumoMatinalId ? (
                    <p className="text-muted text-sm">Você já recebe um resumo do quadro toda manhã, às 8h.</p>
                  ) : notificacoes.configurada ? (
                    <button type="button" className="btn-ghost !w-auto max-w-full whitespace-normal" onClick={criarResumoMatinal} disabled={criandoResumoMatinal}>
                      {criandoResumoMatinal ? "Criando..." : "Receber um resumo do quadro toda manhã"}
                    </button>
                  ) : (
                    <Aviso acao={ACAO_NOTIFICACOES}>
                      Para receber um resumo do quadro toda manhã, escolha antes para onde o aviso vai (e-mail ou Slack).
                    </Aviso>
                  )}
                </div>

                <div>
                  {caixaEntradaCodigo === undefined ? null : caixaEntradaCodigo ? (
                    <>
                      <p className="text-[13px] font-semibold mb-1.5">Link para quem quiser pedir algo ao time</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[180px]">{`${location.origin}/f/${caixaEntradaCodigo}`}</code>
                        <CopyButton texto={() => `${location.origin}/f/${caixaEntradaCodigo}`} rotulo="Copiar link" />
                      </div>
                    </>
                  ) : (
                    <button type="button" className="btn-ghost !w-auto max-w-full whitespace-normal" onClick={criarCaixaEntrada} disabled={criandoCaixaEntrada}>
                      {criandoCaixaEntrada ? "Criando..." : "Criar um link para receber pedidos"}
                    </button>
                  )}
                </div>
              </div>
            </MaisDetalhes>

            <MaisDetalhes titulo="Pedidos recebidos">
              {pedidosRecebidos === null ? (
                <p className="text-muted text-sm">Carregando...</p>
              ) : pedidosRecebidos.length === 0 ? (
                <p className="text-muted text-sm">Nenhum pedido recebido ainda.</p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {pedidosRecebidos.map((p) => (
                    <li key={p.id} className="flex justify-between gap-3">
                      {p.resultadoId ? (
                        <Link href={`/r/${p.resultadoId}`} className="text-accent-ink font-semibold hover:underline truncate">{p.quemPede || "Alguém"}: {p.oQuePrecisa}</Link>
                      ) : (
                        <span className="truncate">{p.quemPede || "Alguém"}: {p.oQuePrecisa}</span>
                      )}
                      <span className="text-muted shrink-0">{data(p.criadoEm)}</span>
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
                  <div className="flex items-center gap-4 flex-wrap">
                    <Link href="/historico" className="btn-link text-[13px]">Ver todos</Link>
                    <button type="button" className="btn-ghost !w-auto max-w-full whitespace-normal" onClick={apagarHistorico}>Apagar tudo</button>
                  </div>
                </>
              )}
            </MaisDetalhes>
          </div>
        </div>

        <Stage>
          {estadoQuadro.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estadoQuadro.fase === "erro" && (
            <ErrorBox
              mensagem={estadoQuadro.erro.mensagem}
              codigo={estadoQuadro.erro.codigo as CodigoErroIA | undefined}
              acao={estadoQuadro.erro.acao}
              onTentarNovamente={carregarQuadro}
            />
          )}
          {estadoQuadro.fase === "pronto" && totalCartoes(estadoQuadro.quadro) === 0 && (
            <Empty
              ilustracao={<IlustracaoQuadro />}
              titulo="O quadro está vazio"
              descricao="Peça ao agente para criar, mover, atribuir, comentar ou arquivar um cartão a partir de um comando em português."
              acao="Testar com um exemplo"
              onAcao={() => enviarMensagem(EXEMPLO_COMPOSTO)}
            />
          )}
          {estadoQuadro.fase === "pronto" && totalCartoes(estadoQuadro.quadro) > 0 && (
            <Resultado
              quadro={estadoQuadro.quadro}
              alterados={estadoQuadro.alterados}
              meta={estadoQuadro.meta}
              id={estadoQuadro.id}
              resposta={estadoQuadro.resposta}
              quadroNome={estadoQuadro.quadroNome}
              onAtribuir={atribuir}
            />
          )}
        </Stage>
      </main>
      {Dialogo}
    </>
  );
}

export function Resultado({
  quadro,
  alterados,
  meta,
  id,
  resposta,
  quadroNome,
  onAtribuir,
}: {
  quadro: Quadro;
  alterados: string[];
  meta: Meta;
  id?: string;
  resposta?: string;
  /** Nome do quadro conectado; ausente no quadro de exemplo e nos resultados reabertos em /r/[id]. */
  quadroNome?: string | null;
  onAtribuir?: (cartao: Cartao) => void;
}) {
  return (
    <article className="reveal">
      <ResultHead titulo="Quadro atualizado" subtitulo={quadroNome ? `Quadro: ${quadroNome}` : undefined}>
        <Entregar id={id} titulo="Quadro atualizado" texto={() => quadroParaTexto(quadro, resposta)} />
      </ResultHead>

      <Origem meta={meta} demoTexto="Exemplo fixo: o pedido enviado não foi executado no quadro." />

      <ConteudoQuadro quadro={quadro} alterados={alterados} resposta={resposta} onAtribuir={onAtribuir} />
    </article>
  );
}

/** Corpo do resultado (resposta do agente + quadro, sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoQuadro({
  quadro,
  alterados,
  resposta,
  onAtribuir,
}: {
  quadro: Quadro;
  alterados: string[];
  resposta?: string;
  onAtribuir?: (cartao: Cartao) => void;
}) {
  return (
    <>
      {resposta && <p className="summary">{resposta}</p>}
      <QuadroBoard quadro={quadro} alterados={alterados} onAtribuir={onAtribuir} />
    </>
  );
}

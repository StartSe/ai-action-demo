"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Chip,
  CopyButton,
  DataTable,
  Empty,
  Entregar,
  ErrorBox,
  Field,
  Loading,
  MaisDetalhes,
  Origem,
  Panel,
  Privacidade,
  ResultHead,
  Row,
  Stage,
  Topbar,
  Workspace,
  data,
  type Coluna,
  useScrollToResult,
  useStatus,
} from "@/components/ui";
import { AcoesResposta, Celular, horaAtual, type AoSalvarBase, type BolhaChat } from "@/components/Celular";
import type { Meta } from "@/lib/ai";
import type { ParBase } from "@/lib/base";
import type { Sugestao } from "@/lib/sugestoes";
import type { CanalOrigem, Config, Conversa, ItemRelatorioAtendimento } from "@/lib/types";

const CONFIG_VAZIA: Config = { negocio: "", atendente: "", tom: "cordial", horario: "", baseConhecimento: "", naoSei: "humano" };

const SUGESTOES = ["Quanto custa o clareamento dental?", "Vocês atendem aos sábados?", "Fazem cirurgia cardíaca?"];

const ETAPAS_CARREGANDO = ["Abrindo as conversas...", "Quase pronto..."];

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

type EstadoNotificacoes = { configurada: boolean; canal: "email" | "slack"; destino: string };

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

type EstadoConversas = { fase: "carregando" } | { fase: "erro"; mensagem: string } | { fase: "pronto"; conversas: Conversa[]; meta: Meta; id?: string };

export default function Page() {
  const { status, erro } = useStatus();
  const [config, setConfig] = useState<Config>(CONFIG_VAZIA);
  const [configSalva, setConfigSalva] = useState<Config>(CONFIG_VAZIA);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erroConfig, setErroConfig] = useState<string | null>(null);

  const [mensagens, setMensagens] = useState<BolhaChat[]>([]);
  const [valor, setValor] = useState("");
  const [enviando, setEnviando] = useState(false);

  const [estadoConversas, setEstadoConversas] = useState<EstadoConversas>({ fase: "carregando" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [base, setBase] = useState<ParBase[] | null>(null);
  const [sugestoesCodigo, setSugestoesCodigo] = useState<string | null | undefined>(undefined);
  const [sugestoes, setSugestoes] = useState<Sugestao[] | null>(null);
  const [criandoLinkSugestoes, setCriandoLinkSugestoes] = useState(false);
  const [tratandoSugestao, setTratandoSugestao] = useState<string | null>(null);
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
      .catch(() => setEstadoConversas({ fase: "erro", mensagem: "Não foi possível carregar as conversas agora." }));
  }

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((c) => { setConfig(c); setConfigSalva(c); }).catch(() => {});
    // Com ?exemplo=1, o envio automático abaixo já traz a lista de conversas atualizada;
    // carregar aqui também correria com aquela resposta e poderia sobrescrevê-la.
    if (new URLSearchParams(location.search).get("exemplo") !== "1") carregarConversas();
    fetch("/api/simular").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]));
    fetch("/api/base").then((r) => r.json()).then((r) => setBase(r.itens)).catch(() => setBase([]));
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

  async function criarRelatorio() {
    if (!notificacoes?.configurada) return;
    setCriandoRelatorio(true);
    try {
      const r = await fetch("/api/rotinas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "relatorio-atendimento",
          frequencia: "diaria",
          hora: "08:00",
          canal: notificacoes.canal,
          destino: notificacoes.canal === "email" ? notificacoes.destino || undefined : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível criar a rotina.");
      setRelatorioId(d.id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Não foi possível criar a rotina.");
    } finally {
      setCriandoRelatorio(false);
    }
  }

  const salvarBase: AoSalvarBase = (pergunta, resposta) => {
    fetch("/api/base", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pergunta, resposta }),
    })
      .then((r) => r.json())
      .then((r) => {
        if (r.itens) setBase(r.itens);
      })
      .catch(() => {});
  };

  async function criarLinkSugestoes() {
    setCriandoLinkSugestoes(true);
    try {
      const r = await fetch("/api/sugestoes", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível criar o link.");
      setSugestoesCodigo(d.codigo);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Não foi possível criar o link.");
    } finally {
      setCriandoLinkSugestoes(false);
    }
  }

  async function tratarSugestao(id: string, acao: "aprovar" | "descartar") {
    setTratandoSugestao(id);
    try {
      const r = await fetch("/api/sugestoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, acao }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível concluir a ação.");
      setSugestoes(d.itens);
      if (acao === "aprovar") {
        fetch("/api/base").then((r2) => r2.json()).then((r2) => setBase(r2.itens)).catch(() => {});
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Não foi possível concluir a ação.");
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
      const r = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Não foi possível salvar a configuração.");
      setConfig(data);
      setConfigSalva(data);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 1500);
    } catch (err) {
      setErroConfig(err instanceof Error ? err.message : "Erro inesperado.");
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
      const r = await fetch("/api/simular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ de: "simulador", texto, config: configRef.current }),
      });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Falha ao responder.");
      setMensagens((m) => [
        ...m.filter((x) => !x.pendente),
        { papel: "atendente", texto: resposta.resposta, transferido: resposta.transferir, hora: horaAtual() },
      ]);
      setEstadoConversas({ fase: "pronto", conversas: resposta.conversas, meta: resposta.meta, id: resposta.id });
      fetch("/api/simular").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : "erro inesperado";
      setMensagens((m) => [...m.filter((x) => !x.pendente), { papel: "atendente", texto: `Não deu certo: ${mensagem}`, erro: true, hora: horaAtual() }]);
    } finally {
      setEnviando(false);
    }
  }

  async function limparConversa(numero: string) {
    try {
      await fetch(`/api/conversas/${encodeURIComponent(numero)}`, { method: "DELETE" });
      carregarConversas();
    } catch {
      // ignora falha silenciosamente
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
  }, []);

  const conectado = Boolean(status?.integrations?.whatsapp);
  const carregando = estadoConversas.fase === "carregando";
  // Link "Aprovar"/"Corrigir" do relatório diário chega com ?atender=<numero>: posiciona a tela nessa conversa.
  const conversaSelecionada = atenderNumero && estadoConversas.fase === "pronto" ? estadoConversas.conversas.find((c) => c.numero === atenderNumero) : undefined;

  return (
    <>
      <Topbar
        marca="W"
        nome="Atendente no WhatsApp"
        area="Atendimento e Vendas"
        status={status}
        erro={erro}
        resumo="Modo demonstração: as respostas vêm de uma busca simples na base de conhecimento, não da IA."
      />

      <Workspace>
        <Panel
          titulo="Um atendente que já conhece o seu negócio."
          lead="Clientes perguntam a mesma coisa no WhatsApp fora do horário. Configure abaixo o que a IA pode responder, teste ao lado e conecte ao número de verdade quando fizer sentido."
        >
          <form id="form-config" onSubmit={salvarConfig}>
            <Row>
              <Field label="Nome do negócio" htmlFor="negocio">
                <input id="negocio" className="input" required placeholder="Sorriso Pleno Odontologia" value={config.negocio} onChange={(e) => setCampo("negocio", e.target.value)} />
              </Field>
              <Field label="Nome do atendente" htmlFor="atendenteNome">
                <input id="atendenteNome" className="input" required placeholder="Bia" value={config.atendente} onChange={(e) => setCampo("atendente", e.target.value)} />
              </Field>
            </Row>
            <Field label="Base de conhecimento" htmlFor="baseConhecimento" hint="Tudo o que o atendente pode responder deve estar aqui. Ele não inventa informação fora disso.">
              <textarea
                id="baseConhecimento"
                className="input min-h-[220px] resize-y"
                required
                placeholder="Produtos, preços, prazos, políticas e perguntas frequentes do seu negócio..."
                value={config.baseConhecimento}
                onChange={(e) => setCampo("baseConhecimento", e.target.value)}
              />
            </Field>
            <MaisDetalhes>
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
              <Field label="Quando não souber a resposta" htmlFor="naoSei">
                <select id="naoSei" className="input" value={config.naoSei} onChange={(e) => setCampo("naoSei", e.target.value as Config["naoSei"])}>
                  <option value="humano">Avisar que um humano vai responder</option>
                  <option value="contato">Pedir e-mail e telefone</option>
                  <option value="site">Indicar o site</option>
                </select>
              </Field>
            </MaisDetalhes>
            {erroConfig && (
              <div className="bg-[#fde8e6] border border-[#f5c2bd] text-danger px-4 py-3 rounded-[10px] mb-4 text-sm">
                <strong>Não deu certo.</strong> {erroConfig}
              </div>
            )}
          </form>
          <Privacidade detalhe="As conversas ficam salvas neste app até você apagar em 'Últimos resultados'." />

          <MaisDetalhes titulo="Últimos resultados">
            {historico === null ? (
              <p className="text-muted text-sm">Carregando...</p>
            ) : historico.length === 0 ? (
              <p className="text-muted text-sm">Nenhum resultado salvo ainda.</p>
            ) : (
              <>
                <ul className="flex flex-col gap-1.5 text-sm mb-3">
                  {historico.map((h) => (
                    <li key={h.id} className="flex justify-between gap-3">
                      <Link href={`/r/${h.id}`} className="text-accent-ink font-semibold hover:underline truncate">{h.titulo}</Link>
                      <span className="text-muted shrink-0">{data(h.criadoEm)}</span>
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn-ghost" onClick={apagarHistorico}>Apagar tudo</button>
              </>
            )}
          </MaisDetalhes>

          <MaisDetalhes titulo="Base de respostas aprovadas">
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
              <p className="text-muted text-sm">
                Nenhuma sugestão recebida ainda. Compartilhe o link acima com a equipe para receber perguntas e respostas.
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5 text-sm">
                {sugestoes.map((s) => (
                  <li key={s.id} className="border-b border-line pb-2.5 last:border-0 last:pb-0">
                    <p className="font-semibold">{s.pergunta}</p>
                    <p className="text-muted">{s.resposta}</p>
                    {s.categoria && <p className="text-muted text-[12.5px] mt-0.5">Categoria: {s.categoria}</p>}
                    <div className="flex gap-2 mt-2">
                      <button type="button" className="btn-ghost" onClick={() => tratarSugestao(s.id, "aprovar")} disabled={tratandoSugestao === s.id}>
                        Aprovar
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => tratarSugestao(s.id, "descartar")} disabled={tratandoSugestao === s.id}>
                        Descartar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </MaisDetalhes>

          {relatorioId === undefined || notificacoes === null ? null : relatorioId ? (
            <p className="text-muted text-sm mt-3.5">Você já recebe o relatório do atendimento todo dia, às 8h.</p>
          ) : notificacoes.configurada ? (
            <button type="button" className="btn-ghost mt-3.5" onClick={criarRelatorio} disabled={criandoRelatorio}>
              {criandoRelatorio ? "Criando..." : "Receber o relatório diário"}
            </button>
          ) : (
            <a href="/setup#notificacoes" className="btn-ghost mt-3.5">Receber o relatório diário</a>
          )}

          {(configAlterada || salvo) && (
            <div className="sticky bottom-0 -mx-7 max-md:-mx-[22px] -mb-7 max-md:-mb-[22px] mt-6 px-7 max-md:px-[22px] py-4 bg-surface border-t border-line rounded-b-card flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-accent-ink">{configAlterada ? "Alterações não salvas" : "Configuração salva"}</span>
              <button type="submit" form="form-config" className="btn-primary w-auto" disabled={salvando}>
                {salvando ? "Salvando" : "Salvar"}
              </button>
            </div>
          )}
        </Panel>

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
                className="bg-accent-soft text-accent-ink rounded-full px-3.5 py-1.5 text-[13px] font-semibold cursor-pointer border-0 hover:bg-[#d3ede7] transition-colors"
                onClick={() => enviarSimulada(s)}
              >
                {s}
              </button>
            ))}
          </div>

          {carregando && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estadoConversas.fase === "erro" && <ErrorBox mensagem={estadoConversas.mensagem} onTentarNovamente={carregarConversas} />}
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
      </Workspace>
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
      <p className="font-semibold mb-1">{conversa.numero === "simulador" ? "Simulador" : conversa.numero}</p>
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
  onLimpar,
  onAprovar,
  onCorrigir,
}: {
  conversas: Conversa[];
  meta: Meta;
  id?: string;
  onLimpar?: (numero: string) => void;
  onAprovar?: AoSalvarBase;
  onCorrigir?: AoSalvarBase;
}) {
  return (
    <article className="reveal">
      <ResultHead titulo="Conversas recebidas">
        <Entregar id={id} titulo="Conversas recebidas" texto={() => conversasParaTexto(conversas)} />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoConversas conversas={conversas} onLimpar={onLimpar} onAprovar={onAprovar} onCorrigir={onCorrigir} />
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
    { chave: "numero", titulo: "Número", papel: "titulo", largura: "22%", render: (c) => <strong>{c.numero === "simulador" ? "Simulador" : c.numero}</strong> },
    { chave: "ultima_mensagem", titulo: "Última mensagem", papel: "resumo", render: (c) => c.ultima_mensagem },
    {
      chave: "status",
      titulo: "Status",
      papel: "chip",
      largura: "190px",
      render: (c) => (
        <div className="flex gap-1.5 flex-wrap justify-end">
          {c.transferir && <Chip nivel="media">Transferida</Chip>}
          <Chip nivel="neutral">{rotuloOrigem(c.origem)}</Chip>
        </div>
      ),
    },
    { chave: "hora", titulo: "Hora", render: (c) => c.hora },
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
      render: (c) => {
        const simulador = c.numero === "simulador";
        const rotulo = simulador ? "Apagar conversas do simulador" : "Limpar";
        const confirmacao = simulador
          ? "Apagar as conversas do simulador? Essa ação não pode ser desfeita."
          : "Apagar esta conversa? Essa ação não pode ser desfeita.";
        return (
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              if (window.confirm(confirmacao)) onLimpar(c.numero);
            }}
          >
            {rotulo}
          </button>
        );
      },
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
          <p className="text-sm text-muted mb-3">Resposta sugerida: {item.respostaSugerida}</p>
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
    l.push(`Resposta sugerida: ${i.respostaSugerida}`, "");
  });
  return l.join("\n").trim();
}

function rotuloOrigem(origem: CanalOrigem): string {
  if (origem === "whatsapp") return "WhatsApp";
  if (origem === "mcp") return "Assistente de IA";
  return "Simulador";
}

function conversasParaTexto(conversas: Conversa[]): string {
  const l: string[] = ["Conversas recebidas", ""];
  conversas.forEach((c) =>
    l.push(`${c.numero === "simulador" ? "Simulador" : c.numero} (${rotuloOrigem(c.origem)}${c.transferir ? ", transferida" : ""}): ${c.ultima_mensagem} — ${c.hora}`)
  );
  return l.join("\n");
}

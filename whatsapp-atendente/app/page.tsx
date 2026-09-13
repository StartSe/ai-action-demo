"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Chip,
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
import { Celular, type BolhaChat } from "@/components/Celular";
import type { Meta } from "@/lib/ai";
import type { Config, Conversa } from "@/lib/types";

const CONFIG_VAZIA: Config = { negocio: "", atendente: "", tom: "cordial", horario: "", baseConhecimento: "", naoSei: "humano" };

const SUGESTOES = ["Quanto custa o clareamento dental?", "Vocês atendem aos sábados?", "Fazem cirurgia cardíaca?"];

const ETAPAS_CARREGANDO = ["Abrindo as conversas...", "Quase pronto..."];

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

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
  }, []);

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
    setMensagens((m) => [...m, { papel: "cliente", texto }, { papel: "atendente", texto: "digitando...", pendente: true }]);
    setEnviando(true);
    try {
      const r = await fetch("/api/simular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ de: "simulador", texto, config: configRef.current }),
      });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Falha ao responder.");
      setMensagens((m) => [...m.filter((x) => !x.pendente), { papel: "atendente", texto: resposta.resposta, transferido: resposta.transferir }]);
      setEstadoConversas({ fase: "pronto", conversas: resposta.conversas, meta: resposta.meta, id: resposta.id });
      fetch("/api/simular").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : "erro inesperado";
      setMensagens((m) => [...m.filter((x) => !x.pendente), { papel: "atendente", texto: `Não deu certo: ${mensagem}`, transferido: true }]);
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
          <Celular nome={config.atendente} mensagens={mensagens} valor={valor} onValorChange={setValor} onEnviar={enviarSimulada} enviando={enviando} />

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
            <Resultado conversas={estadoConversas.conversas} meta={estadoConversas.meta} id={estadoConversas.id} onLimpar={limparConversa} />
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

export function Resultado({ conversas, meta, id, onLimpar }: { conversas: Conversa[]; meta: Meta; id?: string; onLimpar?: (numero: string) => void }) {
  return (
    <article className="reveal">
      <ResultHead titulo="Conversas recebidas">
        <Entregar id={id} titulo="Conversas recebidas" texto={() => conversasParaTexto(conversas)} />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoConversas conversas={conversas} onLimpar={onLimpar} />
    </article>
  );
}

/** Corpo da lista de conversas (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoConversas({ conversas, onLimpar }: { conversas: Conversa[]; onLimpar?: (numero: string) => void }) {
  const colunas: Coluna<Conversa>[] = [
    { chave: "numero", titulo: "Número", papel: "titulo", largura: "22%", render: (c) => <strong>{c.numero}</strong> },
    { chave: "ultima_mensagem", titulo: "Última mensagem", papel: "resumo", render: (c) => c.ultima_mensagem },
    {
      chave: "status",
      titulo: "Status",
      papel: "chip",
      largura: "190px",
      render: (c) => (
        <div className="flex gap-1.5 flex-wrap justify-end">
          {c.transferir && <Chip nivel="media">Transferida</Chip>}
          <Chip nivel="neutral">{c.origem === "whatsapp" ? "WhatsApp" : "Simulador"}</Chip>
        </div>
      ),
    },
    { chave: "hora", titulo: "Hora", render: (c) => c.hora },
  ];
  if (onLimpar) colunas.push({ chave: "acoes", titulo: "", render: (c) => <button type="button" className="btn-link" onClick={() => onLimpar(c.numero)}>Limpar</button> });

  return <DataTable colunas={colunas} linhas={conversas} />;
}

function conversasParaTexto(conversas: Conversa[]): string {
  const l: string[] = ["Conversas recebidas", ""];
  conversas.forEach((c) => l.push(`${c.numero} (${c.origem === "whatsapp" ? "WhatsApp" : "Simulador"}${c.transferir ? ", transferida" : ""}): ${c.ultima_mensagem} — ${c.hora}`));
  return l.join("\n");
}

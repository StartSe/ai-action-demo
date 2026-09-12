"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { DemoNotice, Field, Panel, Row, Stage, Topbar, Workspace, useScrollToResult, useStatus } from "@/components/ui";
import { Celular, type BolhaChat } from "@/components/Celular";
import { Conversas } from "@/components/Conversas";
import { ConectarWhatsApp } from "@/components/ConectarWhatsApp";
import type { Config, Conversa } from "@/lib/types";

const CONFIG_VAZIA: Config = { negocio: "", atendente: "", tom: "cordial", horario: "", baseConhecimento: "", naoSei: "humano" };

const SUGESTOES = ["Quanto custa o clareamento dental?", "Vocês atendem aos sábados?", "Fazem cirurgia cardíaca?"];

export default function Page() {
  const { status, erro } = useStatus();
  const [config, setConfig] = useState<Config>(CONFIG_VAZIA);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erroConfig, setErroConfig] = useState<string | null>(null);

  const [mensagens, setMensagens] = useState<BolhaChat[]>([]);
  const [valor, setValor] = useState("");
  const [enviando, setEnviando] = useState(false);

  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const autoEnviado = useRef(false);

  useScrollToResult(mensagens.length > 0);

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setConfig).catch(() => {});
    carregarConversas();
    fetch("/api/whatsapp/webhook-info")
      .then((r) => r.json())
      .then((d) => { setWebhookUrl(d.url || ""); setVerifyToken(d.verifyToken || ""); })
      .catch(() => {});
  }, []);

  async function carregarConversas() {
    try {
      const r = await fetch("/api/conversas");
      setConversas(await r.json());
    } catch {
      // mantém a lista como estava
    }
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
        body: JSON.stringify({ de: "simulador", texto }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao responder.");
      setMensagens((m) => [...m.filter((x) => !x.pendente), { papel: "atendente", texto: data.resposta, transferido: data.transferir }]);
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : "erro inesperado";
      setMensagens((m) => [...m.filter((x) => !x.pendente), { papel: "atendente", texto: `Não deu certo: ${mensagem}`, transferido: true }]);
    } finally {
      setEnviando(false);
      await carregarConversas();
    }
  }

  async function limparConversa(numero: string) {
    try {
      await fetch(`/api/conversas/${encodeURIComponent(numero)}`, { method: "DELETE" });
      await carregarConversas();
    } catch {
      // ignora falha silenciosamente
    }
  }

  // Atalho para demonstrações: /?exemplo=1 envia duas perguntas no simulador (uma que casa com a base, outra que não).
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      const t = setTimeout(async () => {
        await enviarSimulada("Quanto custa o clareamento dental?");
        await enviarSimulada("Fazem cirurgia cardíaca?");
      }, 0);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conectado = Boolean(status?.integrations?.whatsapp);

  return (
    <>
      <Topbar marca="W" nome="Atendente no WhatsApp" area="Atendimento e Vendas" status={status} erro={erro} />
      <DemoNotice visivel={Boolean(status && !status.ai)} resumo="Modo demonstração: as respostas vêm de uma busca simples na base de conhecimento, não da IA." />

      <Workspace>
        <Panel
          titulo="Um atendente que já conhece o seu negócio."
          lead="Clientes perguntam a mesma coisa no WhatsApp fora do horário. Configure abaixo o que a IA pode responder, teste ao lado e conecte ao número de verdade quando fizer sentido."
        >
          <form onSubmit={salvarConfig}>
            <Row>
              <Field label="Nome do negócio" htmlFor="negocio">
                <input id="negocio" className="input" required placeholder="Sorriso Pleno Odontologia" value={config.negocio} onChange={(e) => setCampo("negocio", e.target.value)} />
              </Field>
              <Field label="Nome do atendente" htmlFor="atendenteNome">
                <input id="atendenteNome" className="input" required placeholder="Bia" value={config.atendente} onChange={(e) => setCampo("atendente", e.target.value)} />
              </Field>
            </Row>
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
            <Field label="Quando não souber a resposta" htmlFor="naoSei">
              <select id="naoSei" className="input" value={config.naoSei} onChange={(e) => setCampo("naoSei", e.target.value as Config["naoSei"])}>
                <option value="humano">Avisar que um humano vai responder</option>
                <option value="contato">Pedir e-mail e telefone</option>
                <option value="site">Indicar o site</option>
              </select>
            </Field>
            {erroConfig && (
              <div className="bg-[#fde8e6] border border-[#f5c2bd] text-danger px-4 py-3 rounded-[10px] mb-4 text-sm">
                <strong>Não deu certo.</strong> {erroConfig}
              </div>
            )}
            <button type="submit" className="btn-primary" disabled={salvando}>
              {salvando ? "Salvando" : salvo ? "Configuração salva" : "Salvar configuração"}
            </button>
          </form>
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

          <div className="mb-8">
            <h2 className="section-title">Conversas recebidas</h2>
            <Conversas lista={conversas} onLimpar={limparConversa} />
          </div>

          {conectado ? (
            <div className="flex items-center gap-2.5 px-4 py-3.5 bg-accent-soft text-accent-ink rounded-[10px] font-semibold">Conectado ao número configurado.</div>
          ) : (
            <div>
              <h2 className="section-title">Conectar ao WhatsApp de verdade</h2>
              <ConectarWhatsApp url={webhookUrl} verifyToken={verifyToken} />
            </div>
          )}
        </Stage>
      </Workspace>
    </>
  );
}

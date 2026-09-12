"use client";

import { useEffect, useRef, useState } from "react";
import { Chat, type MensagemChat } from "@/components/Chat";
import { Quadro as QuadroBoard } from "@/components/Quadro";
import { DemoNotice, ErrorBox, Loading, Panel, Stage, Topbar, Workspace, useStatus } from "@/components/ui";
import type { HistoricoItem } from "@/lib/agente";
import type { Quadro } from "@/lib/quadro";

const MENSAGEM_BOAS_VINDAS =
  "Olá. Eu opero o quadro Kanban por você: crio, movo, comento e arquivo cartões a partir do que você me pedir em português. Experimente uma das sugestões abaixo ou descreva o que precisa.";

const EXEMPLO_COMPOSTO =
  "Crie um cartão para entrevistar a candidata Paula na quinta em A fazer e mova o onboarding do Pedro para concluído";

function novoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

type EstadoQuadro = { fase: "carregando" } | { fase: "erro"; mensagem: string } | { fase: "pronto"; quadro: Quadro; alterados: string[] };

export default function Page() {
  const { status, erro } = useStatus();
  const [mensagens, setMensagens] = useState<MensagemChat[]>([{ id: novoId(), papel: "assistente", texto: MENSAGEM_BOAS_VINDAS }]);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [valor, setValor] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [estadoQuadro, setEstadoQuadro] = useState<EstadoQuadro>({ fase: "carregando" });
  const autoEnviado = useRef(false);
  const primeiraCarga = useRef(true);

  async function carregarQuadro() {
    try {
      const r = await fetch("/api/quadro");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Não foi possível carregar o quadro agora.");
      setEstadoQuadro({ fase: "pronto", quadro: data as Quadro, alterados: [] });
    } catch (e) {
      setEstadoQuadro({ fase: "erro", mensagem: e instanceof Error ? e.message : "Não foi possível carregar o quadro agora." });
    }
  }

  useEffect(() => {
    const t = setTimeout(() => carregarQuadro(), 0);
    return () => clearTimeout(t);
  }, []);

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

  async function enviarMensagem(mensagem: string) {
    setMensagens((atual) => [...atual, { id: novoId(), papel: "usuario", texto: mensagem }]);
    const novoHistorico = [...historico, { role: "user" as const, content: mensagem }];
    setHistorico(novoHistorico);
    setValor("");
    setCarregando(true);
    try {
      const r = await fetch("/api/agente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem, historico: novoHistorico }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Não consegui processar esse comando.");
      const resposta = data.resposta || "Ação concluída.";
      setMensagens((atual) => [...atual, { id: novoId(), papel: "assistente", texto: resposta }]);
      setHistorico((h) => [...h, { role: "assistant", content: resposta }]);
      if (data.quadro) setEstadoQuadro({ fase: "pronto", quadro: data.quadro as Quadro, alterados: data.alterados || [] });
    } catch (e) {
      const mensagemErro = e instanceof Error ? e.message : "Não consegui processar esse comando.";
      setMensagens((atual) => [...atual, { id: novoId(), papel: "erro", texto: mensagemErro }]);
    } finally {
      setCarregando(false);
    }
  }

  // Atalho para demonstrações: /?exemplo=1 envia um comando composto que cria e move cartões.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      const t = setTimeout(() => enviarMensagem(EXEMPLO_COMPOSTO), 0);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  return (
    <>
      <Topbar marca="K" nome="Agente de Kanban" area="Gestão e RH" status={status} erro={erro} />
      <DemoNotice
        visivel={Boolean(status) && (!status?.ai || !status?.integrations?.trello)}
        resumo="Modo demonstração: sem IA, o agente interpreta comandos por palavras-chave; sem o Trello conectado, ele opera um quadro de exemplo em memória."
      />

      <Workspace>
        <Panel
          titulo="Fale com o quadro, não com o mouse."
          lead="Descreva em português o que precisa: criar, mover, comentar ou arquivar um cartão. O agente opera o quadro por você."
        >
          <Chat mensagens={mensagens} carregando={carregando} valor={valor} onValorChange={setValor} onEnviar={enviarMensagem} />
        </Panel>

        <Stage>
          {estadoQuadro.fase === "carregando" && <Loading texto="Carregando o quadro..." />}
          {estadoQuadro.fase === "erro" && <ErrorBox mensagem={estadoQuadro.mensagem} />}
          {estadoQuadro.fase === "pronto" && (
            <div className="reveal">
              <QuadroBoard quadro={estadoQuadro.quadro} alterados={estadoQuadro.alterados} />
            </div>
          )}
        </Stage>
      </Workspace>
    </>
  );
}

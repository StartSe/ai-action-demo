"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Chat, type MensagemChat } from "@/components/Chat";
import { Quadro as QuadroBoard } from "@/components/Quadro";
import { Empty, ErrorBox, Loading, MaisDetalhes, Origem, Panel, Privacidade, ResultHead, Stage, Topbar, Workspace, data, Entregar, useStatus } from "@/components/ui";
import type { HistoricoItem } from "@/lib/agente";
import type { Meta } from "@/lib/ai";
import type { Cartao, Quadro } from "@/lib/quadro";

const MENSAGEM_BOAS_VINDAS =
  "Olá. Eu opero o quadro Kanban por você: crio, movo, comento e arquivo cartões a partir do que você me pedir em português. Experimente uma das sugestões abaixo ou descreva o que precisa.";

const EXEMPLO_COMPOSTO =
  "Crie um cartão para entrevistar a candidata Paula na quinta em A fazer e mova o onboarding do Pedro para concluído";

const ETAPAS_CARREGANDO = ["Abrindo o quadro...", "Organizando as colunas...", "Quase pronto..."];

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

function novoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
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
  | { fase: "erro"; mensagem: string }
  | { fase: "pronto"; quadro: Quadro; alterados: string[]; meta: Meta; id?: string; resposta?: string; quadroDemo: boolean };

export default function Page() {
  const { status, erro } = useStatus();
  const [mensagens, setMensagens] = useState<MensagemChat[]>([{ id: novoId(), papel: "assistente", texto: MENSAGEM_BOAS_VINDAS }]);
  const [historicoConversa, setHistoricoConversa] = useState<HistoricoItem[]>([]);
  const [valor, setValor] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [estadoQuadro, setEstadoQuadro] = useState<EstadoQuadro>({ fase: "carregando" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [reiniciando, setReiniciando] = useState(false);
  const autoEnviado = useRef(false);
  const primeiraCarga = useRef(true);

  async function carregarQuadro() {
    try {
      const r = await fetch("/api/quadro");
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível carregar o quadro agora.");
      const { meta: metaGerada, quadroDemo, ...quadro } = resposta;
      setEstadoQuadro({ fase: "pronto", quadro: quadro as Quadro, alterados: [], meta: metaGerada, quadroDemo });
    } catch (e) {
      setEstadoQuadro({ fase: "erro", mensagem: e instanceof Error ? e.message : "Não foi possível carregar o quadro agora." });
    }
  }

  async function reiniciarQuadro() {
    if (!window.confirm("Reiniciar o quadro de exemplo? Os cartões voltam ao estado inicial.")) return;
    setReiniciando(true);
    try {
      const r = await fetch("/api/quadro/reiniciar", { method: "POST" });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível reiniciar o quadro agora.");
      const { meta: metaGerada, quadroDemo, ...quadro } = resposta;
      setEstadoQuadro({ fase: "pronto", quadro: quadro as Quadro, alterados: [], meta: metaGerada, quadroDemo });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Não foi possível reiniciar o quadro agora.");
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

  function apagarHistorico() {
    if (!window.confirm("Apagar todos os resultados salvos? Essa ação não pode ser desfeita.")) return;
    fetch("/api/agente", { method: "DELETE" }).then(() =>
      fetch("/api/agente").then((r) => r.json()).then((r) => setHistorico(r.itens)).catch(() => setHistorico([]))
    );
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

  async function enviarMensagem(mensagem: string) {
    setMensagens((atual) => [...atual, { id: novoId(), papel: "usuario", texto: mensagem }]);
    const novoHistorico = [...historicoConversa, { role: "user" as const, content: mensagem }];
    setHistoricoConversa(novoHistorico);
    setValor("");
    setCarregando(true);
    try {
      const r = await fetch("/api/agente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem, historico: novoHistorico }),
      });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não consegui processar esse comando.");
      const textoResposta = resposta.resposta || "Ação concluída.";
      setMensagens((atual) => [...atual, { id: novoId(), papel: "assistente", texto: textoResposta }]);
      setHistoricoConversa((h) => [...h, { role: "assistant", content: textoResposta }]);
      if (resposta.quadro) {
        setEstadoQuadro({ fase: "pronto", quadro: resposta.quadro as Quadro, alterados: resposta.alterados || [], meta: resposta.meta, id: resposta.id, resposta: textoResposta, quadroDemo: Boolean(resposta.quadroDemo) });
      }
      fetch("/api/agente").then((r2) => r2.json()).then((r2) => setHistorico(r2.itens)).catch(() => setHistorico([]));
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
      setTimeout(() => enviarMensagem(EXEMPLO_COMPOSTO), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  return (
    <>
      <Topbar
        marca="K"
        nome="Agente de Kanban"
        area="Gestão e RH"
        status={status}
        erro={erro}
        resumo="Modo demonstração: sem IA conectada, o agente segue por palavras-chave; sem o Trello conectado, ele opera um quadro de exemplo só seu, que você pode reiniciar quando quiser."
      />

      <Workspace>
        <Panel
          titulo="Fale com o quadro, não com o mouse."
          lead="Descreva em português o que precisa: criar, mover, atribuir, comentar ou arquivar um cartão. O agente opera o quadro por você."
        >
          <Chat mensagens={mensagens} carregando={carregando} valor={valor} onValorChange={setValor} onEnviar={enviarMensagem} />
          <Privacidade detalhe="As ações ficam salvas neste app até você apagar em 'Últimos resultados'." />

          {estadoQuadro.fase === "pronto" && estadoQuadro.quadroDemo && (
            <button type="button" className="btn-ghost mt-3.5" onClick={reiniciarQuadro} disabled={reiniciando}>
              {reiniciando ? "Reiniciando..." : "Reiniciar quadro de exemplo"}
            </button>
          )}

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
        </Panel>

        <Stage>
          {estadoQuadro.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estadoQuadro.fase === "erro" && <ErrorBox mensagem={estadoQuadro.mensagem} onTentarNovamente={carregarQuadro} />}
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
            <Resultado quadro={estadoQuadro.quadro} alterados={estadoQuadro.alterados} meta={estadoQuadro.meta} id={estadoQuadro.id} resposta={estadoQuadro.resposta} onAtribuir={atribuir} />
          )}
        </Stage>
      </Workspace>
    </>
  );
}

export function Resultado({
  quadro,
  alterados,
  meta,
  id,
  resposta,
  onAtribuir,
}: {
  quadro: Quadro;
  alterados: string[];
  meta: Meta;
  id?: string;
  resposta?: string;
  onAtribuir?: (cartao: Cartao) => void;
}) {
  return (
    <article className="reveal">
      <ResultHead titulo="Quadro atualizado">
        <Entregar id={id} titulo="Quadro atualizado" texto={() => quadroParaTexto(quadro, resposta)} />
      </ResultHead>

      <Origem meta={meta} />

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

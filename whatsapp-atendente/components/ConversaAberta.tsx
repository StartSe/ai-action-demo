"use client";
// Coluna do meio de Conversas: a conversa inteira, com o que a pessoa pode fazer nela — assumir,
// responder pelo número da empresa, devolver para a IA e marcar como resolvida.
//
// Quem manda no que aparece é sempre o servidor: toda ação devolve a conversa já atualizada
// (`aplicar`), e não existe um "otimismo" local que mostre um status que o banco não confirmou. A
// conversa também se recarrega sozinha a cada 10 s enquanto a aba está visível, que é o que faz a
// resposta de um cliente aparecer sem ninguém apertar nada.
//
// Cuidado ao mexer: nada aqui pode escrever o endereço do cartão do WhatsApp à mão — a ação do erro
// de envio vem pronta do servidor (`ErroWhatsApp.acao`), e `scripts/verificar-jargao.mjs` reprova o
// caminho literal em qualquer componente.
import { useCallback, useEffect, useRef, useState } from "react";
import { AcoesResposta, type AoSalvarBase } from "./Celular";
import { Avatar, DesenhoOrigem } from "./ContatoVisual";
import { Aviso, ErrorBox, lerErro, type ErroLido } from "./ui";
import { classeStatus, rotuloContato, rotuloNumero, rotuloStatus } from "@/lib/rotulos";
import type { ConversaCompleta, MensagemDaConversa } from "@/lib/types";

/** De quanto em quanto tempo a conversa aberta se atualiza (só com a aba visível). */
const INTERVALO_MS = 10_000;

/** Teto da altura do campo de escrever: ele cresce com o texto até aqui e depois passa a rolar. */
const ALTURA_MAXIMA_CAMPO = 132;

const FALHA_ENVIO = "Não foi possível enviar a mensagem pelo número da empresa. Tente de novo em alguns instantes.";

/** Hora da bolha: só o horário quando é de hoje, com o dia junto quando é mais antiga. */
function horaBolha(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (data.toDateString() === new Date().toDateString()) return hora;
  return `${data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora}`;
}

function assinaturaDe(c: ConversaCompleta): string {
  return `${c.status}|${c.atualizadoEm}|${c.mensagens.length}|${c.naoLidas}`;
}

function Bolha({
  mensagem,
  pergunta,
  rotulo,
  naoEntregue,
  corrigindo,
  onSalvarBase,
}: {
  mensagem: MensagemDaConversa;
  /** Pergunta do cliente logo antes desta resposta; sem ela não há par para aprovar. */
  pergunta?: string;
  rotulo?: string;
  naoEntregue: boolean;
  corrigindo: boolean;
  onSalvarBase: AoSalvarBase;
}) {
  const doCliente = mensagem.papel === "cliente";
  const fundo = doCliente
    ? "bg-white border border-line"
    : mensagem.papel === "humano"
      ? "bg-accent text-white"
      : "bg-accent-soft text-ink";
  return (
    <div className={`flex flex-col gap-1 max-w-[76%] max-md:max-w-[88%] ${doCliente ? "self-start items-start" : "self-end items-end"}`}>
      {rotulo && <span className="text-[11px] font-semibold text-muted px-1">{rotulo}</span>}
      <div
        className={`px-3.5 pt-2.5 pb-[20px] rounded-xl text-[14px] leading-snug relative break-words whitespace-pre-wrap ${fundo} ${naoEntregue ? "border border-danger" : ""}`}
      >
        {mensagem.texto}
        <span className={`absolute right-3 bottom-1 text-[10px] ${mensagem.papel === "humano" ? "text-white/75" : "text-muted"}`}>
          {horaBolha(mensagem.criadoEm)}
        </span>
      </div>
      {naoEntregue && <span className="text-[11px] font-semibold text-danger px-1">Esta mensagem não chegou ao cliente.</span>}
      {mensagem.ferramentaUsada && (
        <span className="text-[11px] text-muted px-1" title={`Ferramenta consultada: ${mensagem.ferramentaUsada}`}>
          Consultado em {mensagem.ferramentaUsada}
        </span>
      )}
      {pergunta && (
        <AcoesResposta
          pergunta={pergunta}
          resposta={mensagem.texto}
          onAprovar={onSalvarBase}
          onCorrigir={onSalvarBase}
          modoInicial={corrigindo ? "corrigindo" : "padrao"}
        />
      )}
    </div>
  );
}

export function ConversaAberta({
  numero,
  corrigirUltima,
  onVoltar,
  onMudou,
}: {
  numero: string;
  /** Chegou por um link "Corrigir" do relatório diário: a última resposta da IA já abre em edição. */
  corrigirUltima: boolean;
  onVoltar: () => void;
  /** A lista ao lado precisa saber que o status, a última mensagem ou as não lidas mudaram. */
  onMudou: () => void;
}) {
  const [conversa, setConversa] = useState<ConversaCompleta | null>(null);
  const [atendente, setAtendente] = useState("");
  const [erro, setErro] = useState<ErroLido | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [agindo, setAgindo] = useState(false);
  /** Ids das mensagens que foram gravadas mas não saíram pelo número da empresa. */
  const [naoEntregues, setNaoEntregues] = useState<number[]>([]);

  const corpoRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const assinaturaRef = useRef("");
  // A tela de fora é redesenhada a cada atualização da lista: guardar `onMudou` num ref (em vez de
  // nas dependências de `carregar`) é o que impede o temporizador de 10 s de reiniciar a cada render.
  const onMudouRef = useRef(onMudou);
  useEffect(() => {
    onMudouRef.current = onMudou;
  }, [onMudou]);

  const aplicar = useCallback((nova: ConversaCompleta) => {
    setConversa(nova);
    const assinatura = assinaturaDe(nova);
    if (assinaturaRef.current === assinatura) return;
    assinaturaRef.current = assinatura;
    onMudouRef.current();
  }, []);

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setConversa(null);
      try {
        const r = await fetch(`/api/conversas/${encodeURIComponent(numero)}`);
        if (!r.ok) throw r;
        const dados = await r.json();
        setAtendente(dados.atendente ?? "");
        aplicar(dados.conversa);
        setErro(null);
      } catch (e) {
        setErro(await lerErro(e));
      }
    },
    [numero, aplicar]
  );

  // Conversa nova na tela: tudo o que era da anterior (rascunho, erro, bolhas não entregues) sai junto.
  // A carga sai do corpo do efeito por um setTimeout(0), mesmo padrão de components/setup.tsx.
  useEffect(() => {
    assinaturaRef.current = "";
    const t = setTimeout(() => {
      setTexto("");
      setErro(null);
      setNaoEntregues([]);
      carregar();
    }, 0);
    return () => clearTimeout(t);
  }, [carregar]);

  // Recarga automática: só enquanto a aba está visível, para uma aba esquecida aberta não ficar
  // consultando o servidor a noite inteira.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") carregar(true);
    }, INTERVALO_MS);
    return () => clearInterval(t);
  }, [carregar]);

  // A conversa abre rolada até o fim (é onde está a mensagem que importa), e continua assim a cada
  // mensagem nova.
  const quantasMensagens = conversa?.mensagens.length ?? 0;
  useEffect(() => {
    const el = corpoRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [quantasMensagens, numero]);

  const salvarBase: AoSalvarBase = (pergunta, resposta) => {
    fetch("/api/base", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pergunta, resposta }) }).catch((e) =>
      console.error("Falha ao gravar a resposta na base", e)
    );
  };

  async function agir(acao: "assumir" | "devolver" | "resolver") {
    setAgindo(true);
    try {
      const r = await fetch(`/api/conversas/${encodeURIComponent(numero)}/${acao}`, { method: "POST" });
      if (!r.ok) throw r;
      const dados = await r.json();
      aplicar(dados.conversa);
      setErro(null);
      if (acao === "assumir") campoRef.current?.focus();
    } catch (e) {
      setErro(await lerErro(e));
    } finally {
      setAgindo(false);
    }
  }

  async function enviar() {
    const limpo = texto.trim();
    if (!limpo || enviando) return;
    setEnviando(true);
    try {
      const r = await fetch(`/api/conversas/${encodeURIComponent(numero)}/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: limpo }),
      });
      const dados = (await r.json().catch(() => ({}))) as {
        conversa?: ConversaCompleta;
        error?: string;
        codigo?: string;
        acao?: { rotulo: string; url: string };
        mensagemComErro?: number;
      };
      // A mensagem é gravada antes de sair pelo número: mesmo com falha de envio ela já está na
      // conversa, então o campo esvazia e o que ficou por entregar aparece marcado na bolha.
      if (dados.conversa) {
        aplicar(dados.conversa);
        setTexto("");
      }
      if (r.ok) {
        setErro(null);
      } else {
        setErro({ mensagem: dados.error ?? FALHA_ENVIO, codigo: dados.codigo, acao: dados.acao });
        if (typeof dados.mensagemComErro === "number") setNaoEntregues((antes) => [...antes, dados.mensagemComErro as number]);
      }
    } catch (e) {
      setErro(await lerErro(e));
    } finally {
      setEnviando(false);
    }
  }

  if (!conversa) {
    return (
      <div className="card p-5 min-h-[320px]" aria-busy="true">
        {erro ? <ErrorBox mensagem={erro.mensagem} acao={erro.acao} onTentarNovamente={() => carregar()} /> : <BolhasFalsas />}
      </div>
    );
  }

  const nome = rotuloContato(conversa.numero, conversa.nome);
  const numeroFormatado = rotuloNumero(conversa.numero);
  const emAtendimento = conversa.status === "humano";
  const precisaDeAtencao = conversa.status === "atencao";
  const idUltimaIA = [...conversa.mensagens].reverse().find((m) => m.papel === "atendente")?.id;

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
        <button type="button" className="btn-link shrink-0 min-[768px]:hidden" onClick={onVoltar}>
          Voltar
        </button>
        <Avatar nome={conversa.nome} tamanho={44} />
        <div className="min-w-0 flex-1">
          <p className="font-bold truncate flex items-center gap-1.5">
            {nome}
            <DesenhoOrigem origem={conversa.origem} />
          </p>
          <p className="text-[13px] text-muted flex items-center gap-2 flex-wrap">
            {numeroFormatado !== nome && <span>{numeroFormatado}</span>}
            <span className={classeStatus(conversa.status)}>{rotuloStatus(conversa.status)}</span>
          </p>
        </div>
        {/* Em atendimento humano o botão sairia do lugar: quem já assumiu tem, logo abaixo, "Devolver
            para a IA" e "Marcar como resolvida". Na faixa âmbar ele aparece dentro do próprio aviso. */}
        {!emAtendimento && !precisaDeAtencao && (
          <button type="button" className="btn-ghost !w-auto shrink-0 max-md:hidden" onClick={() => agir("assumir")} disabled={agindo}>
            Assumir atendimento
          </button>
        )}
      </div>

      {precisaDeAtencao && (
        <div className="px-4 pt-4">
          <Aviso acao={{ rotulo: "Assumir atendimento", onClick: () => agir("assumir") }}>
            <strong>Intervir na conversa</strong> · O atendente passou esta conversa para uma pessoa.
          </Aviso>
        </div>
      )}

      {!emAtendimento && !precisaDeAtencao && (
        <div className="px-4 pt-4 min-[768px]:hidden">
          <button type="button" className="btn-ghost" onClick={() => agir("assumir")} disabled={agindo}>
            Assumir atendimento
          </button>
        </div>
      )}

      <div
        ref={corpoRef}
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-bg max-h-[calc(100vh-360px)] min-h-[260px] max-md:max-h-[60vh]"
      >
        {conversa.mensagens.length === 0 ? (
          <p className="m-auto text-[13px] text-muted text-center">Nenhuma mensagem nesta conversa ainda.</p>
        ) : (
          conversa.mensagens.map((m, i) => {
            const anterior = conversa.mensagens[i - 1];
            const daIA = m.papel === "atendente";
            return (
              <Bolha
                key={m.id}
                mensagem={m}
                pergunta={daIA && anterior?.papel === "cliente" ? anterior.texto : undefined}
                rotulo={daIA ? `${atendente.trim() || "Seu atendente"} · Assistente de IA` : m.papel === "humano" ? "Você" : undefined}
                naoEntregue={naoEntregues.includes(m.id)}
                corrigindo={corrigirUltima && m.id === idUltimaIA}
                onSalvarBase={salvarBase}
              />
            );
          })
        )}
      </div>

      {erro && (
        <div className="px-4 pt-4">
          <ErrorBox mensagem={erro.mensagem} acao={erro.acao} />
        </div>
      )}

      <div className="border-t border-line p-3">
        <div className="flex items-end gap-2">
          <div className="relative flex-1 min-w-0">
            <textarea
              ref={campoRef}
              rows={1}
              className="input !py-2.5 text-[14px] resize-none min-h-[44px] leading-snug"
              value={emAtendimento ? texto : ""}
              disabled={!emAtendimento}
              aria-label={emAtendimento ? "Escreva a resposta" : "Assuma o atendimento para responder"}
              placeholder={emAtendimento ? "Escreva a resposta" : "Assuma o atendimento para responder"}
              onChange={(e) => {
                setTexto(e.target.value);
                const el = e.target;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, ALTURA_MAXIMA_CAMPO)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
            />
            {/* O texto de apoio de um campo vazio é desenhado aqui, e não só no `placeholder`: ele não
                aparece em toda captura de tela (ver CLAUDE.md), e é ele que explica por que o campo
                está desligado. */}
            {!emAtendimento && (
              <span
                aria-hidden="true"
                className="absolute left-3.5 right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted pointer-events-none whitespace-nowrap overflow-hidden text-ellipsis"
              >
                Assuma o atendimento para responder
              </span>
            )}
          </div>
          {/* Sem a conversa assumida não há o que enviar: o botão sai da linha em vez de ficar ali
              desligado — e é o que dá ao campo a largura inteira para caber a frase no celular. */}
          {emAtendimento && (
            <button type="button" className="btn-primary !w-auto shrink-0" onClick={enviar} disabled={enviando || !texto.trim()}>
              {enviando ? "Enviando..." : "Enviar"}
            </button>
          )}
        </div>
        {emAtendimento && (
          <div className="flex gap-4 flex-wrap mt-2.5 px-1">
            <button type="button" className="btn-link" onClick={() => agir("devolver")} disabled={agindo}>
              Devolver para a IA
            </button>
            <button type="button" className="btn-link" onClick={() => agir("resolver")} disabled={agindo}>
              Marcar como resolvida
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BolhasFalsas() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <span key={i} className={`skeleton h-10 ${i % 2 === 0 ? "w-3/5" : "w-2/5 self-end"}`} />
      ))}
    </div>
  );
}

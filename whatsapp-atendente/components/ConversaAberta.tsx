"use client";
// Coluna do meio de Conversas: a conversa inteira, com o que a pessoa pode fazer nela — assumir,
// responder pelo número da empresa, devolver para a IA e marcar como resolvida.
//
// Quem manda no que aparece é sempre o servidor: toda ação devolve a conversa já atualizada
// (`aplicar`), e não existe um "otimismo" local que mostre um status que o banco não confirmou. A
// conversa também se recarrega sozinha a cada 10 s enquanto a aba está visível, que é o que faz a
// resposta de um cliente aparecer sem ninguém apertar nada.
//
// A coluna da direita (o painel do contato, components/PainelContato.tsx) é desenhada daqui, e não
// pela tela de fora: ela mostra a MESMA conversa que já está neste estado e age por estas mesmas
// funções, então não há uma segunda consulta nem um segundo dono do que acontece com a conversa.
//
// Cuidado ao mexer: nada aqui pode escrever o endereço do cartão do WhatsApp à mão — a ação do erro
// de envio vem pronta do servidor (`ErroWhatsApp.acao`), e `scripts/verificar-jargao.mjs` reprova o
// caminho literal em qualquer componente.
import { useCallback, useEffect, useRef, useState } from "react";
import { AcoesResposta, type AoSalvarBase } from "./Celular";
import { Avatar, AvatarAtendente, DesenhoOrigem } from "./ContatoVisual";
import { ContatoRecolhido, PainelContato, type DadosDoContato } from "./PainelContato";
import { Aviso, ErrorBox, lerErro, useConfirmacao, type ErroLido } from "./ui";
import { classeStatus, rotuloContato, rotuloNumero, rotuloStatus } from "@/lib/rotulos";
import { rotuloMotivo } from "@/lib/transferencia";
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

/**
 * Marca de envio da bolha, ao lado da hora. Um tique só, e nunca os dois: o app sabe que a mensagem foi
 * aceita para envio pelo número da empresa, e NÃO sabe se ela chegou ao aparelho do cliente nem se foi
 * lida (nem a z-api nem a Meta avisam isso por aqui). Dois tiques azuis, como no WhatsApp, diriam algo
 * que ninguém conferiu. Quando o envio falha, quem conta a história é o aviso vermelho abaixo da bolha.
 */
function MarcaEnvio({ claro }: { claro: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={claro ? "text-white/75" : "text-muted"}
      role="img"
      aria-label="Enviada pelo número da empresa"
    >
      <path d="m5 13 4 4 10-10" />
    </svg>
  );
}

/**
 * Uma linha da linha do tempo ("Você assumiu a conversa", "Bia pediu ajuda de uma pessoa · A base não
 * tinha a informação"): centralizada e discreta, entre as bolhas, com a hora. Não é uma bolha porque
 * ninguém a escreveu para ninguém — ela conta o que aconteceu com a conversa.
 */
function LinhaEvento({ mensagem }: { mensagem: MensagemDaConversa }) {
  return (
    <p className="self-center max-w-[88%] text-center text-[11.5px] text-muted px-3 py-1 rounded-full bg-white/70 shadow-[0_1px_1px_rgba(20,20,50,0.06)]">
      {mensagem.texto}
      <span className="ml-1.5 text-[10.5px] text-muted/80 whitespace-nowrap">{horaBolha(mensagem.criadoEm)}</span>
    </p>
  );
}

function Bolha({
  mensagem,
  pergunta,
  autor,
  naoEntregue,
  corrigindo,
  onSalvarBase,
}: {
  mensagem: MensagemDaConversa;
  /** Pergunta do cliente logo antes desta resposta; sem ela não há par para aprovar. */
  pergunta?: string;
  /** Nome de quem escreveu, mostrado dentro da bolha (o atendente virtual ou a pessoa da equipe). */
  autor?: string;
  naoEntregue: boolean;
  corrigindo: boolean;
  onSalvarBase: AoSalvarBase;
}) {
  const doCliente = mensagem.papel === "cliente";
  const daIA = mensagem.papel === "atendente";
  const doHumano = mensagem.papel === "humano";
  // As três cores repetem a conversa que a pessoa já conhece do WhatsApp: a mensagem que chegou é
  // branca à esquerda, a que saiu é verde à direita. O verde escuro separa o que uma pessoa escreveu
  // do que a IA respondeu — as duas saem pelo mesmo número, e confundi-las é o erro caro aqui.
  const fundo = doCliente ? "bg-white" : doHumano ? "bg-accent text-white" : "bg-accent-soft text-ink";
  const rabicho = doCliente
    ? "rounded-tl-sm"
    : "rounded-tr-sm";
  return (
    <div className={`flex flex-col gap-1 max-w-[76%] max-md:max-w-[88%] ${doCliente ? "self-start items-start" : "self-end items-end"}`}>
      <div
        className={`px-3 pt-2 pb-[22px] rounded-xl ${rabicho} text-[14px] leading-snug relative break-words whitespace-pre-wrap shadow-[0_1px_1px_rgba(20,20,50,0.08)] ${fundo} ${naoEntregue ? "border border-danger" : ""}`}
      >
        {autor && (
          <span className={`flex items-center gap-1.5 mb-1 text-[11.5px] font-bold ${doHumano ? "text-white/85" : "text-accent-ink"}`}>
            {daIA && <AvatarAtendente tamanho={20} />}
            {autor}
            {daIA && <span className="font-semibold text-muted">Assistente de IA</span>}
          </span>
        )}
        {mensagem.texto}
        <span className={`absolute right-2.5 bottom-1 flex items-center gap-1 text-[10px] ${doHumano ? "text-white/75" : "text-muted"}`}>
          {horaBolha(mensagem.criadoEm)}
          {!doCliente && !naoEntregue && <MarcaEnvio claro={doHumano} />}
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
  // Como a pessoa quer escrever esta resposta: pedindo um rascunho à IA (e revisando antes de enviar) ou
  // do zero. A escolha é só da tela — quem envia é sempre a pessoa, pelos dois caminhos, e nada sai do
  // app sem ela clicar em "Enviar".
  const [modoResposta, setModoResposta] = useState<"ia" | "manual">("ia");
  const [sugerindo, setSugerindo] = useState(false);
  /** Acabou de clicar em "Assumir atendimento": o campo, que só existe com a conversa assumida, recebe o foco ao aparecer. */
  const focarAoAssumirRef = useRef(false);
  /** Ids das mensagens que foram gravadas mas não saíram pelo número da empresa. */
  const [naoEntregues, setNaoEntregues] = useState<number[]>([]);
  const { confirmar, Dialogo } = useConfirmacao();

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

  // O campo de resposta é montado só quando a conversa está em atendimento humano: o foco pedido pelo
  // "Assumir atendimento" precisa esperar essa montagem, e por isso mora aqui, não dentro de `agir`.
  const status = conversa?.status;
  useEffect(() => {
    if (!focarAoAssumirRef.current || status !== "humano") return;
    focarAoAssumirRef.current = false;
    campoRef.current?.focus();
  }, [status]);

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
      if (acao === "assumir") focarAoAssumirRef.current = true;
    } catch (e) {
      setErro(await lerErro(e));
    } finally {
      setAgindo(false);
    }
  }

  /**
   * Apagar é irreversível e só existe no painel do contato: pergunta antes, e depois volta para a
   * lista — a conversa que estava aberta não existe mais, e ficar nela mostraria um erro de "sumiu".
   */
  async function apagar() {
    if (!conversa) return;
    const deTeste = conversa.origem === "simulador";
    const ok = await confirmar(
      deTeste
        ? "Apagar esta conversa de teste? As mensagens somem para sempre."
        : "Apagar esta conversa? As mensagens somem para sempre, para você e para o histórico do atendimento.",
      { confirmarRotulo: "Apagar" }
    );
    if (!ok) return;
    setAgindo(true);
    try {
      const r = await fetch(`/api/conversas/${encodeURIComponent(numero)}`, { method: "DELETE" });
      if (!r.ok) throw r;
      onMudouRef.current();
      onVoltar();
    } catch (e) {
      setErro(await lerErro(e));
    } finally {
      setAgindo(false);
    }
  }

  /** "Responder como IA": traz um rascunho para o campo. Ele NÃO é enviado — a pessoa lê, ajusta e envia. */
  async function pedirSugestao() {
    if (sugerindo) return;
    setSugerindo(true);
    try {
      const r = await fetch(`/api/conversas/${encodeURIComponent(numero)}/sugerir`, { method: "POST" });
      if (!r.ok) throw r;
      const { sugestao } = (await r.json()) as { sugestao?: string };
      if (sugestao) {
        setTexto(sugestao);
        setErro(null);
        campoRef.current?.focus();
      }
    } catch (e) {
      setErro(await lerErro(e));
    } finally {
      setSugerindo(false);
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
  const nomeAtendente = atendente.trim() || "O atendente";
  // Só as mensagens de verdade formam pares pergunta/resposta: um evento entre a pergunta e a resposta
  // (ou logo antes de uma pergunta) não pode quebrar o "Aprovar"/"Corrigir" da resposta.
  const soConversa = conversa.mensagens.filter((m) => m.papel !== "evento" && m.papel !== "nota");
  const dadosDoContato: DadosDoContato = { conversa, agindo, onResolver: () => agir("resolver"), onApagar: apagar };

  return (
    // A partir de 1100 px a conversa e o painel do contato dividem esta caixa em duas colunas; abaixo
    // disso ela deixa de ser grade e o painel, já recolhido, vira o primeiro bloco da pilha — quem
    // está no celular vê quem é o contato antes de rolar as bolhas.
    <div className="min-[1100px]:grid min-[1100px]:grid-cols-[minmax(0,1fr)_300px] min-[1100px]:gap-5 min-[1100px]:items-start">
      <div className="min-[1100px]:hidden">
        <ContatoRecolhido {...dadosDoContato} />
      </div>

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
          {/* "Assumir atendimento" não fica aqui: ele mora no rodapé, no lugar do campo de resposta, que é
              onde a pessoa procura quando quer escrever (e na faixa âmbar, dentro do próprio aviso). */}
        </div>

        {precisaDeAtencao && (
          <div className="px-4 pt-4">
            <Aviso acao={{ rotulo: "Assumir atendimento", onClick: () => agir("assumir") }}>
              <strong>Intervir na conversa</strong> · {nomeAtendente} passou esta conversa para uma pessoa
              {conversa.motivoTransferencia && <> · {rotuloMotivo(conversa.motivoTransferencia)}</>}.
            </Aviso>
          </div>
        )}

        <div
          ref={corpoRef}
          className="fundo-conversa flex-1 overflow-y-auto p-4 flex flex-col gap-3 max-h-[calc(100vh-360px)] min-h-[260px] max-md:max-h-[60vh]"
        >
          {conversa.mensagens.length === 0 ? (
            <p className="m-auto text-[13px] text-muted text-center">Nenhuma mensagem nesta conversa ainda.</p>
          ) : (
            conversa.mensagens.map((m) => {
              if (m.papel === "evento") return <LinhaEvento key={m.id} mensagem={m} />;
              const anterior = soConversa[soConversa.indexOf(m) - 1];
              const daIA = m.papel === "atendente";
              return (
                <Bolha
                  key={m.id}
                  mensagem={m}
                  pergunta={daIA && anterior?.papel === "cliente" ? anterior.texto : undefined}
                  autor={daIA ? atendente.trim() || "Seu atendente" : m.papel === "humano" ? "Você" : undefined}
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
          {!emAtendimento ? (
            /* Enquanto a IA cuida da conversa não há o que digitar: em vez de abas e um campo desligados
               (que pareciam um jeito de responder que "não funcionava"), o rodapé diz o que falta e
               oferece o próprio botão de assumir, no lugar em que a pessoa procura para escrever. */
            <div className="flex items-center gap-3 flex-wrap">
              <p className="flex-1 min-w-[200px] text-[13px] text-muted">
                {precisaDeAtencao
                  ? `${nomeAtendente} passou esta conversa para uma pessoa. Assuma o atendimento para responder.`
                  : "O atendente virtual está cuidando desta conversa. Assuma o atendimento para responder você mesmo, com ou sem a ajuda da IA."}
              </p>
              <button type="button" className="btn-primary !w-auto shrink-0" onClick={() => agir("assumir")} disabled={agindo}>
                {agindo ? "Assumindo..." : "Assumir atendimento"}
              </button>
            </div>
          ) : (
            <>
              {/* As duas abas escolhem só COMO a resposta é escrita (rascunho da IA ou do zero); quem envia é
                  sempre a pessoa. Elas só existem com a conversa assumida, junto com o campo. */}
              <div className="flex gap-1 mb-2.5" role="tablist" aria-label="Como responder">
                {([["ia", "Responder como IA"], ["manual", "Responder manualmente"]] as const).map(([valor, rotulo]) => (
                  <button
                    key={valor}
                    type="button"
                    role="tab"
                    aria-selected={modoResposta === valor}
                    className={`px-3 py-1.5 rounded-field text-[13px] font-semibold transition-colors ${
                      modoResposta === valor ? "bg-accent-soft text-accent-ink" : "text-muted hover:bg-bg"
                    }`}
                    onClick={() => setModoResposta(valor)}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>

              {modoResposta === "ia" && (
                <div className="flex items-center gap-3 flex-wrap mb-2.5">
                  <button type="button" className="btn-ghost !w-auto !py-2 !text-[13px]" onClick={pedirSugestao} disabled={sugerindo}>
                    {sugerindo ? "Escrevendo..." : "Escrever com a IA"}
                  </button>
                  <span className="text-[12.5px] text-muted">O rascunho aparece no campo abaixo. Nada é enviado antes de você conferir.</span>
                </div>
              )}

              <div className="flex items-end gap-2">
                <textarea
                  ref={campoRef}
                  rows={1}
                  className="input !py-2.5 text-[14px] resize-none min-h-[44px] leading-snug flex-1 min-w-0"
                  value={texto}
                  aria-label="Escreva a resposta"
                  placeholder="Escreva a resposta"
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
                <button type="button" className="btn-primary !w-auto shrink-0" onClick={enviar} disabled={enviando || !texto.trim()}>
                  {enviando ? "Enviando..." : "Enviar"}
                </button>
              </div>
              <div className="flex gap-4 flex-wrap mt-2.5 px-1">
                <button type="button" className="btn-link" onClick={() => agir("devolver")} disabled={agindo}>
                  Devolver para a IA
                </button>
                <button type="button" className="btn-link" onClick={() => agir("resolver")} disabled={agindo}>
                  Marcar como resolvida
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="max-[1099px]:hidden">
        <PainelContato {...dadosDoContato} />
      </div>

      {Dialogo}
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

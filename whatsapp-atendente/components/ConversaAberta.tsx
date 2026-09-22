"use client";
// Coluna do meio de Conversas: a conversa inteira, com o que a pessoa pode fazer nela — assumir,
// responder pelo número da empresa, devolver para a IA e marcar como resolvida.
//
// Quem manda no que aparece é sempre o servidor: toda ação devolve a conversa já atualizada
// (`aplicar`), e não existe um "otimismo" local que mostre um status que o banco não confirmou. A
// A conversa se atualiza sozinha: o servidor avisa quando algo muda nela (components/useEventos.ts) e
// ela recarrega na hora. Sem o fluxo de avisos de pé, ela volta a consultar de tempos em tempos.
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
import { PorQueRespondeu } from "./PorQueRespondeu";
import { INTERVALO_RESERVA_MS, useEventos, useRecargaJunta, type EventoDaTela } from "./useEventos";
import { Avatar, AvatarAtendente, DesenhoOrigem } from "./ContatoVisual";
import { ContatoRecolhido, PainelContato, type DadosDoContato } from "./PainelContato";
import { Aviso, ErrorBox, lerErro, useConfirmacao, type ErroLido } from "./ui";
import { classeStatus, rotuloContato, rotuloNumero, rotuloStatus } from "@/lib/rotulos";
import { formatarTelefone } from "@/lib/telefone";
import { rotuloMotivo } from "@/lib/transferencia";
import type { Anexo, ConversaCompleta, MensagemDaConversa, StatusEntrega } from "@/lib/types";

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

/** O que cada estado de entrega mostra ao lado da hora (a frase vai para o leitor de tela e o `title`). */
const ROTULO_ENTREGA: Record<StatusEntrega, string> = {
  enviando: "Enviando",
  enviada: "Enviada pelo número da empresa",
  entregue: "Entregue ao cliente",
  lida: "Lida pelo cliente",
  falhou: "Não chegou ao cliente",
};

/**
 * Marca de envio da bolha, ao lado da hora, como no WhatsApp: relógio enquanto o envio ainda não foi
 * confirmado, um tique quando o provedor aceitou, dois tiques cinza quando chegou ao aparelho e dois
 * tiques no acento quando o cliente leu. A marca só diz o que o app CONFERIU: os dois tiques vêm do
 * aviso de status da z-api (app/webhook/zapi/route.ts), e uma mensagem sem status (anterior à 0.3.0,
 * enviada pela Meta, ou de uma conversa de teste) fica com um tique — ninguém sabe se ela chegou.
 * Quando o envio falha, quem conta a história é o aviso vermelho abaixo da bolha, não a marca.
 */
function MarcaEnvio({ status, claro }: { status: StatusEntrega | undefined; claro: boolean }) {
  const efetivo: Exclude<StatusEntrega, "falhou"> = !status || status === "falhou" ? "enviada" : status;
  const rotulo = ROTULO_ENTREGA[efetivo];
  const base = claro ? "text-white/75" : "text-muted";
  const cor = efetivo === "lida" ? (claro ? "text-accent-2" : "text-accent") : base;
  const comum = {
    width: 15,
    height: 14,
    viewBox: "0 0 26 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    role: "img",
    "aria-label": rotulo,
  };
  if (efetivo === "enviando") {
    return (
      <svg {...comum} className={base} data-entrega="enviando">
        <title>{rotulo}</title>
        <circle cx="13" cy="12" r="8.5" />
        <path d="M13 7.5V12l3 2" />
      </svg>
    );
  }
  if (efetivo === "enviada") {
    return (
      <svg {...comum} className={base} data-entrega="enviada">
        <title>{rotulo}</title>
        <path d="m6 13 4 4 10-10" />
      </svg>
    );
  }
  return (
    <svg {...comum} className={cor} data-entrega={efetivo}>
      <title>{rotulo}</title>
      <path d="m2 13 4 4 9-9" />
      <path d="m11 15.5 1.5 1.5 10-10" />
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

/** Duração de um áudio ou vídeo como o WhatsApp mostra: "0:07", "1:42". */
function duracao(segundos: number): string {
  return `${Math.floor(segundos / 60)}:${String(Math.round(segundos) % 60).padStart(2, "0")}`;
}

/** Moldura dos anexos que são um cartão (arquivo, localização, contato) e não uma mídia para tocar. */
function CartaoAnexo({ icone, titulo, apoio, acao }: { icone: string; titulo: string; apoio?: string; acao?: { rotulo: string; href: string } }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-black/5 px-2.5 py-2 min-w-[190px] max-w-full">
      <span aria-hidden="true" className="text-[20px] leading-none">
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-[13px] break-words">{titulo}</span>
        {apoio && <span className="block text-[11.5px] text-muted">{apoio}</span>}
      </span>
      {acao && (
        <a className="text-[12px] font-semibold text-accent-ink underline underline-offset-2 shrink-0" href={acao.href} target="_blank" rel="noreferrer">
          {acao.rotulo}
        </a>
      )}
    </div>
  );
}

/**
 * Quantos caracteres cabem, com folga, nas duas linhas que a bolha mostra: acima disso ela oferece
 * "ver mais". É uma estimativa e não uma medição — medir exigiria um efeito por bolha, e o preço de
 * errar é só um "ver mais" que abre um texto que já estava inteiro na tela.
 */
const CURTO = 130;

/**
 * O que o atendente entendeu deste anexo (lib/midia.ts): a transcrição do áudio e a descrição da foto.
 * Fica abaixo da mídia, em texto pequeno, porque é isso que a IA leu para responder — quem confere uma
 * resposta estranha precisa ver o que ela ouviu. Acima de duas linhas, começa recolhido.
 */
function TextoEntendido({ rotulo, texto }: { rotulo: string; texto: string }) {
  const [aberto, setAberto] = useState(false);
  const longo = texto.length > CURTO;
  return (
    <span className="block text-[11.5px] leading-snug text-muted">
      <span className={aberto || !longo ? "" : "line-clamp-2"}>
        <span className="font-semibold">{rotulo}</span> {texto}
      </span>
      {longo && (
        <button type="button" className="font-semibold text-accent-ink underline underline-offset-2" onClick={() => setAberto((v) => !v)}>
          {aberto ? "ver menos" : "ver mais"}
        </button>
      )}
    </span>
  );
}

/** Como cada tipo apresenta o que o atendente entendeu; os demais tipos não mostram nada. */
const ROTULO_ENTENDIDO: Partial<Record<Anexo["tipo"], string>> = {
  audio: "Transcrição:",
  imagem: "O atendente viu:",
};

/**
 * O que o cliente mandou quando não foi texto. A imagem e a figurinha usam `<img>` de propósito (e não
 * o componente de imagem do Next): o arquivo vem de uma rota privada deste app, com tamanho que só se
 * conhece na hora, e não passa por otimização. Áudio e vídeo carregam só quando alguém aperta o play —
 * uma conversa longa não pode baixar dez arquivos de uma vez.
 */
function AnexoNaBolha({ anexo }: { anexo: Anexo }) {
  const rotulo = ROTULO_ENTENDIDO[anexo.tipo];
  if (!anexo.transcricao || !rotulo) return <MidiaDoAnexo anexo={anexo} />;
  return (
    <span className="flex flex-col gap-1">
      <MidiaDoAnexo anexo={anexo} />
      <TextoEntendido rotulo={rotulo} texto={anexo.transcricao} />
    </span>
  );
}

function MidiaDoAnexo({ anexo }: { anexo: Anexo }) {
  if (anexo.tipo === "audio") {
    return (
      <span className="flex items-center gap-2">
        <audio controls preload="none" src={anexo.url} className="h-9 w-[240px] max-w-full max-md:w-[200px]" />
        {anexo.segundos ? <span className="text-[11px] text-muted shrink-0">{duracao(anexo.segundos)}</span> : null}
      </span>
    );
  }
  if (anexo.tipo === "imagem") {
    return (
      <a href={anexo.url} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={anexo.url} alt={anexo.legenda || "Foto enviada pelo cliente"} className="rounded-lg max-w-[260px] w-full h-auto" />
      </a>
    );
  }
  if (anexo.tipo === "video") {
    return <video controls preload="none" src={anexo.url} className="rounded-lg max-w-[260px] w-full h-auto" />;
  }
  if (anexo.tipo === "figurinha") {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={anexo.url} alt="Figurinha enviada pelo cliente" className="w-24 h-24 object-contain" />
    );
  }
  if (anexo.tipo === "documento") {
    return <CartaoAnexo icone="📄" titulo={anexo.nomeArquivo || "Arquivo"} apoio={anexo.legenda} acao={{ rotulo: "Abrir", href: anexo.url }} />;
  }
  if (anexo.tipo === "localizacao") {
    return (
      <CartaoAnexo
        icone="📍"
        titulo={anexo.nomeArquivo || "Localização"}
        apoio={anexo.legenda}
        acao={anexo.url ? { rotulo: "Ver no mapa", href: anexo.url } : undefined}
      />
    );
  }
  if (anexo.tipo === "contato") {
    return <CartaoAnexo icone="👤" titulo={anexo.nomeArquivo || "Contato"} apoio={anexo.legenda ? formatarTelefone(anexo.legenda) : undefined} />;
  }
  return <CartaoAnexo icone="📎" titulo="Este tipo de mensagem ainda não aparece aqui" apoio="Abra a conversa no celular da empresa para ver." />;
}

function Bolha({
  mensagem,
  pergunta,
  autor,
  reenviando,
  corrigindo,
  onSalvarBase,
  onReenviar,
}: {
  mensagem: MensagemDaConversa;
  /** Pergunta do cliente logo antes desta resposta; sem ela não há par para aprovar. */
  pergunta?: string;
  /** Nome de quem escreveu, mostrado dentro da bolha (o atendente virtual ou a pessoa da equipe). */
  autor?: string;
  /** "Tentar de novo" desta bolha está em andamento. */
  reenviando: boolean;
  corrigindo: boolean;
  onSalvarBase: AoSalvarBase;
  /** "Tentar de novo" de uma mensagem que não chegou ao cliente (só existe em conversa do WhatsApp). */
  onReenviar?: (mensagemId: number) => void;
}) {
  const doCliente = mensagem.papel === "cliente";
  const daIA = mensagem.papel === "atendente";
  const doHumano = mensagem.papel === "humano";
  // A marcação de "não chegou" vem do banco (`statusEntrega`), não de um estado da tela: recarregar a
  // página ou abrir em outro aparelho mostra a mesma bolha vermelha, e "Tentar de novo" parte dela.
  const naoEntregue = !doCliente && mensagem.statusEntrega === "falhou";
  const anexos = mensagem.anexos ?? [];
  // O texto entre colchetes ("[Áudio de 12 s]") existe para as listas e para a IA; quando o anexo em si
  // está desenhado, repeti-lo só polui a bolha. A legenda escrita pelo cliente, essa continua.
  const soAnexo = anexos.length > 0 && /^\[[^\]]*\]$/.test(mensagem.texto.trim());
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
        {anexos.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-1">
            {anexos.map((a) => (
              <AnexoNaBolha key={a.id} anexo={a} />
            ))}
          </div>
        )}
        {!soAnexo && mensagem.texto}
        <span className={`absolute right-2.5 bottom-1 flex items-center gap-1 text-[10px] ${doHumano ? "text-white/75" : "text-muted"}`}>
          {horaBolha(mensagem.criadoEm)}
          {!doCliente && !naoEntregue && <MarcaEnvio status={mensagem.statusEntrega} claro={doHumano} />}
        </span>
      </div>
      {naoEntregue && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
          <span className="text-[11px] font-semibold text-danger">Esta mensagem não chegou ao cliente.</span>
          {mensagem.erroEnvio && <span className="text-[11px] text-muted">{mensagem.erroEnvio}</span>}
          {onReenviar && (
            <button
              type="button"
              className="text-[11px] font-semibold text-accent-ink underline underline-offset-2 disabled:opacity-60"
              onClick={() => onReenviar(mensagem.id)}
              disabled={reenviando}
            >
              {reenviando ? "Enviando de novo…" : "Tentar de novo"}
            </button>
          )}
        </div>
      )}
      {/* Como a resposta foi montada. Respostas gravadas antes da 0.3.0 não têm os detalhes: delas
          sobrou só o nome da ferramenta consultada, e é melhor mostrá-lo do que esconder a única
          pista que existe. */}
      {daIA && mensagem.detalhes && <PorQueRespondeu detalhes={mensagem.detalhes} />}
      {daIA && !mensagem.detalhes && mensagem.ferramentaUsada && (
        <span className="text-[11px] text-muted px-1">Consultou {mensagem.ferramentaUsada} para responder</span>
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
  /** Id da mensagem cujo "Tentar de novo" está em andamento; null quando nenhum. */
  const [reenviandoId, setReenviandoId] = useState<number | null>(null);
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

  // Conversa nova na tela: tudo o que era da anterior (rascunho, erro) sai junto. A carga sai do corpo
  // do efeito por um setTimeout(0), mesmo padrão de components/setup.tsx.
  useEffect(() => {
    assinaturaRef.current = "";
    const t = setTimeout(() => {
      setTexto("");
      setErro(null);
      carregar();
    }, 0);
    return () => clearTimeout(t);
  }, [carregar]);

  // Tempo real: o servidor avisa que ESTA conversa mudou (mensagem nova, entrega, status) e ela
  // recarrega em silêncio — sem piscar, porque `carregar(true)` não apaga o que já está na tela.
  const recarregar = useRecargaJunta(useCallback(() => carregar(true), [carregar]));
  const aoEvento = useCallback(
    (evento: EventoDaTela) => {
      if (evento.tipo === "conexao" || evento.numero !== numero) return;
      recarregar();
    },
    [numero, recarregar]
  );
  const { reserva } = useEventos(aoEvento);

  // Reserva: sem o fluxo de avisos (proxy que corta, servidor reiniciando), a conversa volta a
  // consultar sozinha, só enquanto a aba está visível — uma aba esquecida aberta não deve consultar
  // o servidor a noite inteira.
  useEffect(() => {
    if (!reserva) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") carregar(true);
    }, INTERVALO_RESERVA_MS);
    return () => clearInterval(t);
  }, [reserva, carregar]);

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
      };
      // A mensagem é gravada antes de sair pelo número: mesmo com falha de envio ela já está na
      // conversa (marcada como `falhou` no banco), então o campo esvazia e a bolha vermelha aparece.
      if (dados.conversa) {
        aplicar(dados.conversa);
        setTexto("");
      }
      if (r.ok) setErro(null);
      else setErro({ mensagem: dados.error ?? FALHA_ENVIO, codigo: dados.codigo, acao: dados.acao });
    } catch (e) {
      setErro(await lerErro(e));
    } finally {
      setEnviando(false);
    }
  }

  /** "Tentar de novo" de uma bolha que não chegou: o mesmo texto sai de novo e a MESMA bolha muda de estado. */
  /**
   * Corrigir o que o atendente lembra deste cliente (o bloco do painel do contato). A rota grava como
   * escrito por uma PESSOA — a IA para de reescrever por sete dias — e devolve a conversa já atualizada,
   * como todas as outras ações desta tela.
   */
  async function salvarMemoria(memoria: string) {
    try {
      const r = await fetch(`/api/conversas/${encodeURIComponent(numero)}/contato`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoria }),
      });
      if (!r.ok) throw r;
      const dados = await r.json();
      aplicar(dados.conversa);
      setErro(null);
    } catch (e) {
      setErro(await lerErro(e));
    }
  }

  /** "Apagar memória": o atendente esquece este cliente, mas a conversa continua onde está. */
  async function apagarMemoria() {
    const ok = await confirmar("Apagar o que o atendente lembra deste cliente? As mensagens da conversa continuam aqui.", { confirmarRotulo: "Apagar" });
    if (!ok) return;
    setAgindo(true);
    try {
      const r = await fetch(`/api/conversas/${encodeURIComponent(numero)}/contato`, { method: "DELETE" });
      if (!r.ok) throw r;
      const dados = await r.json();
      aplicar(dados.conversa);
      setErro(null);
    } catch (e) {
      setErro(await lerErro(e));
    } finally {
      setAgindo(false);
    }
  }

  async function reenviar(mensagemId: number) {
    if (reenviandoId !== null) return;
    setReenviandoId(mensagemId);
    try {
      const r = await fetch(`/api/conversas/${encodeURIComponent(numero)}/mensagens/${mensagemId}/reenviar`, { method: "POST" });
      const dados = (await r.json().catch(() => ({}))) as {
        conversa?: ConversaCompleta;
        error?: string;
        codigo?: string;
        acao?: { rotulo: string; url: string };
      };
      if (dados.conversa) aplicar(dados.conversa);
      if (r.ok) setErro(null);
      else setErro({ mensagem: dados.error ?? FALHA_ENVIO, codigo: dados.codigo, acao: dados.acao });
    } catch (e) {
      setErro(await lerErro(e));
    } finally {
      setReenviandoId(null);
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
  const dadosDoContato: DadosDoContato = {
    conversa,
    agindo,
    onResolver: () => agir("resolver"),
    onApagar: apagar,
    onSalvarMemoria: salvarMemoria,
    onApagarMemoria: apagarMemoria,
  };

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
                  reenviando={reenviandoId === m.id}
                  corrigindo={corrigirUltima && m.id === idUltimaIA}
                  onSalvarBase={salvarBase}
                  onReenviar={conversa.origem === "whatsapp" ? reenviar : undefined}
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

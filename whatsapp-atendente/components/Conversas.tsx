"use client";
// Tela de Conversas: a lista de tudo o que chegou, com abas por status, período e busca. O que a pessoa
// escolhe mora na barra de endereço (`?aba=&periodo=&q=&numero=`), então recarregar, voltar no navegador
// ou mandar o endereço para alguém cai na mesma lista — e é por `?numero=` que os links "Aprovar"/
// "Corrigir" do relatório diário chegam aqui.
//
// O conteúdo fica neste componente, e não em `app/conversas/page.tsx`, porque `scripts/verificar-jargao.mjs`
// varre `components/*.tsx` mas não as telas em `app/<rota>/page.tsx` (ver CLAUDE.md).
//
// A coluna do meio é a conversa aberta (`components/ConversaAberta.tsx`, US-013), que traz junto o
// painel do contato da US-014: a grade daqui tem duas colunas (lista e conversa), e é a conversa
// aberta que se divide em duas a partir de 1100 px. O painel mostra a mesma conversa que ela já
// carregou, então esta tela não consulta nada a mais para desenhá-lo.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AvisoConversasExemplo } from "./AvisoExemplo";
import { ConversaAberta } from "./ConversaAberta";
import { Avatar, DesenhoOrigem } from "./ContatoVisual";
import { ChipsEtiqueta, useFiltroEtiquetas } from "./Etiquetas";
import { useSomDeAviso } from "./SomDeAviso";
import { Empty, ErrorBox, IlustracaoConversa, Topbar, lerErro, useStatus, type ErroLido } from "./ui";
import { useEspera } from "./useEspera";
import { INTERVALO_RESERVA_MS, useEventos, useRecargaJunta, type EventoDaTela } from "./useEventos";
import { soConversasDeExemplo } from "@/lib/demo";
import { passouDoLimite, textoEspera } from "@/lib/espera";
import { PERIODOS, PERIODO_PADRAO, classeStatus, horaOuDia, lerPeriodo, previaMensagem, rotuloContato, rotuloPeriodo, rotuloStatus } from "@/lib/rotulos";
import type { Conversa, Etiqueta, Periodo } from "@/lib/types";

/** As três abas da lista; "todas" não filtra nada, as outras duas valem um status da conversa. */
type Aba = "todas" | "humano" | "atencao";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "humano", rotulo: "Em atendimento" },
  { id: "atencao", rotulo: "Precisa de atenção" },
];

type Contadores = { todas: number; humano: number; atencao: number };

const SEM_CONVERSAS: Contadores = { todas: 0, humano: 0, atencao: 0 };

function lerAba(valor: string | null): Aba {
  return ABAS.some((a) => a.id === valor) ? (valor as Aba) : "todas";
}

function LinhaConversa({
  conversa,
  selecionada,
  etiquetasDaEmpresa,
  limiteMin,
  onEscolher,
}: {
  conversa: Conversa;
  selecionada: boolean;
  etiquetasDaEmpresa: Etiqueta[];
  limiteMin: number;
  onEscolher: () => void;
}) {
  const primeiraLinha = previaMensagem(conversa.ultima_mensagem || "").split("\n")[0];
  // Quem está esperando uma pessoa mostra há quanto tempo, no lugar da hora da última mensagem: a hora
  // não responde a pergunta que importa nesta lista, que é "faz muito tempo?".
  const espera = textoEspera(conversa.status, conversa.nao_lidas, conversa.esperandoDesde);
  const atrasada = espera !== null && passouDoLimite(conversa.esperandoDesde, limiteMin);
  return (
    <li>
      <button
        type="button"
        onClick={onEscolher}
        aria-current={selecionada ? "true" : undefined}
        className={`w-full text-left flex items-start gap-3 px-4 py-3.5 border-b border-line cursor-pointer transition-colors border-l-[3px] ${atrasada ? "border-l-danger" : "border-l-transparent"} ${selecionada ? "bg-accent-soft" : "hover:bg-bg"}`}
      >
        <Avatar nome={conversa.nome} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <strong className="min-w-0 flex-1 truncate text-[14.5px]">{rotuloContato(conversa.numero, conversa.nome)}</strong>
            <span className={`shrink-0 text-[12px] ${atrasada ? "text-danger font-bold" : "text-muted"}`}>
              {espera ?? horaOuDia(conversa.atualizado_em)}
            </span>
          </span>
          <span className="block truncate text-[13px] text-ink-2 mt-0.5">{primeiraLinha || "Sem mensagem ainda"}</span>
          <span className="flex items-center gap-2 mt-1.5">
            <span className={classeStatus(conversa.status)}>{rotuloStatus(conversa.status)}</span>
            {conversa.exemplo ? <span className="chip-cinza">Exemplo</span> : <DesenhoOrigem origem={conversa.origem} />}
            {conversa.temNotas && (
              /* A conversa tem anotação da equipe: quem abre a lista vê onde há contexto escrito sem
                 precisar entrar em cada conversa. O cliente nunca viu nada disso. */
              <span className="shrink-0 text-[13px] leading-none" title="Esta conversa tem nota interna" aria-label="Esta conversa tem nota interna" role="img">
                📝
              </span>
            )}
            {conversa.nao_lidas > 0 && (
              <span className="ml-auto shrink-0 inline-grid place-items-center min-w-[20px] h-5 px-1.5 rounded-full bg-accent text-white text-[11px] font-bold leading-none">
                {conversa.nao_lidas}
              </span>
            )}
          </span>
          {/* As etiquetas ficam numa linha própria: na de cima já estão o status, a origem e a marca de
              nota, e um quarto grupo de chips ali deixaria de ser lido. */}
          {conversa.etiquetas.length > 0 && (
            <span className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <ChipsEtiqueta nomes={conversa.etiquetas} daEmpresa={etiquetasDaEmpresa} />
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function LinhasFalsas() {
  return (
    <ul aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-4 border-b border-line">
          <span className="shrink-0 w-10 h-10 rounded-full bg-[#e9ebf0]" />
          <span className="flex-1 min-w-0 flex flex-col gap-2 pt-1">
            <span className="skeleton w-1/2" />
            <span className="skeleton w-4/5" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Rodapé da lista: diz de onde vem o que está na tela. Com o fluxo de avisos de pé, uma mensagem nova
 * aparece no instante em que chega; sem ele, a lista volta a consultar de tempos em tempos.
 */
function ComoAtualiza({ aoVivo }: { aoVivo: boolean }) {
  return (
    <p className="flex items-center gap-2 px-4 py-2.5 border-t border-line text-[12px] text-muted">
      <span aria-hidden="true" className={`w-2 h-2 rounded-full ${aoVivo ? "bg-ok" : "bg-[#b9bfcc]"}`} />
      {aoVivo ? "Atualizando em tempo real" : "Atualizando a cada 30 segundos"}
    </p>
  );
}

/** O que ocupa a coluna do meio enquanto ninguém escolheu uma conversa na lista. */
function SemConversa() {
  return (
    <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center text-muted p-8 border border-dashed border-line rounded-card">
      <p className="text-ink font-bold mb-1">Escolha uma conversa</p>
      <p className="text-[13px] max-w-[280px]">A conversa escolhida na lista ao lado aparece aqui, com os dados de quem está do outro lado.</p>
    </div>
  );
}

export function Conversas() {
  const { status, erro } = useStatus();
  const router = useRouter();

  const [pronto, setPronto] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>(PERIODO_PADRAO);
  const [aba, setAba] = useState<Aba>("todas");
  // `busca` é o termo já aplicado à lista; `digitado` é o que está no campo (vira busca depois da pausa).
  const [busca, setBusca] = useState("");
  const [digitado, setDigitado] = useState("");
  const [numero, setNumero] = useState<string | null>(null);
  // `?corrigir=1` vem dos links "Corrigir" do relatório diário: a última resposta da IA da conversa
  // escolhida abre já em edição. Ele fica no endereço (não some ao trocar de conversa) porque é a
  // barra de endereço que manda nesta tela.
  const [corrigir, setCorrigir] = useState(false);
  /** A etiqueta escolhida na linha de chips; `null` quando a lista não está filtrada por nenhuma. */
  const [etiqueta, setEtiqueta] = useState<string | null>(null);
  const [itens, setItens] = useState<Conversa[] | null>(null);
  const [contadores, setContadores] = useState<Contadores>(SEM_CONVERSAS);
  const [erroLista, setErroLista] = useState<ErroLido | null>(null);

  /** O endereço é a fonte da verdade da lista: toda escolha passa por aqui antes de virar estado. */
  function irPara(mudancas: { periodo?: Periodo; aba?: Aba; busca?: string; numero?: string | null; etiqueta?: string | null }) {
    const params = new URLSearchParams(location.search);
    const escrever = (chave: string, valor: string) => (valor ? params.set(chave, valor) : params.delete(chave));
    if (mudancas.periodo !== undefined) escrever("periodo", mudancas.periodo);
    if (mudancas.aba !== undefined) escrever("aba", mudancas.aba === "todas" ? "" : mudancas.aba);
    if (mudancas.busca !== undefined) escrever("q", mudancas.busca);
    if (mudancas.numero !== undefined) escrever("numero", mudancas.numero ?? "");
    if (mudancas.etiqueta !== undefined) escrever("etiqueta", mudancas.etiqueta ?? "");
    history.pushState(null, "", `${location.pathname}${params.toString() ? `?${params}` : ""}`);
    if (mudancas.periodo !== undefined) setPeriodo(mudancas.periodo);
    if (mudancas.aba !== undefined) setAba(mudancas.aba);
    if (mudancas.busca !== undefined) setBusca(mudancas.busca);
    if (mudancas.numero !== undefined) setNumero(mudancas.numero ?? null);
    if (mudancas.etiqueta !== undefined) setEtiqueta(mudancas.etiqueta ?? null);
  }

  // Quem está esperando (o mesmo número do cabeçalho) e o som opcional de aviso. O limite vem de lá
  // porque ele é da configuração do atendente, e esta tela não carrega a configuração inteira.
  const { atrasadas, limiteMin } = useEspera();
  const { Botao: BotaoSom, tocar } = useSomDeAviso();

  const carregar = useCallback(async () => {
    const params = new URLSearchParams({ periodo });
    if (aba !== "todas") params.set("status", aba);
    if (busca) params.set("q", busca);
    if (etiqueta) params.set("etiqueta", etiqueta);
    try {
      const r = await fetch(`/api/conversas?${params}`);
      if (!r.ok) throw r;
      const dados = await r.json();
      setItens(dados.itens ?? []);
      setContadores(dados.contadores ?? SEM_CONVERSAS);
      setErroLista(null);
    } catch (e) {
      setItens([]);
      setErroLista(await lerErro(e));
    }
  }, [periodo, aba, busca, etiqueta]);

  // Abertura da tela: o que vale é o que está na barra de endereço. A carga inicial sai do corpo do
  // efeito por um setTimeout(0), mesmo padrão de components/setup.tsx (regra set-state-in-effect).
  useEffect(() => {
    setTimeout(() => {
      const params = new URLSearchParams(location.search);
      const termo = params.get("q") ?? "";
      setPeriodo(lerPeriodo(params.get("periodo")));
      setAba(lerAba(params.get("aba")));
      setBusca(termo);
      setDigitado(termo);
      setNumero(params.get("numero"));
      setCorrigir(params.get("corrigir") === "1");
      setEtiqueta(params.get("etiqueta"));
      setPronto(true);
    }, 0);
  }, []);

  // Voltar/avançar do navegador: a lista inteira vem do endereço, nunca só do estado local.
  useEffect(() => {
    function aoNavegar() {
      const params = new URLSearchParams(location.search);
      const termo = params.get("q") ?? "";
      setPeriodo(lerPeriodo(params.get("periodo")));
      setAba(lerAba(params.get("aba")));
      setBusca(termo);
      setDigitado(termo);
      setNumero(params.get("numero"));
      setCorrigir(params.get("corrigir") === "1");
      setEtiqueta(params.get("etiqueta"));
    }
    window.addEventListener("popstate", aoNavegar);
    return () => window.removeEventListener("popstate", aoNavegar);
  }, []);

  // Busca: espera a pessoa parar de escrever antes de consultar (e de escrever na barra de endereço).
  useEffect(() => {
    if (!pronto || digitado === busca) return;
    const t = setTimeout(() => irPara({ busca: digitado }), 350);
    return () => clearTimeout(t);
  }, [digitado, busca, pronto]);

  // A consulta sai do corpo do efeito por um setTimeout(0): `carregar` grava estado, e a regra
  // react-hooks/set-state-in-effect (erro nesta suíte) reprova a chamada direta dentro do efeito.
  useEffect(() => {
    if (!pronto) return;
    const t = setTimeout(carregar, 0);
    return () => clearTimeout(t);
  }, [pronto, carregar]);

  // Tempo real: qualquer mudança em qualquer conversa mexe na lista (última mensagem, status, não
  // lidas, contador das abas), então ela recarrega em qualquer aviso que não seja o da conexão.
  const recarregar = useRecargaJunta(carregar);
  const aoEvento = useCallback(
    (evento: EventoDaTela) => {
      if (evento.tipo === "conexao") return;
      // "atencao" é a conversa que acabou de parar esperando uma pessoa: é o momento de avisar.
      if (evento.tipo === "atencao") tocar();
      recarregar();
    },
    [recarregar, tocar]
  );
  const { aoVivo, reserva } = useEventos(aoEvento);

  // Reserva: sem o fluxo de avisos, a lista volta a consultar sozinha, só com a aba visível.
  useEffect(() => {
    if (!reserva) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") carregar();
    }, INTERVALO_RESERVA_MS);
    return () => clearInterval(t);
  }, [reserva, carregar]);

  // Alguém cruzou o limite enquanto a tela estava aberta: o número de atrasadas é reconferido de minuto
  // em minuto (components/useEspera.ts), e é a SUBIDA dele que toca — resolver uma conversa faz o
  // número cair, e cair não é motivo de aviso.
  const atrasadasAntes = useRef<number | null>(null);
  useEffect(() => {
    const antes = atrasadasAntes.current;
    atrasadasAntes.current = atrasadas;
    if (antes !== null && atrasadas > antes) tocar();
  }, [atrasadas, tocar]);

  // As etiquetas da conta: a linha de chips que filtra, o diálogo que organiza e a cor de cada chip da
  // lista saem daqui. Uma consulta só para a tela inteira — o painel do contato as recebe por prop.
  const {
    daEmpresa: etiquetasDaEmpresa,
    recarregar: recarregarEtiquetas,
    Filtro: FiltroEtiquetas,
    Dialogo: DialogoEtiquetas,
  } = useFiltroEtiquetas({ ativa: etiqueta, onFiltrar: (nome) => irPara({ etiqueta: nome }) });

  const lista = itens ?? [];
  const vazioDeVerdade = pronto && itens !== null && contadores.todas === 0 && !busca && !etiqueta;

  return (
    <>
      <Topbar
        marca="W"
        nome="Atendente no WhatsApp"
        area="Atendimento e Vendas"
        status={status}
        erro={erro}
        usuario={status?.usuario}
      />

      <main className="max-w-[1400px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <div className="flex items-end justify-between gap-6 max-md:flex-col max-md:items-stretch max-md:gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="titulo-painel mb-1.5">Conversas</h1>
            <p className="apoio">Acompanhe os atendimentos, veja como seu atendente está se saindo e intervenha quando necessário.</p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0 max-md:flex-col max-md:items-stretch">
            <label className="sr-only" htmlFor="periodo-conversas">Período</label>
            <select
              id="periodo-conversas"
              className="input !w-auto max-md:!w-full !py-2.5 text-[14px]"
              value={periodo}
              onChange={(e) => irPara({ periodo: lerPeriodo(e.target.value) })}
            >
              {PERIODOS.map((p) => (
                <option key={p} value={p}>{rotuloPeriodo(p)}</option>
              ))}
            </select>
            <label className="sr-only" htmlFor="busca-conversas">Buscar conversa</label>
            <div className="relative">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                id="busca-conversas"
                type="search"
                className="input !w-[280px] max-md:!w-full !py-2.5 !pl-9 text-[14px]"
                placeholder="Buscar por nome, número ou mensagem"
                value={digitado}
                onChange={(e) => setDigitado(e.target.value)}
              />
            </div>
          </div>
        </div>

        {erroLista && (
          <div className="mb-4">
            <ErrorBox mensagem={erroLista.mensagem} acao={erroLista.acao} onTentarNovamente={carregar} />
          </div>
        )}

        {soConversasDeExemplo(lista) && (
          <div className="mb-4">
            {/* Apagar a demonstração fecha a conversa aberta: ela é uma das que acabaram de sair. */}
            <AvisoConversasExemplo
              conectado={status?.integrations?.whatsapp === true}
              aoApagar={() => {
                irPara({ numero: null });
                carregar();
              }}
            />
          </div>
        )}

        {vazioDeVerdade ? (
          <Empty
            ilustracao={<IlustracaoConversa />}
            titulo="Nenhuma conversa ainda"
            descricao="Assim que alguém escrever para o número da empresa, a conversa aparece aqui. Você também pode conversar com o seu atendente pelo celular de teste."
            acao="Testar com uma pergunta"
            onAcao={() => router.push("/assistente?passo=2")}
          />
        ) : (
          <div className="grid gap-5 grid-cols-1 min-[768px]:grid-cols-[320px_minmax(0,1fr)] min-[1100px]:grid-cols-[360px_minmax(0,1fr)] items-start">
            {/* As abas rolam na horizontal quando não cabem; o botão de som fica FORA da faixa rolável,
                senão ele empurraria a largura da página no celular. */}
            <div className={`min-[768px]:col-span-2 flex items-end gap-2 border-b border-line ${numero ? "max-md:hidden" : ""}`}>
              <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
              {ABAS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={aba === a.id}
                  onClick={() => irPara({ aba: a.id })}
                  className={`whitespace-nowrap px-3.5 max-md:px-2.5 py-2.5 text-[14px] max-md:text-[13.5px] font-semibold border-b-2 -mb-px cursor-pointer ${aba === a.id ? "text-accent border-accent" : "text-ink-2 border-transparent hover:text-ink"}`}
                >
                  {a.rotulo} <span className="text-[12.5px] font-bold">{contadores[a.id]}</span>
                </button>
              ))}
              </div>
              <span className="shrink-0 pb-1.5">{BotaoSom}</span>
            </div>

            {FiltroEtiquetas && <div className={`min-[768px]:col-span-2 -mt-2 ${numero ? "max-md:hidden" : ""}`}>{FiltroEtiquetas}</div>}

            <section className={`card overflow-hidden ${numero ? "max-md:hidden" : ""}`} aria-label="Lista de conversas">
              {itens === null ? (
                <LinhasFalsas />
              ) : lista.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13px] text-muted">Nenhuma conversa com esses filtros. Experimente outro período, outra etiqueta ou limpe a busca.</p>
              ) : (
                <ul className="max-h-[calc(100vh-280px)] max-md:max-h-none overflow-y-auto [&>li:last-child>button]:border-b-0">
                  {lista.map((c) => (
                    <LinhaConversa
                      key={c.numero}
                      conversa={c}
                      selecionada={c.numero === numero}
                      etiquetasDaEmpresa={etiquetasDaEmpresa}
                      limiteMin={limiteMin}
                      onEscolher={() => irPara({ numero: c.numero })}
                    />
                  ))}
                </ul>
              )}
              {itens !== null && <ComoAtualiza aoVivo={aoVivo} />}
            </section>

            <section className={`min-w-0 ${numero ? "" : "max-md:hidden"}`} aria-label="Conversa">
              {numero ? (
                <ConversaAberta
                  key={numero}
                  numero={numero}
                  corrigirUltima={corrigir}
                  onVoltar={() => irPara({ numero: null })}
                  onMudou={carregar}
                  etiquetasDaEmpresa={etiquetasDaEmpresa}
                  onEtiquetasMudaram={recarregarEtiquetas}
                />
              ) : (
                <SemConversa />
              )}
            </section>
          </div>
        )}
      </main>
      {DialogoEtiquetas}
    </>
  );
}

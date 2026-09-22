"use client";
// Tela de Início: o painel do dia. Em cinco segundos ela responde duas perguntas — "está tudo bem?" e
// "o que precisa de mim?" — e só depois oferece os atalhos para o resto do app.
//
// Todos os números vêm de `GET /api/metricas?periodo=hoje` (lib/metricas.ts é a fonte única; as
// definições de cada número estão no topo daquele arquivo). Esta tela não calcula nenhum deles.
//
// O conteúdo fica neste componente, e não em `app/page.tsx`, pelo mesmo motivo das outras telas: é em
// `components/*.tsx` que o texto de tela é varrido por `scripts/verificar-jargao.mjs` (ver CLAUDE.md).
//
// Um trabalho a mais: os links "Aprovar" e "Corrigir" do relatório diário apontam para
// `/?atender=<numero>`. Eles continuam valendo, então esta tela os manda para a conversa em
// `/conversas?numero=<numero>`, preservando o resto da barra de endereço (`&corrigir=1`, por exemplo).
//
// `?exemplo=1&captura=1` (a prévia do catálogo, gerada pelo workflow de publicação) não precisa de
// atalho nenhum: sem configuração salva o app já abre com a clínica de exemplo, e as nove conversas de
// exemplo nascem na primeira leitura das rotas. `captura=1` existe para desligar rolagem automática, e
// esta tela não tem nenhuma — ela abre inteira no topo.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AvisoConversasExemplo } from "./AvisoExemplo";
import { Avatar } from "./ContatoVisual";
import { Indicadores } from "./Indicadores";
import { DataTable, IlustracaoSegmento, Topbar, useStatus, type Coluna } from "./ui";
import { INTERVALO_RESERVA_MS, useEventos, useRecargaJunta } from "./useEventos";
import { soConversasDeExemplo } from "@/lib/demo";
import { navegacaoComContador } from "@/lib/navegacao";
import { classeStatus, dataPorExtenso, haQuantoTempo, previaMensagem, rotuloContato, rotuloStatus, saudacao } from "@/lib/rotulos";
import type { Config, Conversa, Metricas } from "@/lib/types";

/** Quantas conversas a tabela "Conversas recentes" mostra antes do link "Ver todas". */
const RECENTES = 5;

function conversaLink(numero: string): string {
  return `/conversas?numero=${encodeURIComponent(numero)}`;
}

const COLUNAS: Coluna<Conversa>[] = [
  {
    chave: "cliente",
    titulo: "Cliente",
    papel: "titulo",
    largura: "26%",
    render: (c) => (
      <Link
        href={conversaLink(c.numero)}
        // A linha inteira já leva à conversa no clique do mouse; este link é o caminho de teclado.
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-2.5 min-w-0 max-w-full hover:underline"
      >
        <Avatar nome={c.nome} tamanho={32} />
        <span className="truncate font-bold">{rotuloContato(c.numero, c.nome)}</span>
      </Link>
    ),
  },
  {
    chave: "mensagem",
    titulo: "Última mensagem",
    papel: "resumo",
    linhas: 2,
    render: (c) => <span className="text-ink-2">{previaMensagem(c.ultima_mensagem) || "Sem mensagem ainda"}</span>,
  },
  {
    chave: "status",
    titulo: "Status",
    papel: "chip",
    largura: "190px",
    render: (c) => <span className={classeStatus(c.status)}>{rotuloStatus(c.status)}</span>,
  },
  {
    chave: "quando",
    titulo: "Horário",
    largura: "110px",
    render: (c) => <span className="text-muted whitespace-nowrap">{haQuantoTempo(c.atualizado_em)}</span>,
  },
];

/** Um dos quatro atalhos do painel; `destacado` pinta o primeiro no acento, como no mockup. */
function CartaoAcao({ href, titulo, apoio, destacado = false }: { href: string; titulo: string; apoio: string; destacado?: boolean }) {
  return (
    <Link
      href={href}
      className={`card px-5 py-[18px] block transition-colors ${destacado ? "bg-accent-soft border-accent-soft hover:border-accent" : "hover:bg-bg"}`}
    >
      <span className={`block font-bold ${destacado ? "text-accent-ink" : ""}`}>{titulo}</span>
      <span className="block apoio mt-1">{apoio}</span>
    </Link>
  );
}

/**
 * O cartão ao lado do título, com a ilustração do segmento e a situação em uma frase. A ordem das três
 * frases é deliberada: sem número conectado nada do que aparece na tela é real, então conectar vem
 * antes de "precisam de você" — o número de conversas esperando já está no cabeçalho, em Conversas.
 */
function CartaoSituacao({ conectado, assistenteCriado, atencao }: { conectado: boolean; assistenteCriado: boolean; atencao: number }) {
  // A ordem é a da jornada: criar o atendente vem antes de conectar o número, e conectar vem antes de
  // qualquer número de conversa — nada do que a tela mostra é real enquanto esses dois passos faltarem.
  const situacao = !assistenteCriado
    ? { titulo: "Falta criar seu atendente", apoio: "Diga o que ele precisa saber e teste as respostas.", url: "/assistente" }
    : !conectado
    ? { titulo: "Falta conectar o WhatsApp", apoio: "Leia o código com o celular da empresa.", url: "/assistente?passo=3" }
    : atencao > 0
      ? {
          titulo: atencao === 1 ? "1 conversa precisa de você" : `${atencao} conversas precisam de você`,
          apoio: "Alguém está esperando uma resposta sua.",
          url: "/conversas?aba=atencao",
        }
      : { titulo: "Tudo certo por aqui", apoio: "Nenhuma conversa esperando uma pessoa.", url: null };

  const conteudo = (
    <>
      <span className="relative w-[64px] shrink-0 max-md:hidden">
        <span className="blob-acento" />
        <IlustracaoSegmento segmento="Atendimento" loading="eager" className="relative w-full h-auto" />
      </span>
      <span className="min-w-0">
        <span className="block font-bold">{situacao.titulo}</span>
        <span className="block apoio mt-0.5">{situacao.apoio}</span>
      </span>
    </>
  );

  const classe = "card px-5 py-4 flex items-center gap-4 w-[340px] max-[900px]:w-full";
  return situacao.url ? (
    <Link href={situacao.url} className={`${classe} transition-colors hover:bg-bg`}>{conteudo}</Link>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}

/** O cartão do atendente, na coluna da direita: quem ele é, onde está atendendo e o caminho para editar. */
function CartaoAtendente({ config, conectado }: { config: Config | null; conectado: boolean }) {
  return (
    <div className="card px-5 py-[18px]">
      <h2 className="section-title">Seu atendente</h2>
      <div className="flex items-center gap-3">
        <Avatar nome={config?.atendente} tamanho={44} />
        <div className="min-w-0">
          <div className="font-bold truncate">{config?.atendente || "Seu atendente"}</div>
          <div className="apoio">{config?.negocio ? `Atendimento da ${config.negocio}` : "Atendimento da sua empresa"}</div>
        </div>
      </div>
      <p className="mt-3">
        <span className={conectado ? "chip-positivo" : "chip-cinza"}>{conectado ? "Online" : "Só no simulador"}</span>
      </p>
      <Link href="/assistente" className="btn-secundario mt-4">Editar</Link>
    </div>
  );
}

export function Inicio() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [mostrar, setMostrar] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [conversas, setConversas] = useState<Conversa[] | null>(null);

  useEffect(() => {
    // A carga inicial sai do corpo do efeito por um setTimeout(0), mesmo padrão de components/setup.tsx:
    // mudar estado direto dentro do efeito dispara renderizações em cascata (regra do React 19).
    const t = setTimeout(() => {
      const params = new URLSearchParams(location.search);
      const numero = params.get("atender");
      if (numero) {
        params.delete("atender");
        params.set("numero", numero);
        router.replace(`/conversas?${params.toString()}`);
        return;
      }
      setMostrar(true);
    }, 0);
    return () => clearTimeout(t);
  }, [router]);

  // As três consultas saem juntas e cada parte da tela aparece quando a sua chega: um número que
  // demore não segura a tabela, e uma falha de rede deixa a tela com o que já foi lido em vez de
  // quebrar o painel inteiro (o erro de servidor indisponível já aparece no cabeçalho).
  const carregar = useCallback(() => {
    fetch("/api/config").then((r) => r.json()).then(setConfig).catch(() => {});
    fetch("/api/metricas?periodo=hoje").then((r) => r.json()).then(setMetricas).catch(() => {});
    fetch("/api/conversas?periodo=tudo").then((r) => r.json()).then((d) => setConversas(d.itens ?? [])).catch(() => setConversas([]));
  }, []);

  useEffect(() => {
    if (!mostrar) return;
    carregar();
  }, [mostrar, carregar]);

  // Tempo real: o painel do dia (conversas esperando, números de hoje, últimas conversas) muda a cada
  // mensagem que chega, então qualquer aviso o recarrega — inclusive o da conexão do número.
  const recarregar = useRecargaJunta(carregar);
  const { reserva } = useEventos(recarregar);

  // Reserva: sem o fluxo de avisos, o painel volta a consultar sozinho, só com a aba visível.
  useEffect(() => {
    if (!mostrar || !reserva) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") carregar();
    }, INTERVALO_RESERVA_MS);
    return () => clearInterval(t);
  }, [mostrar, reserva, carregar]);

  const conectado = status?.integrations?.whatsapp === true;
  const assistenteCriado = status?.integrations?.assistente === true;
  const atencao = metricas?.atencao.length ?? 0;
  const primeiroNome = (status?.usuario?.nome ?? "").trim().split(/\s+/)[0] ?? "";
  const atendente = config?.atendente || "sua atendente";
  const frase = conectado
    ? `A ${atendente} está atendendo seus clientes no WhatsApp.`
    : status && !status.ai
      ? "Você está vendo uma demonstração com dados de exemplo."
      : status && !assistenteCriado
        ? "Falta criar seu atendente: é ele que responde os clientes."
        : `A ${atendente} está pronta. Falta conectar o número da empresa.`;
  const recentes = (conversas ?? []).slice(0, RECENTES);

  return (
    <>
      <Topbar
        marca="W"
        nome="Atendente no WhatsApp"
        area="Atendimento e Vendas"
        status={status}
        erro={erro}
        usuario={status?.usuario}
        navegacao={navegacaoComContador(atencao)}
      />

      <main className="max-w-[1400px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <div className="flex items-start justify-between gap-6 max-[900px]:flex-col max-[900px]:items-stretch mb-6">
          <div className="min-w-0">
            <p className="apoio mb-1.5">{dataPorExtenso()}</p>
            <h1 className="titulo-painel mb-1.5">{primeiroNome ? `${saudacao()}, ${primeiroNome}!` : `${saudacao()}!`}</h1>
            <p className="apoio">{frase}</p>
          </div>
          <CartaoSituacao conectado={conectado} assistenteCriado={assistenteCriado} atencao={atencao} />
        </div>

        {mostrar && (
          <>
            <div className="mb-6">
              <Indicadores metricas={metricas} contexto="em relação a ontem" rotuloConversas="Conversas hoje" />
            </div>

            <div className="grid gap-4 grid-cols-1 min-[560px]:grid-cols-2 min-[1240px]:grid-cols-4 mb-8">
              <CartaoAcao destacado href="/conversas" titulo="Ver conversas" apoio="Acompanhe e intervenha quando necessário" />
              <CartaoAcao href="/assistente" titulo="Editar atendente" apoio="Ajuste informações, comportamento e respostas" />
              <CartaoAcao href="/assistente#conhecimento" titulo="Adicionar conhecimento" apoio="Envie arquivos ou textos" />
              {!assistenteCriado ? (
                <CartaoAcao href="/assistente" titulo="Criar meu atendente" apoio="O primeiro passo: quem ele é e o que sabe" />
              ) : conectado ? (
                <CartaoAcao href="/setup" titulo="Configurações" apoio="Conexões com outros sistemas e relatório diário" />
              ) : (
                <CartaoAcao href="/assistente?passo=3" titulo="Conectar o WhatsApp" apoio="Leia o código com o celular da empresa" />
              )}
            </div>

            <div className="grid gap-5 items-start grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1fr)_320px]">
              <section className="min-w-0" aria-label="Conversas recentes">
                <div className="flex items-baseline justify-between gap-4 mb-3">
                  <h2 className="section-title !mb-0">Conversas recentes</h2>
                  <Link href="/conversas" className="btn-link text-[13px]">Ver todas</Link>
                </div>

                {soConversasDeExemplo(conversas ?? []) && (
                  <div className="mb-4">
                    <AvisoConversasExemplo conectado={conectado} aoApagar={carregar} />
                  </div>
                )}

                {conversas === null ? (
                  <div className="card px-5 py-[18px]" aria-hidden="true">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} className="skeleton block w-full mt-3 first:mt-0" />
                    ))}
                  </div>
                ) : recentes.length === 0 ? (
                  <div className="card px-5 py-6 text-center text-[13px] text-muted">
                    <p className="text-ink font-bold mb-1">Nenhuma conversa ainda</p>
                    <p>Assim que alguém escrever para o número da empresa, a conversa aparece aqui.</p>
                    <Link href="/assistente?passo=2" className="btn-link text-[13px] mt-1 inline-block">Testar com uma pergunta</Link>
                  </div>
                ) : (
                  <DataTable colunas={COLUNAS} linhas={recentes} link={(c) => conversaLink(c.numero)} />
                )}
              </section>

              <aside className="flex flex-col gap-4">
                <CartaoAtendente config={config} conectado={conectado} />
                <div className="card px-5 py-[18px]">
                  <h2 className="font-bold">Mais resultados para seu negócio</h2>
                  <p className="apoio mt-1">Veja como a IA está atendendo.</p>
                  <Link href="/relatorios" className="btn-secundario mt-4">Ver relatórios</Link>
                </div>
              </aside>
            </div>
          </>
        )}
      </main>
    </>
  );
}

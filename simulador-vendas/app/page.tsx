"use client";
// O Início (US-027): o que está acontecendo e o que fazer a seguir.
//
// Esta tela não faz nada — ela só mostra e aponta. O gestor abre o app várias vezes por dia e o que ele
// precisa é responder "o time está treinando?" em dois segundos e ter à mão o botão do que faz isso
// acontecer. Por isso não há formulário nenhum aqui: o cadastro de produto mora em /produtos, a criação
// de treino em /simulacoes/nova e a análise de uma conversa real em /equipe/analisar (US-026).
//
// Os números vêm todos de `GET /api/inicio`, que é cálculo puro sobre o que já está gravado
// (`lib/inicio.ts`) — nenhuma chamada de IA nasce ao abrir o app.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AvisoExemplo } from "@/components/AvisoExemplo";
import { Chip, Hero, Item, Topbar, numero, useStatus } from "@/components/ui";
import { METODOLOGIAS } from "@/lib/metodologias";
import type { Inicio } from "@/lib/inicio";
import type { Dificuldade } from "@/lib/simulacoes";

// Economia de texto (ver CLAUDE.md): título com 8 palavras, apoio com 19 (teto de 20).
const PROMESSA = {
  sobretitulo: "Vendas",
  titulo: "Treine seu time para qualquer cenário de venda",
  apoio: "Cadastre o produto uma vez, crie o treino e mande um link só: o time inteiro pratica por voz.",
};

/** Os seis passos do "Ver como funciona" — o que o gestor repete para o time quando manda o link. */
const COMO_FUNCIONA: { titulo: string; apoio: string }[] = [
  { titulo: "Cadastre o produto", apoio: "Cole a página, envie a apresentação ou escreva o que vocês vendem." },
  { titulo: "Crie a simulação", apoio: "Escolha a metodologia, a dificuldade e os tipos de cliente." },
  { titulo: "Mande um link só", apoio: "O mesmo endereço serve para o time inteiro, sem cadastro nenhum." },
  { titulo: "Cada um treina por voz", apoio: "No navegador, com um cliente simulado diferente para cada pessoa." },
  { titulo: "A conversa é avaliada", apoio: "Nota por critério, com o trecho da conversa que justifica cada uma." },
  { titulo: "Você acompanha", apoio: "Por vendedor, por tipo de cliente e ao longo dos meses." },
];

const DIFICULDADES: Record<Dificuldade, string> = { facil: "Fácil", realista: "Realista", dificil: "Difícil" };

/** "3 sessões" / "1 sessão": plural resolvido aqui, não no meio do JSX. */
function contagem(n: number, singular: string, plural: string) {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Os seis passos, atrás do "Ver como funciona" do hero. Sem vídeo: é texto, e texto se lê no celular. */
function ComoFunciona() {
  return (
    <details className="[&[open]]:basis-full min-w-0">
      <summary className="btn-secundario !w-auto cursor-pointer list-none [&::-webkit-details-marker]:hidden">Ver como funciona</summary>
      <ol className="mt-4 grid grid-cols-2 max-md:grid-cols-1 gap-x-6 gap-y-3 max-w-[560px]">
        {COMO_FUNCIONA.map((p, i) => (
          <li key={p.titulo} className="flex items-baseline gap-2">
            <span className="font-extrabold text-[13px] text-accent shrink-0">{i + 1}</span>
            <span className="text-[13px] text-ink-2">
              <strong className="text-ink">{p.titulo}.</strong> {p.apoio}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

/**
 * Um dos quatro números do topo.
 *
 * A variação vem pronta do servidor como diferença absoluta (a mesma unidade do número), não como
 * porcentagem: "+0,4" numa nota média diz o que aconteceu; "+6%" sobre uma nota não quer dizer nada.
 */
function Indicador({ rotulo, valor, decimais, variacao, dias }: { rotulo: string; valor: number | null; decimais: number; variacao: number | null; dias: number }) {
  const cor = variacao === null || variacao === 0 ? "text-muted" : variacao > 0 ? "text-ok" : "text-danger";
  return (
    <Item>
      <div className="text-[12.5px] font-semibold text-muted">{rotulo}</div>
      <div className="text-[26px] leading-none font-extrabold tracking-[-0.02em] mt-1.5">{valor === null ? "—" : numero(valor, decimais)}</div>
      <div className={`text-[12.5px] mt-1.5 ${cor}`}>
        {variacao === null
          ? "Sem base para comparar"
          : `${variacao > 0 ? "+" : variacao < 0 ? "−" : ""}${numero(Math.abs(variacao), decimais)} vs. ${dias} dias anteriores`}
      </div>
    </Item>
  );
}

/** Os três primeiros passos de quem está começando, marcados a partir do estado do banco. */
function ComeceEm3Passos({ passos }: { passos: Inicio["passos"] }) {
  return (
    <section className="card p-5">
      <h2 className="font-bold text-[15px] mb-1">Comece em 3 passos</h2>
      <p className="text-[12.5px] text-muted mb-4">Do produto ao primeiro treino do time.</p>
      <ol className="flex flex-col gap-3.5">
        {passos.map((p, i) => (
          <li key={p.titulo} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`shrink-0 w-6 h-6 rounded-full grid place-items-center text-[12px] font-extrabold ${
                p.concluido ? "bg-accent text-white" : "border border-line text-muted"
              }`}
            >
              {p.concluido ? "✓" : i + 1}
            </span>
            <div className="min-w-0">
              <div className="font-bold text-[13.5px]">
                {p.titulo}
                {p.concluido && <span className="sr-only"> (concluído)</span>}
              </div>
              <p className="text-[12.5px] text-muted mt-0.5">{p.apoio}</p>
              <Link href={p.acao.url} className="btn-link text-[12.5px] mt-1 inline-block">{p.acao.rotulo}</Link>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Texto fixo que gira por semana; a rota já escolheu qual, para as duas colunas nunca discordarem. */
function DicaDaSemana({ dica }: { dica: Inicio["dica"] }) {
  return (
    <section className="card p-5">
      <h2 className="font-bold text-[15px] mb-1">Dica da semana</h2>
      <div className="text-[13px] font-bold text-accent-ink mb-1.5">{dica.titulo}</div>
      <p className="text-[13px] text-ink-2">{dica.texto}</p>
    </section>
  );
}

/** Até três treinos rodando agora, com o que cada um já rendeu. */
function SimulacoesAtivas({ ativas, total }: { ativas: Inicio["ativas"]; total: number }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="section-title !mb-0">Simulações ativas</h2>
        {total > ativas.length && <Link href="/simulacoes" className="btn-link text-[13px]">Ver todas</Link>}
      </div>

      {ativas.length === 0 ? (
        <Item>
          <p className="text-[13px] text-muted">
            Nenhum treino ativo agora. <Link href="/simulacoes" className="btn-link">Reative um treino</Link> ou crie o próximo.
          </p>
        </Item>
      ) : (
        <div className="flex flex-col gap-3">
          {ativas.map((s) => (
            <article key={s.codigo} className="card px-5 py-4">
              <div className="flex items-start justify-between gap-3 mb-1.5 max-md:flex-col max-md:items-stretch max-md:gap-1.5">
                <div className="min-w-0">
                  <h3 className="font-bold text-[16px] truncate">{s.nome}</h3>
                  <p className="text-muted text-sm mt-0.5 truncate">{s.produtoNome}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                  {s.exemplo && <Chip nivel="neutral">Exemplo</Chip>}
                  <Chip nivel="cinza">{METODOLOGIAS[s.metodologia].nome}</Chip>
                  <Chip nivel="cinza">{DIFICULDADES[s.dificuldade]}</Chip>
                </div>
              </div>
              <p className="text-[13px] text-muted mb-3">
                {s.sessoes === 0
                  ? "Ninguém treinou ainda"
                  : `${contagem(s.participantes, "participante", "participantes")} · ${contagem(s.sessoes, "sessão", "sessões")} · ${
                      s.notaMedia === null ? "sem nota ainda" : `nota média ${numero(s.notaMedia, 1)}`
                    }`}
              </p>
              <Link href={`/resultados/${s.codigo}`} className="btn-link">Ver resultados</Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [inicio, setInicio] = useState<Inicio | null>(null);
  const redirecionado = useRef(false);

  // O atalho `/?exemplo=1` da suíte (o botão "Testar com um exemplo" de /setup e a captura do
  // catálogo) continua valendo: desde a US-026 quem analisa uma conversa é /equipe/analisar, então o
  // Início repassa os parâmetros para lá em vez de deixar o atalho sem efeito.
  useEffect(() => {
    if (redirecionado.current) return;
    const busca = new URLSearchParams(location.search);
    if (busca.get("exemplo") === "1") {
      redirecionado.current = true;
      router.replace(`/equipe/analisar?${busca.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  // Busca inicial em forma de corrente: a regra react-hooks/set-state-in-effect acusa a chamada direta
  // a uma função que mexe em estado no corpo do efeito, mesmo sendo assíncrona.
  useEffect(() => {
    fetch("/api/inicio")
      .then((r) => (r.ok ? r.json() : null))
      .then((c: Inicio | null) => setInicio(c))
      .catch(() => setInicio(null));
  }, []);

  const vazio = inicio?.vazio ?? true;

  return (
    <>
      <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={status} erro={erro} resumo="Modo demonstração: as conversas e as avaliações exibidas são um exemplo." usuario={status?.usuario} />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Vendas">
        <div className="flex gap-2.5 flex-wrap items-start">
          <Link href="/simulacoes/nova" className="btn-primary !w-auto">+ Criar simulação</Link>
          <ComoFunciona />
        </div>
      </Hero>

      <main className="grid grid-cols-[minmax(0,1fr)_320px] max-lg:grid-cols-1 gap-6 px-8 pt-6 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div className="flex flex-col gap-6">
          {inicio === null ? (
            <p className="text-muted text-sm">Carregando...</p>
          ) : (
            <>
              {inicio.exemplo && (
                <AvisoExemplo>
                  Os números e os treinos abaixo são um exemplo, para você ver o app cheio; eles somem quando o seu time treinar de verdade.
                </AvisoExemplo>
              )}

              {!vazio && (
                <section>
                  <h2 className="section-title">Últimos {inicio.dias} dias</h2>
                  <div className="grid grid-cols-4 max-md:grid-cols-2 gap-3 [&>*]:min-w-0">
                    {inicio.indicadores.map((i) => (
                      <Indicador key={i.id} rotulo={i.rotulo} valor={i.valor} decimais={i.decimais} variacao={i.variacao} dias={inicio.dias} />
                    ))}
                  </div>
                </section>
              )}

              {/* Instalação em que ninguém treinou ainda: os três passos ocupam o lugar dos cartões —
                  quatro zeros e uma lista vazia não diriam nada a quem ainda vai mandar o primeiro link.
                  Eles são o estado vazio desta tela; um `Empty` acima deles diria a mesma coisa duas vezes. */}
              {vazio ? <ComeceEm3Passos passos={inicio.passos} /> : <SimulacoesAtivas ativas={inicio.ativas} total={inicio.totalAtivas} />}
            </>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          {inicio !== null && !vazio && <ComeceEm3Passos passos={inicio.passos} />}
          {inicio !== null && <DicaDaSemana dica={inicio.dica} />}
        </aside>
      </main>
    </>
  );
}

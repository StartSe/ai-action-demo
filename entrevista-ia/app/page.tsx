"use client";
// O Início (US-022 da PRD): o que precisa de você hoje, sem procurar em quatro telas.
//
// Esta tela não faz nada — ela só mostra e aponta. A pessoa de RH abre o app várias vezes por dia e o
// que ela precisa é responder "o processo está andando?" em dois segundos e ter à mão o botão do que
// faz isso acontecer. Por isso não há formulário nenhum aqui: a vaga nasce em /vagas/nova, o candidato
// em /candidatos, o convite na página da vaga e a conversa acontece pelo link, no aparelho do
// candidato. Até esta história o Início ERA o formulário da entrevista, e era ele que fazia o app
// parecer uma tela só — o scorecard antigo continua abrindo por /r/<id>.
//
// Os números vêm todos de `GET /api/inicio`, que é cálculo puro sobre o que já está gravado
// (`lib/inicio.ts`) — nenhuma chamada de IA nasce ao abrir o app.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AvisoExemplo } from "@/components/AvisoExemplo";
import { Chip, IlustracaoSegmento, Item, Topbar, numero, useStatus } from "@/components/ui";
import type { Inicio, PendenciaInicio, VagaAbertaInicio } from "@/lib/inicio";

/** "3 convidados · 1 avaliada": só as etapas que têm gente, para um cartão novo não nascer cheio de zeros. */
function etapas(c: VagaAbertaInicio["candidatos"]): string {
  if (!c.total) return "Nenhum candidato ainda";
  const partes: string[] = [];
  if (c.convidados) partes.push(`${c.convidados} ${c.convidados === 1 ? "convidado" : "convidados"}`);
  if (c.emAndamento) partes.push(`${c.emAndamento} conversando agora`);
  if (c.concluidas) partes.push(`${c.concluidas} ${c.concluidas === 1 ? "concluída" : "concluídas"}`);
  if (c.avaliadas) partes.push(`${c.avaliadas} ${c.avaliadas === 1 ? "avaliada" : "avaliadas"}`);
  return partes.join(" · ");
}

/**
 * Um dos quatro números do topo.
 *
 * A variação vem pronta do servidor como diferença absoluta (a mesma unidade do número), não como
 * porcentagem: "+2" numa fila de pareceres diz o que aconteceu; "+40%" sobre dois pareceres não quer
 * dizer nada. A legenda muda com a `janela` porque os números medem coisas diferentes — uma fila se
 * compara com o retrato de trinta dias atrás, um movimento com o período anterior.
 */
function Indicador({ indicador, dias }: { indicador: Inicio["indicadores"][number]; dias: number }) {
  const { rotulo, valor, decimais, variacao, janela } = indicador;
  const cor = variacao === null || variacao === 0 ? "text-muted" : variacao > 0 ? "text-ok" : "text-danger";
  const referencia = janela === "agora" ? `${dias} dias atrás` : `${dias} dias anteriores`;
  return (
    <Item>
      <div className="text-[12.5px] font-semibold text-muted">{rotulo}</div>
      <div className="text-[26px] leading-none font-extrabold tracking-[-0.02em] mt-1.5">{valor === null ? "—" : numero(valor, decimais)}</div>
      <div className={`text-[12.5px] mt-1.5 ${cor}`}>
        {variacao === null
          ? "Sem base para comparar"
          : `${variacao > 0 ? "+" : variacao < 0 ? "−" : ""}${numero(Math.abs(variacao), decimais)} vs. ${referencia}`}
      </div>
    </Item>
  );
}

/** Uma linha de "Precisa de você": o que está parado, de quem é e o caminho para resolver. */
function LinhaPendencia({ item }: { item: PendenciaInicio }) {
  return (
    <li className="flex items-start justify-between gap-3 py-3 border-b border-line last:border-b-0 max-md:flex-col max-md:gap-1.5">
      <div className="min-w-0">
        <div className="font-bold text-[14px] flex items-center gap-1.5 flex-wrap">
          {item.titulo}
          {item.exemplo && <Chip nivel="neutral">Exemplo</Chip>}
        </div>
        <p className="text-[12.5px] text-muted mt-0.5">{item.apoio}</p>
      </div>
      <Link href={item.url} className="btn-ghost !w-auto shrink-0">{item.acao}</Link>
    </li>
  );
}

function PrecisaDeVoce({ itens }: { itens: PendenciaInicio[] }) {
  return (
    <section>
      <h2 className="section-title">Precisa de você</h2>
      {itens.length === 0 ? (
        <Item>
          <p className="text-[13px] text-muted">Nada parado esperando por você agora. Quando um parecer ficar pronto, ele aparece aqui.</p>
        </Item>
      ) : (
        <div className="card px-5 py-1">
          <ul>
            {itens.map((item) => (
              <LinhaPendencia key={item.id} item={item} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Até três vagas recebendo candidatos agora, com quem está em cada etapa. */
function VagasAbertas({ vagas, total }: { vagas: VagaAbertaInicio[]; total: number }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="section-title !mb-0">Vagas abertas</h2>
        {total > vagas.length && <Link href="/vagas" className="btn-link text-[13px]">Ver todas</Link>}
      </div>

      {vagas.length === 0 ? (
        <Item>
          <p className="text-[13px] text-muted">
            Nenhuma vaga aberta agora. <Link href="/vagas/nova" className="btn-link">Abrir uma vaga</Link> é o que põe o processo de pé.
          </p>
        </Item>
      ) : (
        <div className="flex flex-col gap-3">
          {vagas.map((v) => (
            <article key={v.id} className="card px-5 py-4">
              <div className="flex items-start justify-between gap-3 mb-1.5 max-md:flex-col max-md:items-stretch max-md:gap-1.5">
                <h3 className="font-bold text-[16px] truncate min-w-0">{v.cargo}</h3>
                {v.exemplo && <div className="shrink-0"><Chip nivel="neutral">Exemplo</Chip></div>}
              </div>
              <p className="text-[13px] text-muted mb-3">{etapas(v.candidatos)}</p>
              <Link href={`/vagas/${v.id}`} className="btn-link">Ver vaga</Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/** Os três primeiros passos de quem está começando, marcados a partir do que existe de verdade. */
function ComeceEm3Passos({ passos }: { passos: Inicio["passos"] }) {
  return (
    <section className="card p-5">
      <h2 className="font-bold text-[15px] mb-1">Comece em 3 passos</h2>
      <p className="text-[12.5px] text-muted mb-4">Da cultura da empresa à primeira conversa.</p>
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

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [inicio, setInicio] = useState<Inicio | null>(null);
  const atalhoUsado = useRef(false);

  function recarregarInicio() {
    return fetch("/api/inicio")
      .then((r) => (r.ok ? r.json() : null))
      .then((c: Inicio | null) => setInicio(c))
      .catch(() => setInicio(null));
  }

  // O atalho `/?exemplo=1` da suíte (US-025 da PRD): o botão "Testar com um exemplo" de Configurações
  // e a captura do catálogo. Ele garante que a demonstração está semeada mesmo quando a marca de "já
  // semeei" já foi gravada (ou a IA está conectada) — o servidor é que decide, e recusa se já houver
  // dado de verdade. Com `captura=1` a tela que abre é a da vaga de exemplo, que mostra o app cheio
  // (vaga, candidatos e notas) numa dobra só; é essa a imagem do catálogo.
  //
  // A busca do Início só sai depois, para a tela não piscar os quatro zeros antes da semeadura chegar.
  useEffect(() => {
    if (atalhoUsado.current) return;
    const busca = new URLSearchParams(location.search);
    if (busca.get("exemplo") !== "1") return;
    atalhoUsado.current = true;
    const captura = busca.get("captura") === "1";
    fetch("/api/exemplo", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((c: { vagaId: string | null } | null) => {
        if (captura && c?.vagaId) router.replace(`/vagas/${c.vagaId}?captura=1`);
        else return recarregarInicio();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  // Busca inicial em forma de corrente: a regra react-hooks/set-state-in-effect acusa a chamada direta
  // a uma função que mexe em estado no corpo do efeito, mesmo sendo assíncrona.
  useEffect(() => {
    recarregarInicio().catch(() => setInicio(null));
  }, []);

  const vazio = inicio?.vazio ?? true;
  // "Comece em 3 passos" some quando os três já foram dados: quem já convidou alguém não precisa mais
  // do caminho de estreia ocupando a coluna da direita.
  const faltaAlgo = Boolean(inicio?.passos.some((p) => !p.concluido));

  return (
    <>
      <Topbar
        marca="E"
        nome="Entrevistadora IA"
        area="Recursos Humanos"
        status={status}
        erro={erro}
        usuario={status?.usuario}
        resumo="Modo demonstração: as conversas e os pareceres exibidos são um exemplo."
      />

      {/* O título grande, a ilustração e os `Passos` do hero saíram daqui (US-022 da PRD): quem abre o
          app pela quinta vez no dia não precisa da promessa do produto ocupando a primeira dobra — ela
          continua valendo para quem ainda não entrou, no catálogo e na tela do candidato. */}
      <div className="max-w-[1400px] mx-auto px-8 pt-7 max-md:px-4 max-md:pt-5">
        <div className="flex items-start justify-between gap-4 max-md:flex-col max-md:gap-3">
          <div>
            <h1 className="titulo-painel mb-1.5">Início</h1>
            <p className="apoio">Onde cada candidato está e o que espera uma decisão sua.</p>
          </div>
          <Link href="/vagas/nova" className="btn-primary !w-auto shrink-0 max-md:!w-full">Abrir vaga</Link>
        </div>
      </div>

      <main className="grid grid-cols-[minmax(0,1fr)_320px] max-lg:grid-cols-1 gap-6 px-8 pt-6 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div className="flex flex-col gap-6">
          {inicio === null ? (
            <p className="text-muted text-sm">Carregando...</p>
          ) : vazio ? (
            // Nada cadastrado ainda: quatro zeros e três listas vazias não diriam nada a quem ainda vai
            // abrir a primeira vaga. Os três passos são o estado vazio desta tela, e é aqui que a
            // ilustração do segmento aparece — em nenhuma outra parte do Início.
            <section className="card p-7 max-md:p-5 flex items-start gap-6 max-md:flex-col">
              {/* `max-md:hidden` como no `Hero`: sem `<source>` casando abaixo de 768 px o `<img>` fica
                  sem `src`, e no celular ele viraria um ícone de imagem quebrada ocupando meia tela. */}
              <div className="relative w-[150px] shrink-0 max-md:hidden">
                <div className="blob-acento" />
                <IlustracaoSegmento segmento="RH" loading="eager" className="relative w-full h-auto" />
              </div>
              <div className="min-w-0">
                <h2 className="titulo-painel mb-1.5">Comece o seu primeiro processo</h2>
                <p className="apoio mb-5">
                  Você abre a vaga e manda um link. O candidato conversa por voz, do celular, e você recebe um parecer pronto para decidir.
                </p>
                <ComeceEm3Passos passos={inicio.passos} />
              </div>
            </section>
          ) : (
            <>
              {inicio.exemplo && (
                <AvisoExemplo>
                  As vagas, os candidatos e os pareceres abaixo são um exemplo, para você ver o app cheio; eles somem quando você cadastrar os seus.
                </AvisoExemplo>
              )}

              <section>
                <h2 className="section-title">O processo agora</h2>
                <div className="grid grid-cols-4 max-md:grid-cols-2 gap-3 [&>*]:min-w-0">
                  {inicio.indicadores.map((i) => (
                    <Indicador key={i.id} indicador={i} dias={inicio.dias} />
                  ))}
                </div>
              </section>

              <PrecisaDeVoce itens={inicio.pendencias} />
              <VagasAbertas vagas={inicio.vagas} total={inicio.totalVagasAbertas} />
            </>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          {inicio !== null && !vazio && faltaAlgo && <ComeceEm3Passos passos={inicio.passos} />}
        </aside>
      </main>
    </>
  );
}

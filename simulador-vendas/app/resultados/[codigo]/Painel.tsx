"use client";
// O painel de um treino, do lado do navegador (US-022).
//
// O gestor abre esta tela para responder uma pergunta só — "preciso agir?" — e a resposta tem de caber
// em dez segundos: quatro números, as competências em barra e uma frase dizendo o que fazer. O resto
// (quem é cada pessoa, como o time vai com cada tipo de cliente) mora nas outras duas abas.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Chip, Destaque, Empty, ErrorBox, Topbar, data, lerErro, useStatus, type ErroLido } from "@/components/ui";
import type { CompetenciaAgregada, PainelSimulacao } from "@/lib/painel-simulacao";
import { PREENCHIMENTO, contagem, nota, tomDaNota } from "./apresentacao";
import Equipe from "./Equipe";

type Resposta = { painel: PainelSimulacao; oportunidade: { frase: string; daIA: boolean } };

type Aba = "visao" | "equipe" | "personas";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "visao", rotulo: "Visão geral" },
  { id: "equipe", rotulo: "Equipe" },
  { id: "personas", rotulo: "Personas" },
];

const DIFICULDADES: Record<string, string> = { facil: "Fácil", realista: "Realista", dificil: "Difícil" };

const STATUS: Record<string, { rotulo: string; nivel: string }> = {
  ativa: { rotulo: "Ativo", nivel: "positivo" },
  pausada: { rotulo: "Pausado", nivel: "neutro" },
  encerrada: { rotulo: "Encerrado", nivel: "cinza" },
};

function IconeSemConversa() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16h24v16H22l-8 8v-8h-2z" />
      <path d="M30 34h22v16H40l-6 6v-6h-4z" />
    </svg>
  );
}

/**
 * Uma competência em barra horizontal. O desenho é um SVG próprio (dois retângulos: a régua de 0 a 10
 * e a nota), sem nenhuma dependência de gráfico: são dez, doze linhas e a escala é sempre a mesma.
 *
 * `preserveAspectRatio="none"` é o que deixa a barra acompanhar a largura da tela sem recalcular nada
 * no navegador; o arredondamento fica no invólucro, em CSS, porque esticar um `rx` deformaria a ponta.
 */
function BarraCompetencia({ competencia }: { competencia: CompetenciaAgregada }) {
  const tom = tomDaNota(competencia.nota);
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="text-sm font-semibold min-w-0 truncate">{competencia.nome}</span>
        <span className="text-[13px] text-muted shrink-0">{nota(competencia.nota)}</span>
      </div>
      <div className="h-2.5 rounded-chip overflow-hidden bg-line">
        <svg
          viewBox="0 0 100 10"
          preserveAspectRatio="none"
          className="block w-full h-full"
          role="img"
          aria-label={`${competencia.nome}: nota ${nota(competencia.nota)} de 10, em ${contagem(competencia.avaliacoes, "conversa", "conversas")}`}
        >
          <rect x="0" y="0" width={Math.max(0, Math.min(10, competencia.nota)) * 10} height="10" className={PREENCHIMENTO[tom]} />
        </svg>
      </div>
      <p className="text-[13px] text-muted mt-1">{`${competencia.grupo} · ${contagem(competencia.avaliacoes, "conversa", "conversas")}`}</p>
    </li>
  );
}

function VisaoGeral({ painel, oportunidade }: Resposta) {
  const variacao = painel.variacao;
  return (
    <>
      <div className="grid grid-cols-4 gap-5 max-md:grid-cols-2 mb-2">
        <Destaque
          valor={nota(painel.notaMedia)}
          rotulo="Nota média"
          tom={tomDaNota(painel.notaMedia)}
          interpretacao={painel.avaliadas === 0 ? "Nenhuma conversa avaliada ainda" : `Em ${contagem(painel.avaliadas, "conversa avaliada", "conversas avaliadas")}`}
        />
        <Destaque valor={String(painel.participantes)} rotulo="Participantes" interpretacao="Pessoas que abriram o link" />
        <Destaque valor={String(painel.sessoes)} rotulo="Sessões" interpretacao="Conversas abertas neste treino" />
        <Destaque
          valor={variacao === null ? "—" : `${variacao > 0 ? "+" : variacao < 0 ? "−" : ""}${nota(Math.abs(variacao))}`}
          rotulo="Evolução"
          tom={variacao === null ? "neutro" : variacao > 0 ? "ok" : variacao < 0 ? "danger" : "neutro"}
          interpretacao={
            variacao === null
              ? `Faltam conversas nos ${painel.dias} dias anteriores para comparar`
              : `Últimos ${painel.dias} dias contra os ${painel.dias} anteriores`
          }
        />
      </div>

      {painel.competencias.length > 0 && (
        <section className="mb-7">
          <h2 className="section-title">Competências do time</h2>
          <p className="apoio mb-4">Da mais fraca para a mais forte, somando todas as conversas já avaliadas deste treino.</p>
          <ul className="card px-5 py-5 flex flex-col gap-4 list-none">
            {painel.competencias.map((c) => (
              <BarraCompetencia key={c.id} competencia={c} />
            ))}
          </ul>
        </section>
      )}

      <section className="mb-7">
        <h2 className="section-title">Principal oportunidade do time</h2>
        <p className="summary !mb-2">{oportunidade.frase}</p>
        <p className="text-muted text-[13px]">
          {oportunidade.daIA
            ? "Escrito com Inteligência Artificial a partir dos números acima, sem ler as conversas."
            : "Calculado a partir dos números acima."}
        </p>
      </section>
    </>
  );
}

function EmBreve({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="card px-6 py-7">
      <h2 className="font-bold text-[17px] mb-1.5">{titulo}</h2>
      <p className="apoio">{descricao}</p>
    </div>
  );
}

export default function Painel({ codigo }: { codigo: string }) {
  const { status, erro } = useStatus();
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);
  const [aba, setAba] = useState<Aba>("visao");

  // Busca inicial em forma de corrente: `react-hooks/set-state-in-effect` acusa chamada direta a função
  // que mexe em estado no corpo do efeito, mesmo quando o estado só muda depois do await.
  useEffect(() => {
    fetch(`/api/resultados/${codigo}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo: Resposta) => setResposta(corpo))
      .catch(async (e) => setErroTela(await lerErro(e)));
  }, [codigo]);

  const painel = resposta?.painel;

  return (
    <>
      <Topbar marca="S" nome="Simulador de Vendas" area="Vendas" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[980px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Link href="/resultados" className="btn-link text-[13px]">
          ← Todos os resultados
        </Link>

        {erroTela && (
          <div className="mt-5">
            <ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao ?? { rotulo: "Voltar aos resultados", url: "/resultados" }} />
          </div>
        )}

        {!painel && !erroTela && <p className="text-muted text-sm mt-6">Carregando...</p>}

        {painel && resposta && (
          <>
            <div className="mt-3 mb-1.5 flex items-start justify-between gap-3 max-md:flex-col max-md:gap-2">
              <h1 className="titulo-painel">{painel.nome}</h1>
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap md:mt-3">
                {painel.exemplo && <Chip nivel="neutral">Exemplo</Chip>}
                <Chip nivel={STATUS[painel.status].nivel}>{STATUS[painel.status].rotulo}</Chip>
              </div>
            </div>
            <p className="apoio">{`${painel.produto} · ${painel.metodologia} · ${DIFICULDADES[painel.dificuldade] ?? painel.dificuldade}`}</p>
            <p className="text-muted text-[13px] mt-1 mb-6">
              {painel.sessoes === 0
                ? "Ninguém treinou ainda"
                : `${contagem(painel.sessoes, "sessão", "sessões")} · ${contagem(painel.participantes, "vendedor", "vendedores")} · ${
                    painel.notaMedia === null ? "sem nota ainda" : `nota média ${nota(painel.notaMedia)}`
                  }${painel.ultimaSessao ? ` · última em ${data(painel.ultimaSessao)}` : ""}`}
            </p>

            <div role="tablist" aria-label="Seções do painel" className="flex gap-1.5 border-b border-line mb-6 overflow-x-auto">
              {ABAS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  id={`aba-${a.id}`}
                  aria-selected={aba === a.id}
                  aria-controls={`painel-${a.id}`}
                  className={`text-sm font-semibold px-3.5 py-2.5 -mb-px border-b-2 whitespace-nowrap ${
                    aba === a.id ? "border-accent text-accent-ink" : "border-transparent text-muted hover:text-ink"
                  }`}
                  onClick={() => setAba(a.id)}
                >
                  {a.rotulo}
                </button>
              ))}
            </div>

            <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`}>
              {aba === "visao" &&
                (painel.sessoes === 0 ? (
                  <Empty
                    ilustracao={<IconeSemConversa />}
                    titulo="Ninguém treinou ainda"
                    descricao="Assim que a primeira pessoa abrir o link e conversar, a nota do time e as competências aparecem aqui."
                    acaoSecundaria={{ rotulo: "Ver o link deste treino", url: "/simulacoes" }}
                  />
                ) : (
                  <VisaoGeral painel={painel} oportunidade={resposta.oportunidade} />
                ))}

              {aba === "equipe" && <Equipe painel={painel} />}

              {aba === "personas" && (
                <EmBreve
                  titulo="Como o time vende para cada cliente"
                  descricao="Aqui vai ficar a nota do time por tipo de cliente — com quem ele vai bem e com quem ele trava. Por enquanto, o tipo de cliente aparece dentro de cada conversa avaliada."
                />
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}

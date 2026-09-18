"use client";
// As telas de resultado deste app, num arquivo só.
//
// São três formatos gravados no histórico (`lib/historico.ts`) e cada um tem duas camadas: o `Conteudo*`
// (o miolo, reaproveitado pela folha de impressão) e o `Resultado*` (o miolo com cabeçalho, origem e
// selo). Eles moram aqui, e não na tela que os mostra, porque cada um aparece em pelo menos três
// lugares — o painel do gestor (`/r/<id>`), a impressão (`/imprimir/<id>`), a sala de treino e o
// histórico do vendedor. Duplicá-los deixaria as cópias divergirem sem que lint, build ou teste
// falhassem, porque cada uma continuaria correta isoladamente.
//
//   - `Resultado`/`ConteudoAnalise`   → `tipo: "conversa"` (uma conversa real analisada, `lib/analise.ts`)
//   - `ResultadoSessao`/`ConteudoSessao` → `tipo: "sessao"` (um treino avaliado, `lib/avaliacao.ts`)
//   - `ResultadoPainel`/`ConteudoPainel` → `tipo: "painel"` (o resumo da equipe, `lib/painel-equipe.ts`)
import { useEffect, useState } from "react";
import { Aviso, Chip, CopyButton, DataTable, Destaque, Entregar, Item, Origem, ResultHead, Section, SeloIA, data, lerErro, numero } from "@/components/ui";
import { GraficoCriteriosFracos } from "@/components/GraficoCriteriosFracos";
import { VendedoresPainel } from "@/components/VendedoresPainel";
import type { Meta } from "@/lib/ai";
import type { Analise, Conversa, PainelEquipe } from "@/lib/types";
import type { AvaliacaoSessao, CriterioAvaliado } from "@/lib/avaliacao";

function tomDestaque(nota: number): "ok" | "warn" | "danger" {
  if (nota >= 7.5) return "ok";
  if (nota >= 5) return "warn";
  return "danger";
}

function tomChip(nota: number): "positivo" | "neutro" | "negativo" {
  if (nota >= 7.5) return "positivo";
  if (nota >= 5) return "neutro";
  return "negativo";
}

function interpretacaoNota(nota: number): string {
  if (nota >= 7.5) return "Conversa forte, boa referência para o time.";
  if (nota >= 5) return "Conversa satisfatória, com pontos claros para evoluir.";
  return "Conversa exige atenção antes da próxima ligação.";
}

function formatarSegundo(s?: number): string | null {
  if (s === undefined || s === null || !Number.isFinite(s)) return null;
  const min = Math.floor(s / 60);
  const seg = Math.floor(s % 60);
  return `${min}:${String(seg).padStart(2, "0")}`;
}

/**
 * `acoesDoGestor` liga as ações que só fazem sentido para quem administra o app (mandar a análise ao
 * vendedor, levar as notas ao CRM). A sala de treino (components/SalaSimulacao) renderiza este mesmo
 * componente para o vendedor, que não tem conta nem acesso a essas rotas, e troca o `demoTexto`: lá a
 * conversa exibida é a que o vendedor acabou de ter, só a avaliação é que é de exemplo.
 */
export function Resultado({ conversa, analise, meta, id, titulo, acoesDoGestor = false, demoTexto = "Exemplo fixo: a conversa da renovação em risco, não a que você colou." }: { conversa: Conversa; analise: Analise; meta: Meta; id?: string; titulo: string; acoesDoGestor?: boolean; demoTexto?: string }) {
  const [aviso, setAviso] = useState<{ tom: "ok" | "danger"; texto: string; acao?: { rotulo: string; url: string } } | null>(null);

  async function acao(caminho: string) {
    setAviso(null);
    try {
      const r = await fetch(caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resultadoId: id }) });
      if (!r.ok) {
        const info = await lerErro(r);
        setAviso({ tom: "danger", texto: info.mensagem, acao: info.acao });
        return;
      }
      const resposta = (await r.json()) as { mensagem: string };
      setAviso({ tom: "ok", texto: resposta.mensagem });
    } catch (e) {
      setAviso({ tom: "danger", texto: (await lerErro(e)).mensagem });
    }
  }

  const extras = acoesDoGestor && id
    ? [
        { rotulo: "Enviar a análise ao vendedor", onClick: () => void acao("/api/enviar-analise") },
        { rotulo: "Enviar as notas ao CRM", onClick: () => void acao("/api/crm") },
      ]
    : undefined;

  return (
    <article className="reveal">
      <ResultHead titulo={titulo} subtitulo={`${conversa.transcricao.length} falas · ${data(conversa.criadoEm)}`}>
        <Entregar id={id} titulo={titulo} texto={() => analiseParaTexto(analise)} extras={extras} />
      </ResultHead>

      <Origem meta={meta} demoTexto={demoTexto} />

      {aviso && (
        <div className="mb-4">
          <Aviso tom={aviso.tom} acao={aviso.acao ? { rotulo: aviso.acao.rotulo, url: aviso.acao.url } : undefined}>{aviso.texto}</Aviso>
        </div>
      )}

      <ConteudoAnalise conversa={conversa} analise={analise} />

      <SeloIA demo={meta.demo} />
    </article>
  );
}

/** Corpo da análise (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoAnalise({ conversa, analise }: { conversa: Conversa; analise: Analise }) {
  return (
    <>
      <Destaque valor={numero(analise.nota, 1)} rotulo="Nota geral" interpretacao={interpretacaoNota(analise.nota)} tom={tomDestaque(analise.nota)} />
      <p className="summary">{analise.resumo}</p>

      <Section titulo="Critérios de avaliação">
        <DataTable
          colunas={[
            { chave: "nome", titulo: "Critério", papel: "titulo", largura: "24%", render: (l) => <strong>{l.nome}</strong> },
            { chave: "nota", titulo: "Nota", papel: "chip", largura: "70px", render: (l) => <Chip nivel={tomChip(l.nota)}>{numero(l.nota, 1)}</Chip> },
            { chave: "evidencia", titulo: "Evidência", papel: "resumo", render: (l) => l.evidencia },
            { chave: "comoMelhorar", titulo: "Como melhorar", papel: "detalhe", render: (l) => l.comoMelhorar },
          ]}
          linhas={analise.criterios}
        />
      </Section>

      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5 mb-8">
        <Item>
          <h3 className="font-bold mb-2">Pontos fortes</h3>
          <ul className="text-sm text-muted flex flex-col gap-1.5">
            {analise.pontosFortes.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </Item>
        <Item>
          <h3 className="font-bold mb-2">O que melhorar</h3>
          <ul className="text-sm text-muted flex flex-col gap-1.5">
            {analise.oQueMelhorar.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </Item>
      </div>

      <Section titulo="Momentos-chave">
        <Item>
          <ul className="flex flex-col gap-2">
            {analise.momentos.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </Item>
      </Section>

      <details className="group">
        <summary className="text-[13px] font-bold text-accent-ink cursor-pointer marker:content-none flex items-center gap-1.5">
          <span className="transition-transform group-open:rotate-90">›</span>
          Ver a conversa completa
        </summary>
        <div className="mt-3 card shadow-none divide-y divide-line text-sm">
          {conversa.transcricao.map((l, i) => {
            const tempo = formatarSegundo(l.segundo);
            return (
              <div key={i} className="px-4 py-2.5">
                <span className="font-bold">{l.papel === "vendedor" ? "Vendedor" : "Cliente"}</span>
                {tempo && <span className="text-muted text-[12px]"> · {tempo}</span>}
                <p className="mt-0.5">{l.texto}</p>
              </div>
            );
          })}
        </div>
      </details>
    </>
  );
}

function analiseParaTexto(analise: Analise): string {
  const l: string[] = [`Nota geral: ${numero(analise.nota, 1)}`, "", analise.resumo, "", "Critérios:"];
  analise.criterios.forEach((c) => l.push(`- ${c.nome} (${numero(c.nota, 1)}): ${c.evidencia} | Como melhorar: ${c.comoMelhorar}`));
  l.push("", "Pontos fortes:");
  analise.pontosFortes.forEach((p) => l.push(`- ${p}`));
  l.push("", "O que melhorar:");
  analise.oQueMelhorar.forEach((p) => l.push(`- ${p}`));
  l.push("", "Momentos-chave:");
  analise.momentos.forEach((m) => l.push(`- ${m}`));
  return l.join("\n");
}

// ---------------------------------------------------------------------------
// A avaliação de uma sessão de treino (US-018)
// ---------------------------------------------------------------------------

const DIFICULDADES_ROTULO: Record<string, string> = { facil: "Cliente fácil", realista: "Cliente realista", dificil: "Cliente difícil" };

/** A frase que traduz a nota, em vez de deixar o número sozinho. */
export function leituraDaNota(nota: number): string {
  if (nota >= 8.5) return "Conversa muito bem conduzida.";
  if (nota >= 7) return "Bom desempenho, com pontos claros para evoluir.";
  if (nota >= 5) return "Conversa razoável: dá para melhorar bastante na próxima.";
  return "Esta conversa pede treino antes de falar com um cliente de verdade.";
}

/**
 * A avaliação de um treino: os quatro momentos, a régua inteira, o que foi bem e a principal
 * oportunidade. Reaproveitada pela tela do gestor (/r), pela impressão e pela sala do vendedor —
 * um treino avaliado é a mesma coisa nos três lugares, só a moldura em volta muda.
 */
export function ConteudoSessao({ conversa, avaliacao, copiarFrase = false }: { conversa: Conversa; avaliacao: AvaliacaoSessao; copiarFrase?: boolean }) {
  const c = avaliacao.contexto;
  return (
    <>
      <Destaque valor={numero(avaliacao.notaGeral, 1)} rotulo="Nota geral" interpretacao={leituraDaNota(avaliacao.notaGeral)} tom={tomDestaque(avaliacao.notaGeral)} />
      {avaliacao.resumo && <p className="summary">{avaliacao.resumo}</p>}

      <p className="text-muted text-[13px] mb-6">
        {[c.produto, c.metodologia, DIFICULDADES_ROTULO[c.dificuldade] ?? c.dificuldade, c.tipoDeCliente?.nome].filter(Boolean).join(" · ")}
      </p>

      {avaliacao.grupos.length > 0 && (
        <Section titulo="Como foi cada momento da conversa">
          <div className="grid grid-cols-4 max-md:grid-cols-2 gap-3 [&>*]:min-w-0">
            {avaliacao.grupos.map((g) => (
              <Item key={g.grupo}>
                <div className={`text-[26px] leading-none font-extrabold tracking-[-0.02em] ${g.nota >= 7.5 ? "text-ok" : g.nota >= 5 ? "text-warn" : "text-danger"}`}>{numero(g.nota, 1)}</div>
                <div className="text-[12.5px] font-semibold text-muted mt-1.5">{g.grupo}</div>
              </Item>
            ))}
          </div>
        </Section>
      )}

      {avaliacao.pontosFortes.length > 0 && (
        <Section titulo="O que você fez bem">
          <Item>
            <ul className="text-sm flex flex-col gap-1.5">
              {avaliacao.pontosFortes.map((ponto, i) => <li key={i}>{ponto}</li>)}
            </ul>
          </Item>
        </Section>
      )}

      {avaliacao.oportunidade && (
        <Section titulo="Principal oportunidade">
          <Item>
            <div className="text-[13px] font-bold text-accent-ink mb-2">{avaliacao.oportunidade.criterio}</div>
            <p className="text-sm mb-2">{avaliacao.oportunidade.oQueAconteceu}</p>
            <p className="text-sm mb-3">{avaliacao.oportunidade.oQueFazer}</p>
            {avaliacao.oportunidade.fraseSugerida && (
              <>
                <div className="text-muted text-[12.5px] font-semibold uppercase tracking-[0.04em] mb-1">Experimente dizer</div>
                <p className="text-sm italic">{`“${avaliacao.oportunidade.fraseSugerida}”`}</p>
                {/* O botão de copiar existe na tela de quem treina (US-019): a frase é para levar para a
                    próxima conversa, e no celular selecionar um texto em itálico é trabalhoso. Na tela do
                    gestor e na impressão ele não aparece — lá a entrega inteira já tem "Copiar texto". */}
                {copiarFrase && (
                  <div className="mt-3">
                    <CopyButton texto={() => avaliacao.oportunidade?.fraseSugerida ?? ""} rotulo="Copiar frase" />
                  </div>
                )}
              </>
            )}
          </Item>
        </Section>
      )}

      <Section titulo="Critérios de avaliação">
        <DataTable
          colunas={[
            { chave: "nome", titulo: "Critério", papel: "titulo", largura: "22%", render: (l: CriterioAvaliado) => <strong>{l.nome}</strong> },
            { chave: "nota", titulo: "Nota", papel: "chip", largura: "70px", render: (l: CriterioAvaliado) => <Chip nivel={tomChip(l.nota)}>{numero(l.nota, 1)}</Chip> },
            {
              chave: "evidencia",
              titulo: "Na conversa",
              papel: "resumo",
              render: (l: CriterioAvaliado) => (l.semEvidencia ? <span className="text-muted">Sem trecho da conversa para citar aqui.</span> : l.evidencia),
            },
            { chave: "comoMelhorar", titulo: "Como melhorar", papel: "detalhe", render: (l: CriterioAvaliado) => l.comoMelhorar },
          ]}
          linhas={avaliacao.criterios}
        />
      </Section>

      <details className="group">
        <summary className="text-[13px] font-bold text-accent-ink cursor-pointer marker:content-none flex items-center gap-1.5">
          <span className="transition-transform group-open:rotate-90">›</span>
          Ver a conversa
        </summary>
        <div className="mt-3 card shadow-none divide-y divide-line text-sm">
          {conversa.transcricao.map((l, i) => {
            const tempo = formatarSegundo(l.segundo);
            return (
              <div key={i} className="px-4 py-2.5">
                <span className="font-bold">{l.papel === "vendedor" ? "Vendedor" : "Cliente"}</span>
                {tempo && <span className="text-muted text-[12px]"> · {tempo}</span>}
                <p className="mt-0.5">{l.texto}</p>
              </div>
            );
          })}
        </div>
      </details>
    </>
  );
}

function sessaoParaTexto(avaliacao: AvaliacaoSessao): string {
  const l: string[] = [`Nota geral: ${numero(avaliacao.notaGeral, 1)}`, "", avaliacao.resumo, ""];
  l.push(`Momentos: ${avaliacao.grupos.map((g) => `${g.grupo} ${numero(g.nota, 1)}`).join(" · ")}`, "", "Critérios:");
  avaliacao.criterios.forEach((c) => l.push(`- ${c.nome} (${numero(c.nota, 1)}): ${c.evidencia || "sem trecho citado"} | Como melhorar: ${c.comoMelhorar}`));
  l.push("", "O que foi bem:");
  avaliacao.pontosFortes.forEach((p) => l.push(`- ${p}`));
  if (avaliacao.oportunidade) {
    l.push("", `Principal oportunidade — ${avaliacao.oportunidade.criterio}:`, avaliacao.oportunidade.oQueAconteceu, avaliacao.oportunidade.oQueFazer);
    if (avaliacao.oportunidade.fraseSugerida) l.push(`Experimente dizer: "${avaliacao.oportunidade.fraseSugerida}"`);
  }
  return l.join("\n");
}

/**
 * A avaliação com cabeçalho, origem e selo — o molde de `Resultado`, aplicado ao treino.
 *
 * `entregar` sai desligado nas telas do **vendedor**: as ações de entrega levam a `/imprimir/<id>` e a
 * `/r/<id>`, que são rotas privadas (ver `proxy.ts`) e jogariam na tela de entrar quem abriu o app por
 * um link de treino, sem conta nenhuma. Quem tem conta é o gestor, e é na tela dele que elas aparecem.
 */
export function ResultadoSessao({ conversa, avaliacao, meta, id, titulo, entregar = true, copiarFrase = false, demoTexto = "Exemplo fixo: as notas abaixo não são um julgamento desta conversa." }: { conversa: Conversa; avaliacao: AvaliacaoSessao; meta: Meta; id?: string; titulo: string; entregar?: boolean; copiarFrase?: boolean; demoTexto?: string }) {
  return (
    <article className="reveal">
      <ResultHead titulo={titulo} subtitulo={`${conversa.transcricao.length} falas · ${data(conversa.criadoEm)}`}>
        {entregar ? <Entregar id={id} titulo={titulo} texto={() => sessaoParaTexto(avaliacao)} /> : undefined}
      </ResultHead>

      <Origem meta={meta} demoTexto={demoTexto} />

      <ConteudoSessao conversa={conversa} avaliacao={avaliacao} copiarFrase={copiarFrase} />

      <SeloIA demo={meta.demo} />
    </article>
  );
}

function tomVariacaoPainel(variacao: number | null): "ok" | "warn" | "danger" | "neutro" {
  if (variacao === null) return "neutro";
  if (variacao > 0) return "ok";
  if (variacao < 0) return "danger";
  return "neutro";
}

function interpretacaoVariacaoPainel(variacao: number | null): string {
  if (variacao === null) return "Sem conversas suficientes no período anterior para comparar.";
  const sinal = variacao > 0 ? "+" : "";
  return `${sinal}${numero(variacao, 1)} em relação aos 30 dias anteriores`;
}

export function ResultadoPainel({ painel, meta, id, titulo }: { painel: PainelEquipe; meta: Meta; id?: string; titulo: string }) {
  return (
    <article className="reveal">
      <ResultHead titulo={titulo} subtitulo={`${painel.vendedores.length} vendedor${painel.vendedores.length === 1 ? "" : "es"} com conversas no período`}>
        <Entregar id={id} titulo={titulo} texto={() => painelParaTexto(painel)} extras={[{ rotulo: "Baixar notas da equipe (CSV)", onClick: () => exportarNotasEquipeCSV(painel) }]} />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoPainel painel={painel} />

      <ReceberResumoEquipe />
    </article>
  );
}

type EstadoNotificacoes = { configurada: boolean; canal: "email" | "slack"; destino: string };
type RotinaResumoEquipe = { id: string; tipo: string };

/** Depois de ver o painel, oferece uma rotina semanal (toda sexta às 17h) com o resumo da equipe: conversas
 * da semana, nota média, quem mais evoluiu, quem não treinou e o critério mais fraco. Ao contrário da rotina
 * semanal do Radar de Sinais, não tem parâmetro nenhum (é sempre a mesma equipe), então só existe uma. */
function ReceberResumoEquipe() {
  const [notificacoes, setNotificacoes] = useState<EstadoNotificacoes | null>(null);
  const [rotinaId, setRotinaId] = useState<string | null | undefined>(undefined);
  const [criando, setCriando] = useState(false);
  const [erroRotina, setErroRotina] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        const integracao = (d.integracoes || []).find((i: { id: string }) => i.id === "notificacoes");
        const campos: { chave: string; valorVisivel?: string }[] = integracao?.campos || [];
        const canal = campos.find((c) => c.chave === "NOTIFICACOES_CANAL")?.valorVisivel === "slack" ? "slack" : "email";
        const destino = campos.find((c) => c.chave === "NOTIFICACOES_DESTINO")?.valorVisivel || "";
        setNotificacoes({ configurada: Boolean(integracao?.configurada), canal, destino });
      })
      .catch(() => setNotificacoes({ configurada: false, canal: "email", destino: "" }));
    fetch("/api/rotinas")
      .then((r) => r.json())
      .then((d) => {
        const existente = (d.itens || []).find((i: RotinaResumoEquipe) => i.tipo === "resumo-equipe");
        setRotinaId(existente?.id ?? null);
      })
      .catch(() => setRotinaId(null));
  }, []);

  async function criar() {
    if (!notificacoes?.configurada) return;
    setCriando(true);
    setErroRotina(null);
    try {
      const r = await fetch("/api/rotinas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "resumo-equipe", frequencia: "semanal", diaSemana: 5, hora: "17:00", canal: notificacoes.canal, destino: notificacoes.canal === "email" ? notificacoes.destino || undefined : undefined }),
      });
      if (!r.ok) {
        setErroRotina((await lerErro(r)).mensagem);
        return;
      }
      const d = await r.json();
      setRotinaId(d.id);
    } catch (e) {
      setErroRotina((await lerErro(e)).mensagem);
    } finally {
      setCriando(false);
    }
  }

  if (rotinaId === undefined || notificacoes === null) return null;

  return (
    <Item className="mt-4">
      {rotinaId ? (
        <p className="text-muted text-sm">Você já recebe o resumo da equipe toda sexta às 17h.</p>
      ) : notificacoes.configurada ? (
        <>
          <button type="button" className="btn-ghost !w-auto" onClick={criar} disabled={criando}>
            {criando ? "Criando..." : "Receber o resumo toda semana"}
          </button>
          {erroRotina && <div className="mt-2.5"><Aviso tom="danger">{erroRotina}</Aviso></div>}
        </>
      ) : (
        <>
          <a href="/setup#notificacoes" className="btn-ghost !w-auto">Receber o resumo toda semana</a>
          <p className="text-[12.5px] text-muted mt-2">Precisa das Notificações configuradas para o resumo chegar até você.</p>
        </>
      )}
    </Item>
  );
}

/** Corpo do painel (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoPainel({ painel }: { painel: PainelEquipe }) {
  const variacao = painel.notaMediaAnterior === null ? null : Math.round((painel.notaMedia - painel.notaMediaAnterior) * 10) / 10;
  return (
    <>
      <Destaque
        valor={numero(painel.notaMedia, 1)}
        rotulo={`Nota média da equipe (últimos ${painel.dias} dias)`}
        interpretacao={interpretacaoVariacaoPainel(variacao)}
        tom={tomVariacaoPainel(variacao)}
      />

      <Section titulo="Vendedores">
        <VendedoresPainel vendedores={painel.vendedores} />
      </Section>

      <Section titulo="Critérios mais fracos da equipe">
        <Item>
          <GraficoCriteriosFracos criterios={painel.criteriosFracos} />
        </Item>
      </Section>
    </>
  );
}

function painelParaTexto(painel: PainelEquipe): string {
  const l: string[] = [`Painel da equipe — últimos ${painel.dias} dias`, `Nota média: ${numero(painel.notaMedia, 1)}`, ""];
  l.push("Vendedores:");
  painel.vendedores.forEach((v) => l.push(`- ${v.nome}: ${numero(v.notaMedia, 1)} (${v.conversas} conversa${v.conversas === 1 ? "" : "s"}, tendência ${v.tendencia}, critério mais fraco: ${v.criterioMaisFraco})`));
  l.push("", "Critérios mais fracos da equipe:");
  painel.criteriosFracos.forEach((c) => l.push(`- ${c.nome}: ${numero(c.notaMedia, 1)}`));
  return l.join("\n");
}

function exportarNotasEquipeCSV(painel: PainelEquipe) {
  const cabecalho = ["Vendedor", "Conversas", "Nota média", "Tendência", "Critério mais fraco", "Última conversa"];
  const linhas = [cabecalho.join(";")];
  painel.vendedores.forEach((v) => {
    const campos = [v.nome, String(v.conversas), numero(v.notaMedia, 1), v.tendencia, v.criterioMaisFraco, v.ultimaConversa ? data(v.ultimaConversa) : ""];
    linhas.push(campos.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"));
  });
  const csv = "﻿" + linhas.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "notas-equipe.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

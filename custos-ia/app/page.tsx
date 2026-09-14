"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Chip,
  DataTable,
  Destaque,
  Empty,
  Entregar,
  ErrorBox,
  Field,
  Loading,
  MaisDetalhes,
  Origem,
  Panel,
  Privacidade,
  ResultHead,
  Section,
  Stage,
  Topbar,
  Workspace,
  data,
  numero,
  useScrollToResult,
  useStatus,
} from "@/components/ui";
import { GraficoGastoPlanejado } from "@/components/GraficoGastoPlanejado";
import { OrcamentoPlanejado } from "@/components/OrcamentoPlanejado";
import { LancarManualmente } from "@/components/LancarManualmente";
import { EnviarNotas, PreviaNotas, type ResultadoUpload } from "@/components/EnviarNotas";
import { ResumoImportacao } from "@/components/ImportarEmail";
import { ReceberFechamento } from "@/components/ReceberFechamento";
import type { Meta } from "@/lib/ai";
import type { Alerta, Fatura, Leitura, Periodo, ResultadoImportacao } from "@/lib/types";

const ETAPAS_CARREGANDO = ["Lendo as faturas do período...", "Comparando com o orçamento planejado...", "Montando o resultado..."];
const ETAPAS_LENDO_NOTAS = ["Abrindo os arquivos...", "Reconhecendo fornecedor, valor e data...", "Montando a prévia..."];
const ETAPAS_IMPORTANDO = ["Abrindo a caixa de e-mail...", "Procurando notas e recibos no período...", "Reconhecendo fornecedor, valor e data...", "Lançando as faturas..."];

/** O botão "Ler as notas do e-mail" usa o mesmo período escolhido para o gasto. */
const DIAS_DO_PERIODO: Record<Periodo, 30 | 90 | 365> = { mes: 30, "3meses": 90, ano: 365 };

const ROTULOS_PERIODICIDADE: Record<Fatura["periodicidade"], string> = { mensal: "Mensal", anual: "Anual", unica: "Única" };
const ROTULOS_ORIGEM: Record<Fatura["origem"], string> = { email: "Lida do e-mail", upload: "Enviada por upload", manual: "Lançada manualmente" };

/** Ilustração de barras crescentes com um "R$" no lugar de um glifo genérico no estado vazio. */
function IlustracaoGasto() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 54h48" />
      <rect x="14" y="34" width="9" height="20" />
      <rect x="28" y="22" width="9" height="32" />
      <rect x="42" y="12" width="9" height="42" />
      <text x="46" y="10" textAnchor="middle" fontSize="9" stroke="none" fill="currentColor">R$</text>
    </svg>
  );
}

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "lendo-notas" }
  | { fase: "previa"; resultado: ResultadoUpload }
  | { fase: "importando" }
  | { fase: "importado"; resultado: ResultadoImportacao }
  | { fase: "pronto"; leitura: Leitura; faturas: Fatura[]; meta: Meta; id?: string };

export default function Page() {
  const { status, erro } = useStatus();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [enviarNotasAberto, setEnviarNotasAberto] = useState(false);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto" || estado.fase === "previa" || estado.fase === "importado");

  async function gerar(periodoEscolhido: Periodo) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch(`/api/leitura?periodo=${periodoEscolhido}`);
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Falha ao ler o gasto com IA.");
      setEstado({ fase: "pronto", leitura: resposta.leitura, faturas: resposta.faturas, meta: resposta.meta, id: resposta.id });
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." });
    }
  }

  async function importarEmail() {
    setEstado({ fase: "importando" });
    try {
      const r = await fetch("/api/faturas/importar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dias: DIAS_DO_PERIODO[periodo] }) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível ler as notas do e-mail.");
      setEstado({ fase: "importado", resultado: resposta as ResultadoImportacao });
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado ao ler o e-mail." });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    gerar(periodo);
  }

  // Atalho para demonstrações: /?exemplo=1 dispara a leitura do mês atual sozinho.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => gerar("mes"), 0);
    }
  }, []);

  const carregando = estado.fase === "carregando";
  const importando = estado.fase === "importando";
  const gmailConectado = Boolean(status?.integrations?.gmail);
  const podeImportar = gmailConectado && Boolean(status?.ai);
  const dicaEmail = !status
    ? "Conecte seu e-mail para ler as notas sozinho"
    : !gmailConectado
      ? "Conecte seu e-mail para ler as notas sozinho"
      : !status.ai
        ? "Conecte a inteligência artificial para reconhecer as notas do e-mail"
        : `Busca notas e recibos dos últimos ${DIAS_DO_PERIODO[periodo]} dias na caixa conectada e lança o que reconhecer`;

  return (
    <>
      <Topbar marca="C" nome="Custos de IA" area="Financeiro" status={status} erro={erro} resumo="Modo demonstração: o gasto exibido é um exemplo com dados fictícios." />

      <Workspace>
        <Panel titulo="Saiba quanto sua empresa gasta com IA" lead="Escolha o período e veja o gasto total com ferramentas de IA comparado ao orçamento planejado.">
          <form onSubmit={onSubmit}>
            <Field label="Período" htmlFor="periodo">
              <select id="periodo" className="input" value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
                <option value="mes">Mês atual</option>
                <option value="3meses">Últimos 3 meses</option>
                <option value="ano">Último ano</option>
              </select>
            </Field>

            <div className="flex flex-col gap-2.5 mb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <button type="button" className="btn-ghost !w-auto" disabled={!podeImportar || importando || carregando} onClick={importarEmail} title={podeImportar ? undefined : dicaEmail}>
                  {importando ? "Lendo o e-mail" : "Ler as notas do e-mail"}
                </button>
                {status && !gmailConectado ? (
                  <Link href="/setup#gmail" className="text-[12.5px] text-muted underline">{dicaEmail}</Link>
                ) : status && gmailConectado && !status.ai ? (
                  <Link href="/setup#openrouter" className="text-[12.5px] text-muted underline">{dicaEmail}</Link>
                ) : (
                  <span className="text-[12.5px] text-muted">{dicaEmail}</span>
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button type="button" className="btn-ghost !w-auto" aria-expanded={enviarNotasAberto} aria-controls="enviar-notas" onClick={() => setEnviarNotasAberto((v) => !v)}>
                  {enviarNotasAberto ? "Fechar envio de notas" : "Enviar notas em PDF"}
                </button>
                <span className="text-[12.5px] text-muted">Até 10 notas por vez; você confere antes de gravar</span>
              </div>
              {enviarNotasAberto && (
                <div id="enviar-notas" className="mt-1.5">
                  <EnviarNotas
                    onInicio={() => setEstado({ fase: "lendo-notas" })}
                    onLido={(resultado) => setEstado({ fase: "previa", resultado })}
                    onErro={(mensagem) => setEstado({ fase: "erro", mensagem })}
                  />
                </div>
              )}
            </div>

            <button type="submit" className="btn-primary" disabled={carregando}>
              {carregando ? "Lendo o período" : "Ver gasto do período"}
            </button>
          </form>
          <Privacidade detalhe="As faturas lançadas ficam só neste app; apague quando quiser." />

          <MaisDetalhes titulo="Orçamento planejado">
            <OrcamentoPlanejado onSalvo={() => gerar(periodo)} />
          </MaisDetalhes>

          <MaisDetalhes titulo="Lançar manualmente">
            <LancarManualmente onLancado={() => gerar(periodo)} />
          </MaisDetalhes>
        </Panel>

        <Stage>
          {estado.fase === "vazio" && (
            <Empty
              ilustracao={<IlustracaoGasto />}
              titulo="O gasto aparece aqui"
              descricao="Total do período, variação contra o mês anterior, gasto por ferramenta contra o orçamento planejado e a lista de faturas."
              acao="Ver um exemplo"
              onAcao={() => gerar(periodo)}
            />
          )}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "lendo-notas" && <Loading etapas={ETAPAS_LENDO_NOTAS} />}
          {estado.fase === "importando" && <Loading etapas={ETAPAS_IMPORTANDO} />}
          {estado.fase === "importado" && <ResumoImportacao resultado={estado.resultado} onVerGasto={() => gerar(periodo)} />}
          {estado.fase === "previa" && (
            <PreviaNotas
              key={estado.resultado.reconhecidas.map((f) => f.id).join(",")}
              resultado={estado.resultado}
              onConfirmado={() => {
                setEnviarNotasAberto(false);
                gerar(periodo);
              }}
              onCancelar={() => setEstado({ fase: "vazio" })}
            />
          )}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} onTentarNovamente={() => gerar(periodo)} />}
          {estado.fase === "pronto" && <Resultado leitura={estado.leitura} faturas={estado.faturas} meta={estado.meta} id={estado.id} />}
        </Stage>
      </Workspace>
    </>
  );
}

function tomDaDiferenca(diferenca: number, planejadoBRL: number): "ok" | "warn" | "danger" {
  if (diferenca <= 0) return "ok";
  const proporcao = planejadoBRL > 0 ? diferenca / planejadoBRL : 1;
  return proporcao > 0.1 ? "danger" : "warn";
}

export function Resultado({ leitura, faturas, meta, id }: { leitura: Leitura; faturas: Fatura[]; meta: Meta; id?: string }) {
  return (
    <article className="reveal">
      <ResultHead titulo={`Gasto com IA de ${leitura.mesAtual}`}>
        <Entregar
          id={id}
          titulo={`Gasto com IA de ${leitura.mesAtual}`}
          texto={() => leituraParaTexto(leitura, faturas)}
          extras={[{ rotulo: "Baixar faturas (CSV)", onClick: () => exportarFaturasCSV(faturas, leitura.mesAtual) }]}
        />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoLeitura leitura={leitura} faturas={faturas} />

      <ReceberFechamento />
    </article>
  );
}

/** Corpo da leitura (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoLeitura({ leitura, faturas }: { leitura: Leitura; faturas: Fatura[] }) {
  const diferenca = leitura.totalBRL - leitura.planejadoBRL;
  const tom = tomDaDiferenca(diferenca, leitura.planejadoBRL);
  const interpretacao =
    diferenca > 0
      ? `R$ ${numero(diferenca, 2)} acima do planejado (R$ ${numero(leitura.planejadoBRL, 2)})`
      : diferenca < 0
        ? `R$ ${numero(Math.abs(diferenca), 2)} abaixo do planejado (R$ ${numero(leitura.planejadoBRL, 2)})`
        : `Exatamente dentro do planejado (R$ ${numero(leitura.planejadoBRL, 2)})`;

  const maxFerramenta = Math.max(...leitura.porFerramenta.map((f) => f.totalBRL), 1);
  const alertas = leitura.alertas ?? [];

  return (
    <>
      <Destaque valor={`R$ ${numero(leitura.totalBRL, 2)}`} rotulo={`Gasto de ${leitura.mesAtual}`} interpretacao={interpretacao} tom={tom} />

      <p className="summary">
        {leitura.variacaoMesAnterior > 0 ? "Alta" : leitura.variacaoMesAnterior < 0 ? "Queda" : "Estabilidade"} de{" "}
        {numero(Math.abs(leitura.variacaoMesAnterior), 1)}% em relação ao mês anterior.
      </p>

      <Section titulo="Alertas">
        {alertas.length === 0 ? (
          <p className="text-muted text-sm">Nenhum alerta no período: nenhuma ferramenta passou do planejado e nenhuma assinatura nova apareceu.</p>
        ) : (
          <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
            {alertas.map((a) => (
              <li key={`${a.tipo}-${a.alvo}-${a.mes}`} className="flex items-start gap-2.5 flex-wrap">
                <span className="shrink-0 pt-px"><Chip nivel={a.nivel}>{a.titulo}</Chip></span>
                <span className="text-sm flex-1 min-w-[200px]">{a.descricao}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section titulo="Gasto contra o planejado, mês a mês">
        <GraficoGastoPlanejado meses={leitura.porMes} />
      </Section>

      <Section titulo="Gasto por ferramenta">
        {leitura.porFerramenta.length === 0 ? (
          <p className="text-muted text-sm">Nenhuma fatura no período.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {leitura.porFerramenta.map((f) => {
              const largura = Math.max((f.totalBRL / maxFerramenta) * 100, 2);
              return (
                <div key={f.ferramenta} className="flex items-center gap-2.5 flex-wrap">
                  <span className="w-[160px] shrink-0 text-[13px] text-muted text-right truncate" title={f.ferramenta}>
                    {f.ferramenta}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`h-7 rounded-[4px] ${f.acimaDoPlanejado ? "bg-danger" : "bg-accent"}`}
                      style={{ width: `${largura}%` }}
                      title={`${f.ferramenta}: R$ ${numero(f.totalBRL, 2)}`}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-[13px] font-bold text-ink">R$ {numero(f.totalBRL, 0)}</span>
                  {f.acimaDoPlanejado && <Chip nivel="alta">Acima do planejado</Chip>}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section titulo="Faturas do período">
        {faturas.length === 0 ? (
          <p className="text-muted text-sm">Nenhuma fatura lançada neste período ainda.</p>
        ) : (
          <DataTable
            colunas={[
              {
                chave: "fornecedor",
                titulo: "Fornecedor",
                papel: "titulo",
                largura: "24%",
                render: (f: Fatura) => {
                  const alerta = alertaDaFatura(alertas, f);
                  return (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <strong>{f.fornecedor}</strong>
                      {alerta && <Chip nivel={alerta.nivel}>{alerta.titulo}</Chip>}
                    </span>
                  );
                },
              },
              { chave: "ferramenta", titulo: "Ferramenta", papel: "resumo", render: (f: Fatura) => `${f.ferramenta} · ${ROTULOS_PERIODICIDADE[f.periodicidade]}` },
              { chave: "valor", titulo: "Valor", papel: "chip", largura: "110px", render: (f: Fatura) => <span className="font-bold">R$ {numero(f.valorBRL, 2)}</span> },
              { chave: "data", titulo: "Data", papel: "detalhe", render: (f: Fatura) => data(new Date(`${f.data}T00:00:00`), { comAno: true }) },
              { chave: "origem", titulo: "Origem", papel: "detalhe", render: (f: Fatura) => ROTULOS_ORIGEM[f.origem] },
            ]}
            linhas={faturas}
          />
        )}
      </Section>
    </>
  );
}

/** Alerta que marca esta fatura: estouro da ferramenta no mês da fatura, ou fornecedor novo nesse mês. */
function alertaDaFatura(alertas: Alerta[], f: Fatura): Alerta | undefined {
  const mes = f.data.slice(0, 7);
  return (
    alertas.find((a) => a.mes === mes && a.tipo === "acima-do-planejado" && a.alvo === f.ferramenta) ??
    alertas.find((a) => a.mes === mes && a.tipo === "assinatura-nova" && a.alvo === f.fornecedor)
  );
}

function leituraParaTexto(leitura: Leitura, faturas: Fatura[]) {
  const l: string[] = [
    `Gasto com IA de ${leitura.mesAtual}`,
    "",
    `Total: R$ ${numero(leitura.totalBRL, 2)}`,
    `Planejado: R$ ${numero(leitura.planejadoBRL, 2)}`,
    `Variação em relação ao mês anterior: ${numero(leitura.variacaoMesAnterior, 1)}%`,
    "",
    "Por ferramenta:",
  ];
  leitura.porFerramenta.forEach((f) => l.push(`- ${f.ferramenta}: R$ ${numero(f.totalBRL, 2)}${f.acimaDoPlanejado ? " (acima do planejado)" : ""}`));
  l.push("", "Alertas:");
  if ((leitura.alertas ?? []).length === 0) l.push("- Nenhum alerta no período");
  (leitura.alertas ?? []).forEach((a) => l.push(`- ${a.titulo}: ${a.descricao}`));
  l.push("", "Faturas do período:");
  faturas.forEach((f) => l.push(`- ${f.data} · ${f.fornecedor} (${f.ferramenta}): R$ ${numero(f.valorBRL, 2)}`));
  return l.join("\n");
}

/** Baixa as faturas do período em CSV (separador ";" e BOM, para abrir direto no Excel em português). */
function exportarFaturasCSV(faturas: Fatura[], mesAtual: string) {
  const cabecalho = ["Data", "Fornecedor", "Ferramenta", "Categoria", "Valor", "Moeda", "Valor em reais", "Periodicidade", "Origem", "Referência"];
  const linhas = [cabecalho.join(";")];
  faturas.forEach((f) => {
    const campos = [f.data, f.fornecedor, f.ferramenta, f.categoria, numero(f.valor, 2), f.moeda, numero(f.valorBRL, 2), ROTULOS_PERIODICIDADE[f.periodicidade], ROTULOS_ORIGEM[f.origem], f.referencia ?? ""];
    linhas.push(campos.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"));
  });
  const csv = "\ufeff" + linhas.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `faturas-ia-${mesAtual.replace(/\s+/g, "-")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

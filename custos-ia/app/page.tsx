"use client";

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
import type { Meta } from "@/lib/ai";
import type { Fatura, Leitura, Periodo } from "@/lib/types";

const ETAPAS_CARREGANDO = ["Lendo as faturas do período...", "Comparando com o orçamento planejado...", "Montando o resultado..."];
const ETAPAS_LENDO_NOTAS = ["Abrindo os arquivos...", "Reconhecendo fornecedor, valor e data...", "Montando a prévia..."];

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
  | { fase: "pronto"; leitura: Leitura; faturas: Fatura[]; meta: Meta; id?: string };

export default function Page() {
  const { status, erro } = useStatus();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [enviarNotasAberto, setEnviarNotasAberto] = useState(false);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto" || estado.fase === "previa");

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
                <button type="button" className="btn-ghost !w-auto" disabled title="Conecte seu e-mail para ler as notas sozinho">
                  Ler as notas do e-mail
                </button>
                <span className="text-[12.5px] text-muted">Conecte seu e-mail para ler as notas sozinho</span>
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
        <Entregar id={id} titulo={`Gasto com IA de ${leitura.mesAtual}`} texto={() => leituraParaTexto(leitura, faturas)} />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoLeitura leitura={leitura} faturas={faturas} />
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

  return (
    <>
      <Destaque valor={`R$ ${numero(leitura.totalBRL, 2)}`} rotulo={`Gasto de ${leitura.mesAtual}`} interpretacao={interpretacao} tom={tom} />

      <p className="summary">
        {leitura.variacaoMesAnterior > 0 ? "Alta" : leitura.variacaoMesAnterior < 0 ? "Queda" : "Estabilidade"} de{" "}
        {numero(Math.abs(leitura.variacaoMesAnterior), 1)}% em relação ao mês anterior.
      </p>

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
              { chave: "fornecedor", titulo: "Fornecedor", papel: "titulo", largura: "24%", render: (f: Fatura) => <strong>{f.fornecedor}</strong> },
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
  l.push("", "Faturas do período:");
  faturas.forEach((f) => l.push(`- ${f.data} · ${f.fornecedor} (${f.ferramenta}): R$ ${numero(f.valorBRL, 2)}`));
  return l.join("\n");
}

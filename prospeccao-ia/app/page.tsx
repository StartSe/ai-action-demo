"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Aviso, Chip, CopyButton, DataTable, Entregar, Item, MaisDetalhes, ResultHead, Section, data, lerErro, type Coluna } from "@/components/ui";
import { ACAO_BUSCA_DE_LEADS, ACAO_CONFERIR_CRM, ACAO_NOTIFICACOES } from "@/lib/acoes";
import { Inicio } from "@/components/Inicio";
import type { Meta } from "@/lib/ai";
import type { Abordagem, DadosBusca, Fonte, Lead } from "@/lib/types";

/** Quantos leads entram no atalho "Escrever para os N melhores". */
const MELHORES = 5;

/**
 * Leads com mais material para personalizar a abordagem primeiro (sinal com fatos, LinkedIn, site, cargo):
 * é o que "os N melhores" quer dizer aqui — a busca não devolve pontuação, e ordenar por dado aproveitável
 * é a única leitura verdadeira de "melhor" nesta lista.
 */
function maisMaterial(leads: Lead[], quantos: number): Lead[] {
  const forca = (l: Lead) => (l.sinal ? Math.min(3, Math.ceil(l.sinal.length / 40)) : 0) + (l.linkedin ? 2 : 0) + (l.site ? 1 : 0) + (l.cargo ? 1 : 0);
  return [...leads].sort((a, b) => forca(b) - forca(a)).slice(0, quantos);
}

/**
 * Proveniência da LISTA de leads. A `Origem` compartilhada não serve aqui: ela lê `meta.demo` e escreve
 * "Gerado com IA..." (a lista é buscada numa base, nenhuma IA escreve nada) ou "Conecte a IA para usar os
 * seus dados" (falso quando a IA já está ligada e o que falta é a busca de leads). A abordagem por lead
 * continua usando a `Origem` compartilhada, porque ali a IA escreve de verdade.
 */
function OrigemLeads({ fonte, meta, mostrarLink }: { fonte: Fonte; meta: Meta; mostrarLink: boolean }) {
  if (fonte !== "demo") {
    return <p className="text-muted text-[13px] mb-4">{`Leads buscados na base da Apollo a partir de ${meta.insumo}, em ${data(meta.geradoEm, { comHora: true })}`}</p>;
  }
  return (
    <p className="text-muted text-[13px] mb-4">
      {`Lista de exemplo a partir de ${meta.insumo}.`}
      {mostrarLink && (
        <>
          {" "}
          <Link href="/setup#apollo" className="font-semibold text-accent underline underline-offset-2">Conectar a busca de leads</Link>
        </>
      )}
    </p>
  );
}

/** "120 funcionários" -> "120 func.": o chip da coluna Porte tem menos de 100px no palco de meia tela. */
function porteCurto(porte: string) {
  return String(porte || "").replace(/\s*funcion[áa]rios?$/i, " func.");
}

function resumoBusca(dados: DadosBusca, total: number) {
  const cidade = String(dados.localizacao || "").split(",")[0].trim();
  return `${total} lead${total === 1 ? "" : "s"} encontrado${total === 1 ? "" : "s"} para ${dados.cargo} em ${dados.segmento}${cidade ? `, ${cidade}` : ""}.`;
}

function leadsParaTexto(dados: DadosBusca, leads: Lead[]) {
  const l: string[] = [resumoBusca(dados, leads.length), ""];
  leads.forEach((lead) => l.push(`- ${lead.nome} (${lead.cargo}, ${lead.empresa}, ${lead.cidade}): ${lead.sinal}`));
  return l.join("\n");
}

function exportarCSV(leads: Lead[]) {
  const colunas: (keyof Lead)[] = ["nome", "cargo", "empresa", "setor", "porte", "cidade", "linkedin", "site", "sinal"];
  const cabecalho = ["Nome", "Cargo", "Empresa", "Setor", "Porte", "Cidade", "LinkedIn", "Site", "Sinal"];
  const linhas = [cabecalho.join(";")];
  leads.forEach((l) => {
    linhas.push(colunas.map((c) => `"${String(l[c] ?? "").replace(/"/g, '""')}"`).join(";"));
  });
  const csv = "﻿" + linhas.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "leads.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// A tela única antiga (formulário de busca + Resultado) foi substituída pelo Início (US-003, components/Inicio.tsx).
// Resultado/ConteudoLeads continuam aqui porque `/r/[id]` e `/imprimir/[id]` importam os dois deste arquivo
// (o link permanente de uma busca salva e a rotina "leads novos toda semana" continuam usando as rotas antigas,
// ver Technical Considerations "Migração" na PRD: elas somem só na US-039).
export default function Page() {
  return <Inicio />;
}

export function Resultado({
  dados,
  fonte,
  leads,
  meta,
  id,
  onEscrever,
  onEscreverLote,
  leadsProntos,
  carregandoIds,
  erroLote,
  onEnviarCRM,
  crmConfigurado,
  enviandoCRMIds,
  erroCRM,
  avisoCRM,
  iaLigada = false,
  abordagensSalvas,
}: {
  dados: DadosBusca;
  fonte: Fonte;
  leads: Lead[];
  meta: Meta;
  id?: string;
  onEscrever?: (lead: Lead) => void;
  onEscreverLote?: (leads: Lead[]) => void;
  leadsProntos?: Set<string>;
  carregandoIds?: Set<string>;
  erroLote?: string | null;
  onEnviarCRM?: (leads: Lead[]) => void;
  crmConfigurado?: boolean;
  enviandoCRMIds?: Set<string>;
  erroCRM?: string | null;
  avisoCRM?: string | null;
  iaLigada?: boolean;
  /** Abordagens já escritas e salvas com o resultado (rotina semanal): exibidas abertas em /r/[id], que não tem como gerar de novo. */
  abordagensSalvas?: Record<string, Abordagem>;
}) {
  const salvas = abordagensSalvas ? leads.filter((l) => abordagensSalvas[l.id]) : [];
  return (
    <article className="reveal">
      <ResultHead titulo="Leads encontrados" subtitulo={fonte === "demo" ? "Dados de exemplo" : "Leads reais"}>
        <Entregar
          id={id}
          titulo={`Leads: ${dados.cargo} em ${dados.segmento}`}
          texto={() => leadsParaTexto(dados, leads)}
          extras={[{ rotulo: "Copiar lista (CSV)", onClick: () => exportarCSV(leads) }]}
        />
      </ResultHead>

      <OrigemLeads fonte={fonte} meta={meta} mostrarLink={fonte === "demo" && !iaLigada} />

      {/* A IA já escreve de verdade, mas os leads continuam fictícios enquanto a busca não estiver conectada. */}
      {fonte === "demo" && iaLigada && (
        <div className="mb-4">
          <Aviso tom="warn" acao={ACAO_BUSCA_DE_LEADS}>
            Estes leads são fictícios: conecte a busca de leads em Configurações para trazer contatos reais.
          </Aviso>
        </div>
      )}

      <ConteudoLeads
        dados={dados}
        leads={leads}
        onEscrever={onEscrever}
        onEscreverLote={onEscreverLote}
        leadsProntos={leadsProntos}
        carregandoIds={carregandoIds}
        erroLote={erroLote}
        onEnviarCRM={onEnviarCRM}
        crmConfigurado={crmConfigurado}
        enviandoCRMIds={enviandoCRMIds}
        erroCRM={erroCRM}
        avisoCRM={avisoCRM}
      />

      {salvas.length > 0 && abordagensSalvas && (
        <Section titulo="Abordagens escritas">
          {salvas.map((l) => (
            <MaisDetalhes key={l.id} titulo={`${l.nome} — ${l.empresa}`}>
              <AbordagemSalva abordagem={abordagensSalvas[l.id]} />
            </MaisDetalhes>
          ))}
        </Section>
      )}

      {onEscrever && <ReceberLeadsSemanais dados={dados} />}
    </article>
  );
}

type EstadoNotificacoes = { configurada: boolean; canal: "email" | "slack"; destino: string };
type RotinaLeads = { id: string; tipo: string; parametros: Partial<DadosBusca> };

/** Mesma normalização de lib/leads-vistos.ts (chavePerfil), duplicada aqui porque esse arquivo importa
 * node:sqlite e não pode ser importado por um componente "use client". */
function chavePerfil(d: Pick<DadosBusca, "segmento" | "cargo" | "localizacao" | "porte">): string {
  return [d.segmento, d.cargo, d.localizacao, d.porte].map((v) => String(v || "").trim().toLowerCase()).join("|");
}

/** Depois de uma busca, oferece automatizar a prospecção: uma rotina semanal que busca leads novos
 * para o mesmo perfil, exclui quem já foi entregue antes e já escreve a abordagem de cada um. */
function ReceberLeadsSemanais({ dados }: { dados: DadosBusca }) {
  const [notificacoes, setNotificacoes] = useState<EstadoNotificacoes | null>(null);
  const [rotinaId, setRotinaId] = useState<string | null | undefined>(undefined);
  const [quantidade, setQuantidade] = useState("10");
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => {
        const configurada = Boolean(d.integrations?.notificacoes);
        return fetch("/api/setup")
          .then((r) => r.json())
          .then((s) => {
            const integracao = (s.integracoes || []).find((i: { id: string }) => i.id === "notificacoes");
            const campos: { chave: string; valorVisivel?: string }[] = integracao?.campos || [];
            const canal = campos.find((c) => c.chave === "NOTIFICACOES_CANAL")?.valorVisivel === "slack" ? "slack" : "email";
            const destino = campos.find((c) => c.chave === "NOTIFICACOES_DESTINO")?.valorVisivel || "";
            setNotificacoes({ configurada, canal, destino });
          });
      })
      .catch(() => setNotificacoes({ configurada: false, canal: "email", destino: "" }));
    const perfilAtual = chavePerfil(dados);
    fetch("/api/rotinas")
      .then((r) => r.json())
      .then((d) => {
        const existente = (d.itens || []).find((i: RotinaLeads) => i.tipo === "leads-semanais" && chavePerfil(i.parametros as DadosBusca) === perfilAtual);
        setRotinaId(existente?.id ?? null);
      })
      .catch(() => setRotinaId(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez por resultado
  }, []);

  async function criar() {
    if (!notificacoes?.configurada) return;
    setCriando(true);
    setErro(null);
    try {
      const r = await fetch("/api/rotinas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "leads-semanais",
          frequencia: "semanal",
          diaSemana: 1,
          hora: "08:00",
          canal: notificacoes.canal,
          destino: notificacoes.canal === "email" ? notificacoes.destino || undefined : undefined,
          parametros: { ...dados, quantidade },
        }),
      });
      if (!r.ok) {
        setErro((await lerErro(r)).mensagem);
        return;
      }
      const d = await r.json();
      setRotinaId(d.id);
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    } finally {
      setCriando(false);
    }
  }

  if (rotinaId === undefined || notificacoes === null) return null;

  return (
    <Item className="mt-4">
      {rotinaId ? (
        <p className="text-muted text-sm">Você já recebe leads novos toda semana para esse perfil, toda segunda às 8h.</p>
      ) : (
        <>
          <div className="flex items-center gap-2.5 flex-wrap">
            <label className="flex items-center gap-1.5 text-[13px] font-semibold">
              Quantidade
              <select className="input !w-auto" value={quantidade} onChange={(e) => setQuantidade(e.target.value)}>
                <option value="10">10 leads</option>
                <option value="20">20 leads</option>
                <option value="30">30 leads</option>
              </select>
            </label>
            {notificacoes.configurada ? (
              <button type="button" className="btn-ghost !w-auto" onClick={criar} disabled={criando}>
                {criando ? "Criando..." : "Receber leads novos toda semana"}
              </button>
            ) : (
              <a href="/setup#notificacoes" className="btn-ghost !w-auto">Receber leads novos toda semana</a>
            )}
          </div>
          {erro && (
            <div className="mt-3">
              <Aviso tom="danger" acao={ACAO_NOTIFICACOES}>{erro}</Aviso>
            </div>
          )}
        </>
      )}
    </Item>
  );
}

/** Resumo + tabela de leads (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoLeads({
  dados,
  leads,
  onEscrever,
  onEscreverLote,
  leadsProntos = new Set(),
  carregandoIds = new Set(),
  erroLote,
  onEnviarCRM,
  crmConfigurado,
  enviandoCRMIds = new Set(),
  erroCRM,
  avisoCRM,
}: {
  dados: DadosBusca;
  leads: Lead[];
  onEscrever?: (lead: Lead) => void;
  onEscreverLote?: (leads: Lead[]) => void;
  leadsProntos?: Set<string>;
  carregandoIds?: Set<string>;
  erroLote?: string | null;
  onEnviarCRM?: (leads: Lead[]) => void;
  crmConfigurado?: boolean;
  enviandoCRMIds?: Set<string>;
  erroCRM?: string | null;
  avisoCRM?: string | null;
}) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const interativo = Boolean(onEscrever);

  function alternarSelecao(id: string) {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  // Palco na metade da tela: empresa e cidade moram dentro da célula do nome (uma coluna própria para
  // cada uma espremia o sinal a duas palavras por linha e enchia a tabela de "Ver mais").
  const colunas: Coluna<Lead>[] = [
    {
      chave: "nome",
      titulo: "Lead",
      papel: "titulo",
      largura: "31%",
      render: (l) => (
        <div className="flex items-start gap-2">
          {interativo && <input type="checkbox" className="w-4 h-4 mt-0.5 shrink-0 accent-accent" checked={selecionados.has(l.id)} onChange={() => alternarSelecao(l.id)} aria-label={`Selecionar ${l.nome}`} />}
          <div className="min-w-0">
            <strong className="block">{l.nome}</strong>
            <div className="text-[12.5px] text-muted">{l.cargo}</div>
            <div className="text-[12.5px] text-muted">{[l.empresa, l.cidade].filter(Boolean).join(" · ")}</div>
            <div className="flex flex-wrap gap-x-2 text-[12px] mt-0.5">
              {l.linkedin && <a href={l.linkedin} target="_blank" rel="noopener noreferrer" className="text-accent-ink hover:underline">LinkedIn</a>}
              {l.site && <a href={l.site} target="_blank" rel="noopener noreferrer" className="text-accent-ink hover:underline">Site</a>}
            </div>
            {(leadsProntos.has(l.id) || l.noCRM) && (
              <div className="flex flex-wrap gap-1 mt-1">
                {leadsProntos.has(l.id) && <Chip nivel="positivo">Abordagem pronta</Chip>}
                {l.noCRM && <Chip nivel="positivo">No CRM</Chip>}
              </div>
            )}
          </div>
        </div>
      ),
    },
    { chave: "porte", titulo: "Porte", papel: "chip", largura: "96px", render: (l) => <Chip nivel="neutral">{porteCurto(l.porte)}</Chip> },
    { chave: "sinal", titulo: "Sinal", papel: "resumo", linhas: 5, render: (l) => l.sinal },
  ];
  if (onEscrever) {
    colunas.push({
      chave: "acao",
      titulo: "",
      largura: "132px",
      render: (l) => (
        <div className="flex flex-col gap-1.5 items-stretch">
          <button
            type="button"
            className="btn-ghost !px-2.5 !py-2 !text-[13px]"
            disabled={carregandoIds.has(l.id)}
            onClick={() => onEscrever(l)}
          >
            {carregandoIds.has(l.id) ? "Escrevendo..." : leadsProntos.has(l.id) ? "Ver abordagem" : "Escrever abordagem"}
          </button>
          {onEnviarCRM && !l.noCRM && crmConfigurado !== undefined && (
            crmConfigurado ? (
              <button
                type="button"
                className="btn-ghost !px-2.5 !py-2 !text-[13px]"
                disabled={enviandoCRMIds.has(l.id)}
                onClick={() => onEnviarCRM([l])}
              >
                {enviandoCRMIds.has(l.id) ? "Enviando..." : "Enviar ao CRM"}
              </button>
            ) : (
              <a href="/setup#mcp-crm" className="btn-ghost !px-2.5 !py-2 !text-[13px] text-center">Conectar CRM</a>
            )
          )}
        </div>
      ),
    });
  }

  const leadsSelecionados = leads.filter((l) => selecionados.has(l.id));
  const leadsSemCRM = leads.filter((l) => !l.noCRM);
  const leadsSelecionadosSemCRM = leadsSelecionados.filter((l) => !l.noCRM);
  const melhoresPendentes = maisMaterial(leads, MELHORES).filter((l) => !leadsProntos.has(l.id));
  const escrevendo = carregandoIds.size > 0;
  const enviando = enviandoCRMIds.size > 0;

  return (
    <>
      <p className="summary">{resumoBusca(dados, leads.length)}</p>

      {(onEscreverLote || onEnviarCRM) && selecionados.size === 0 && (
        <div className="flex items-center gap-2.5 flex-wrap mb-3">
          {onEscreverLote && melhoresPendentes.length > 0 && (
            <button type="button" className="btn-primary !w-auto" disabled={escrevendo} onClick={() => onEscreverLote(melhoresPendentes)}>
              {escrevendo ? "Escrevendo..." : `Escrever para os ${melhoresPendentes.length} melhores`}
            </button>
          )}
          {onEnviarCRM && crmConfigurado && leadsSemCRM.length > 0 && (
            <button type="button" className="btn-ghost !w-auto" disabled={enviando} onClick={() => onEnviarCRM(leadsSemCRM)}>
              {enviando ? "Enviando..." : "Enviar todos para o CRM"}
            </button>
          )}
          {onEscreverLote && melhoresPendentes.length > 0 && (
            <span className="text-muted text-[12.5px] basis-full">Os leads com mais dados para personalizar a abordagem.</span>
          )}
        </div>
      )}

      {(onEscreverLote || onEnviarCRM) && selecionados.size > 0 && (
        <div className="card shadow-none flex items-center justify-between gap-3 px-3.5 py-2.5 mb-3 flex-wrap">
          <span className="text-sm text-muted">{selecionados.size} lead{selecionados.size === 1 ? "" : "s"} selecionado{selecionados.size === 1 ? "" : "s"}</span>
          <div className="flex items-center gap-2.5 flex-wrap">
            {onEnviarCRM && crmConfigurado && leadsSelecionadosSemCRM.length > 0 && (
              <button
                type="button"
                className="btn-ghost !w-auto"
                disabled={enviando}
                onClick={() => onEnviarCRM(leadsSelecionadosSemCRM)}
              >
                {enviando ? "Enviando..." : "Enviar selecionados para o CRM"}
              </button>
            )}
            {onEscreverLote && (
              <button
                type="button"
                className="btn-primary !w-auto"
                disabled={escrevendo}
                onClick={() => onEscreverLote(leadsSelecionados)}
              >
                {escrevendo ? "Escrevendo..." : "Escrever para os selecionados"}
              </button>
            )}
          </div>
        </div>
      )}
      {erroLote && <div className="mb-3"><Aviso tom="danger">{erroLote}</Aviso></div>}
      {erroCRM && <div className="mb-3"><Aviso tom="danger" acao={ACAO_CONFERIR_CRM}>{erroCRM}</Aviso></div>}
      {avisoCRM && <div className="mb-3"><Aviso tom="ok">{avisoCRM}</Aviso></div>}
      <DataTable colunas={colunas} linhas={leads} />
    </>
  );
}

/** Os quatro blocos da abordagem, sem cabeçalho nem proveniência: usado nas dobras de /r/[id]. */
function AbordagemSalva({ abordagem }: { abordagem: Abordagem }) {
  const email = abordagem.email || { assunto: "", corpo: "" };
  return (
    <div className="flex flex-col gap-3">
      <p className="summary m-0">{abordagem.gancho}</p>
      <Item>
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <strong className="text-sm">{email.assunto}</strong>
          <CopyButton texto={() => `Assunto: ${email.assunto}\n\n${email.corpo}`} rotulo="Copiar" />
        </div>
        <p className="whitespace-pre-wrap text-ink text-sm m-0">{email.corpo}</p>
      </Item>
      <Item>
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <span className="text-muted text-[12.5px]">LinkedIn</span>
          <CopyButton texto={() => abordagem.linkedin || ""} rotulo="Copiar" />
        </div>
        <p className="whitespace-pre-wrap text-ink text-sm m-0">{abordagem.linkedin}</p>
      </Item>
      <Item>
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <span className="text-muted text-[12.5px]">WhatsApp</span>
          <CopyButton texto={() => abordagem.whatsapp || ""} rotulo="Copiar" />
        </div>
        <p className="whitespace-pre-wrap text-ink text-sm m-0">{abordagem.whatsapp}</p>
      </Item>
      <p className="text-sm m-0"><strong>Próximo passo:</strong> {abordagem.proximo_passo}</p>
    </div>
  );
}

// AbordagemView (a tela de "abordagem escrita para um lead", com Origem/SeloIA) foi removida junto com o
// Page() antigo: nenhuma tela chama mais onEscrever (nem Início, nem /r/[id]) para chegar até ela — a
// geração interativa de abordagem por lead volta na Fase 3/4 (qualificação e abordagem do workspace).

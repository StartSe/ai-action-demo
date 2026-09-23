"use client";
// Tela de andamento de uma prospecção (US-013): a mesma rota de polling (GET
// /api/prospeccoes/[id]/andamento) serve a carga inicial e o poll a cada 2 s, então sair da tela e
// voltar (ou recarregar) sempre mostra o andamento correto, inclusive já concluído. O poll só roda
// enquanto a aba está visível (document.visibilityState === "visible") e só enquanto o estado é
// "executando" — mesmo padrão de components/ConexaoWhatsApp.tsx (whatsapp-atendente): o efeito depende
// do ESTADO (primitivo), não do objeto inteiro de andamento, para não reiniciar o intervalo a cada poll.
import type { ConsultaPesquisa, DecisaoPesquisa } from "@/lib/pesquisa-registro";
import type { CandidatoParcial } from "@/lib/pesquisa-parciais";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, Chip, DataTable, Topbar, data, useConfirmacao, useStatus, lerErro, type Coluna } from "@/components/ui";
import { ExploracaoEmpresa } from "@/components/ExploracaoEmpresa";
import { ResultadosParciais } from "@/components/ResultadosParciais";
import { AvatarPessoa } from "@/components/AvatarPessoa";
import { NOMES_FONTES, nomeAcaoPesquisa, ProgressoProspeccao } from "@/components/ProgressoProspeccao";
import { baixarCSV } from "@/lib/exportacao";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import { funilContagens, motivoPapel, ordenarLeadsPorPrioridade, sinalAntigo, sinalMaisRecente, type FunilContagens } from "@/lib/qualificacao";
import { NIVEL_CHIP_EVIDENCIA, ORDEM_MOTIVOS_DESCARTE, ORDEM_STATUS_LEAD, ROTULO_FIT, ROTULO_MODO, ROTULO_MOTIVO_DESCARTE, ROTULO_PAPEL, ROTULO_RESULTADO_EVIDENCIA, ROTULO_STATUS_LEAD, recorteProspeccao } from "@/lib/rotulos";
import type { Conta, Evidencia, Jornada, LeadProspeccao, MotivoDescarte, Prospeccao, SinalProspeccao, StatusLead } from "@/lib/types";

/** Chip de papel no processo de decisão (US-026): mostra o rótulo (ou nada, para "desconhecido") com o
 * `title` explicando a inferência em uma frase (`lib/qualificacao.ts:motivoPapel`) — `Chip` (INFRA) não
 * aceita `title`, por isso o `<span>` embrulhando. Só leitura aqui: a EDIÇÃO mora na "ficha" (o painel
 * lateral de `ExploracaoEmpresa.tsx`, único lugar com esse detalhe antes da US-027 trazer `/leads/[id]`). */
function ChipPapel({ lead, personas }: { lead: LeadProspeccao; personas: string[] }) {
  const rotulo = ROTULO_PAPEL[lead.papel];
  if (!rotulo) return null;
  const motivo = lead.papelManual ? "Definido manualmente pelo vendedor." : motivoPapel(lead.papel, lead.cargo, personas);
  return (
    <span title={motivo ?? undefined}>
      <Chip nivel="neutral">{rotulo}</Chip>
    </span>
  );
}

/** Chip de um sinal de intenção (US-020): descrição + data, em cinza e com "· Antigo" quando passou dos
 * 90 dias (lib/qualificacao.ts:sinalAntigo) — sinal sem essa marca é recente e continua em verde
 * (`positivo`), mesmo tom já usado para sinal nas contas do modo "empresas". */
function ChipSinal({ sinal }: { sinal: SinalProspeccao }) {
  const antigo = sinalAntigo(sinal);
  return (
    <Chip nivel={antigo ? "cinza" : "positivo"}>
      {sinal.descricao} · {data(sinal.data, { comAno: true })}
      {antigo ? " · Antigo" : ""}
    </Chip>
  );
}

/** Evidências item a item (US-024, prd.json > regras: "com o valor encontrado e o resultado"): um chip
 * por critério (atende/não atende/não foi possível verificar) e, quando a IA citou um trecho (critério
 * interpretativo, ver lib/qualificacao-ia.ts), a frase literal que embasou a resposta. */
function EvidenciasLista({ evidencias }: { evidencias: Evidencia[] }) {
  if (evidencias.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1">
      {evidencias.map((e, i) => (
        <li key={i} className="flex items-start gap-1.5 flex-wrap text-[12px] text-muted">
          <Chip nivel={NIVEL_CHIP_EVIDENCIA[e.resultado]}>{ROTULO_RESULTADO_EVIDENCIA[e.resultado]}</Chip>
          <span>
            {e.criterio}: {e.valor}
            {e.trecho && <span className="italic"> · “{e.trecho}”</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Evidências dobradas (cartões de empresa dos modos "empresas" e "oportunidades"): o resumo em números
 * ("3 atendem · 1 sem verificação") fica sempre visível; a lista item a item abre ao clicar — a informação
 * não some, só deixa de ocupar a tela inteira quando há dez empresas seguidas. */
function EvidenciasResumo({ evidencias }: { evidencias: Evidencia[] }) {
  if (evidencias.length === 0) return null;
  const quantos = (r: Evidencia["resultado"]) => evidencias.filter((e) => e.resultado === r).length;
  const partes: [number, string, string][] = [
    [quantos("atende"), "atende", "atendem"],
    [quantos("nao_atende"), "não atende", "não atendem"],
    [quantos("nao_verificavel"), "sem verificação", "sem verificação"],
  ];
  const resumo = partes.filter(([n]) => n > 0).map(([n, singular, plural]) => `${n} ${n === 1 ? singular : plural}`).join(" · ");
  return (
    <details className="text-[12.5px]">
      <summary className="cursor-pointer font-semibold text-accent-ink select-none">Evidências: {resumo}</summary>
      <div className="mt-2">
        <EvidenciasLista evidencias={evidencias} />
      </div>
    </details>
  );
}

/** Até `max` palavras, com o texto inteiro no `title` (US-033, coluna "Sinal"): a lista prioriza
 * densidade — a frase inteira, evidências e hipótese de dor continuam na ficha ("Ver ficha", no menu
 * "•••" abaixo), que já mostra tudo isso por extenso desde a US-027. */
function truncarPalavras(texto: string, max: number): string {
  const palavras = texto.trim().split(/\s+/);
  if (palavras.length <= max) return texto;
  return `${palavras.slice(0, max).join(" ")}…`;
}

/** Etapas do funil (US-035): cada uma filtra a lista de leads por progresso MÍNIMO (ver funilContagens em
 * lib/qualificacao.ts, mesma ordem/regra) — "Encontrados" não tem mínimo, mostra todo mundo, inclusive
 * quem já foi descartado. `contagem` aponta o número correspondente em FunilContagens: o mesmo array
 * desenha os números do cabeçalho (FunilResumo) e decide o filtro da tabela. */
type AbaFunil = "descobertos" | "qualificados" | "selecionados" | "contatados" | "responderam";

const ETAPAS_FUNIL: { chave: AbaFunil; rotulo: string; contagem: keyof FunilContagens; minimo?: StatusLead }[] = [
  { chave: "descobertos", rotulo: "Encontrados", contagem: "encontrados" },
  { chave: "qualificados", rotulo: "Qualificados", contagem: "qualificados", minimo: "qualificado" },
  { chave: "selecionados", rotulo: "Selecionados", contagem: "selecionados", minimo: "selecionado" },
  { chave: "contatados", rotulo: "Contatados", contagem: "contatados", minimo: "abordado" },
  { chave: "responderam", rotulo: "Responderam", contagem: "respondidos", minimo: "respondeu" },
];

function leadsNaAba(leads: LeadProspeccao[], aba: AbaFunil): LeadProspeccao[] {
  const minimo = ETAPAS_FUNIL.find((a) => a.chave === aba)?.minimo;
  if (!minimo) return leads;
  const indiceMinimo = ORDEM_STATUS_LEAD.indexOf(minimo);
  return leads.filter((l) => ORDEM_STATUS_LEAD.indexOf(l.status) >= indiceMinimo);
}

/** Funil da prospecção em números, no lugar da frase "12 encontrados → 5 qualificados → …": cinco blocos
 * lado a lado, um por etapa. Quando a tela tem uma lista de leads para filtrar (`onAba`), os blocos são
 * as próprias abas (`role="tablist"`) — escolher um número filtra a tabela abaixo, sem uma segunda fileira
 * de botões dizendo a mesma coisa. Sem lista (modo "empresas", busca em andamento), são só números. */
function FunilResumo({ funil, aba, onAba }: { funil: FunilContagens; aba?: AbaFunil; onAba?: (aba: AbaFunil) => void }) {
  return (
    <div role={onAba ? "tablist" : undefined} aria-label={onAba ? "Etapas do funil" : undefined} className="grid grid-cols-5 max-md:grid-cols-3 max-sm:grid-cols-2 gap-2 mb-5">
      {ETAPAS_FUNIL.map((etapa) => {
        const ativo = onAba ? aba === etapa.chave : false;
        const conteudo = (
          <>
            <span className="block text-[22px] leading-none font-extrabold tracking-[-0.02em]">{funil[etapa.contagem]}</span>
            <span className="block text-[12px] font-semibold text-muted mt-1">{etapa.rotulo}</span>
          </>
        );
        const base = "card shadow-none px-3.5 py-3 text-left transition-colors";
        if (!onAba) return <div key={etapa.chave} className={base}>{conteudo}</div>;
        return (
          <button key={etapa.chave} type="button" role="tab" aria-selected={ativo} className={`${base} cursor-pointer ${ativo ? "border-accent bg-accent-soft" : "hover:bg-bg"}`} onClick={() => onAba(etapa.chave)}>
            {conteudo}
          </button>
        );
      })}
    </div>
  );
}

const LARGURA_MENU_ACOES = 224; // w-56

/** Menu "•••" por linha (US-033): as ações que antes ficavam soltas na tabela/cartão agora moram aqui.
 * Mesmo padrão de menu local reimplementado já usado por `Entregar` (`components/ui.tsx`, INFRA) e por
 * `MenuRegenerar` (`components/AbordagemLead.tsx`) — não compartilhável porque os itens são diferentes em
 * cada caso. "Mudar status" abre um SEGUNDO nível dentro do mesmo menu (mesma ideia de "Usar outro sinal"
 * do `MenuRegenerar`), listando `ROTULO_STATUS_LEAD` menos o status atual e menos "descartado" (que já tem
 * o próprio item "Descartar", redundante ali). "Descartar" abre seu PRÓPRIO segundo nível (US-034): a lista
 * curta de motivos (`ORDEM_MOTIVOS_DESCARTE`) — escolher um motivo é o que dispara o PUT, nunca o clique em
 * "Descartar" sozinho. "Enviar para o CRM"/"Apagar dados desta pessoa" (só em B2C,
 * US-021) somem quando não fazem sentido no estado atual — "um botão que não faria nada naquele estado não
 * fica desligado, ele sai" (Codebase Patterns raiz). Diferente de `Entregar`/`MenuRegenerar`, este menu
 * abre num `createPortal` para `document.body`, com posição calculada a partir do botão (`position: fixed`,
 * mesmas coordenadas de `getBoundingClientRect`): dentro da tabela do `DataTable` (INFRA), o `<table>`
 * desktop tem `overflow-hidden` (para os cantos arredondados) e um menu `absolute` comum, numa linha perto
 * do fim da tabela, era cortado no meio — achado ao capturar a tela desta história, não visível no código. */
function MenuAcoesLead({
  lead,
  crmConfigurado,
  enviandoCRM,
  onMudarStatus,
  onEnviarCRM,
  onDescartar,
  onApagarPessoa,
  apagando,
}: {
  lead: LeadProspeccao;
  crmConfigurado: boolean;
  enviandoCRM: boolean;
  onMudarStatus: (status: StatusLead) => void;
  onEnviarCRM: () => void;
  onDescartar: (motivo: MotivoDescarte) => void;
  onApagarPessoa?: () => void;
  apagando: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [nivel, setNivel] = useState<"raiz" | "status" | "descartar">("raiz");
  const [posicao, setPosicao] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);

  function fechar() { setAberto(false); setNivel("raiz"); }

  function alternar() {
    const retangulo = botaoRef.current?.getBoundingClientRect();
    if (retangulo) setPosicao({ top: retangulo.bottom + 8, left: Math.max(8, retangulo.right - LARGURA_MENU_ACOES) });
    setAberto((v) => !v);
    setNivel("raiz");
  }

  useEffect(() => {
    if (!aberto) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") fechar();
    }
    function onClickFora(e: MouseEvent) {
      const alvo = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(alvo) && !botaoRef.current?.contains(alvo)) fechar();
    }
    function onScroll() { fechar(); }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickFora);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickFora);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [aberto]);

  const itemClasse = "w-full text-left px-3 py-2 rounded-md hover:bg-accent-soft cursor-pointer block";
  const statusEscolhiveis = (Object.keys(ROTULO_STATUS_LEAD) as StatusLead[]).filter((s) => s !== lead.status && s !== "descartado");

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        className="btn-ghost !px-2 !py-1.5 shrink-0"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Ações para ${lead.nome}`}
        onClick={alternar}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
      </button>
      {aberto && posicao && createPortal(
        nivel === "raiz" ? (
          <div ref={menuRef} role="menu" style={{ top: posicao.top, left: posicao.left }} className="fixed z-50 w-56 card p-1.5 text-[13.5px]">
            <Link role="menuitem" className={itemClasse} href={`/leads/${lead.id}`} onClick={fechar}>Ver ficha</Link>
            <Link role="menuitem" className={itemClasse} href={`/leads/${lead.id}/abordagem`} onClick={fechar}>Criar abordagem</Link>
            <button type="button" role="menuitem" className={itemClasse} onClick={() => setNivel("status")}>Mudar status</button>
            {crmConfigurado && !lead.noCRM && (
              <button type="button" role="menuitem" className={itemClasse} disabled={enviandoCRM} onClick={() => { onEnviarCRM(); fechar(); }}>
                {enviandoCRM ? "Enviando…" : "Enviar para o CRM"}
              </button>
            )}
            {lead.status !== "descartado" && (
              <button type="button" role="menuitem" className={`${itemClasse} text-danger`} onClick={() => setNivel("descartar")}>Descartar</button>
            )}
            {onApagarPessoa && (
              <button type="button" role="menuitem" className={`${itemClasse} text-danger`} disabled={apagando} onClick={() => { onApagarPessoa(); fechar(); }}>
                {apagando ? "Apagando…" : "Apagar dados desta pessoa"}
              </button>
            )}
          </div>
        ) : nivel === "status" ? (
          <div ref={menuRef} role="menu" style={{ top: posicao.top, left: posicao.left }} className="fixed z-50 w-56 card p-1.5 text-[13.5px]">
            <button type="button" className="w-full text-left px-3 py-1.5 text-[12px] text-muted" onClick={() => setNivel("raiz")}>‹ Voltar</button>
            {statusEscolhiveis.map((s) => (
              <button key={s} type="button" role="menuitem" className={itemClasse} onClick={() => { onMudarStatus(s); fechar(); }}>
                {ROTULO_STATUS_LEAD[s]}
              </button>
            ))}
          </div>
        ) : (
          <div ref={menuRef} role="menu" style={{ top: posicao.top, left: posicao.left }} className="fixed z-50 w-56 card p-1.5 text-[13.5px]">
            <button type="button" className="w-full text-left px-3 py-1.5 text-[12px] text-muted" onClick={() => setNivel("raiz")}>‹ Voltar</button>
            {ORDEM_MOTIVOS_DESCARTE.map((m) => (
              <button key={m} type="button" role="menuitem" className={`${itemClasse} text-danger`} onClick={() => { onDescartar(m); fechar(); }}>
                {ROTULO_MOTIVO_DESCARTE[m]}
              </button>
            ))}
          </div>
        ),
        document.body,
      )}
    </>
  );
}

/** Colunas da lista de leads (US-033): Lead/Empresa/Fit/Sinal/Papel/Status em B2B, Pessoa/Fit/Sinal/
 * Contexto/Status em B2C — a jornada é da PROSPECÇÃO (nunca varia lead a lead dentro da mesma lista), por
 * isso um parâmetro só, não um campo por lead. No celular, `DataTable` (INFRA) só rotula colunas sem
 * `papel`: aqui são no máximo 4 (Empresa/Papel/Status/Ações em B2B; Contexto/Status/Ações em B2C) — Lead
 * (`papel: "titulo"`), Fit (`papel: "chip"`) e Sinal (`papel: "resumo"`) não contam. */
function construirColunasLeads(opcoes: {
  jornada: Jornada;
  icpPersonas: string[];
  crmConfigurado: boolean;
  enviandoCRMId: string | null;
  apagandoPessoaId: string | null;
  onMudarStatus: (leadId: string, status: StatusLead) => void;
  onEnviarCRM: (leadId: string) => void;
  onDescartar: (leadId: string, motivo: MotivoDescarte) => void;
  onApagarPessoa?: (leadId: string) => void;
}): Coluna<LeadProspeccao>[] {
  const colunas: Coluna<LeadProspeccao>[] = [
    {
      chave: "nome",
      titulo: opcoes.jornada === "b2c" ? "Pessoa" : "Lead",
      papel: "titulo",
      render: (l) => (
        <div className="flex items-start gap-3">
          <AvatarPessoa nome={l.nome} url={l.avatarUrl} />
          <div className="min-w-0">
            <p className="font-semibold text-[14px]">{l.nome}</p>
            {l.linkedin && (
              <a href={l.linkedin} target="_blank" rel="noopener noreferrer" className="text-[12px] text-accent-ink hover:underline">Ver perfil</a>
            )}
          </div>
        </div>
      ),
    },
    { chave: "fit", titulo: "Fit", papel: "chip", render: (l) => (l.fit ? <Chip nivel={l.fit}>{ROTULO_FIT[l.fit]}</Chip> : null) },
    {
      chave: "sinal",
      titulo: "Sinal",
      papel: "resumo",
      render: (l) => {
        const sinal = sinalMaisRecente(l.sinais);
        if (!sinal) return <span className="text-muted">Nenhum sinal</span>;
        return (
          <span title={sinal.descricao}>
            {truncarPalavras(sinal.descricao, 5)}
            {sinalAntigo(sinal) ? " · Antigo" : ""}
          </span>
        );
      },
    },
  ];

  if (opcoes.jornada === "b2c") {
    colunas.push({
      chave: "contexto",
      titulo: "Contexto",
      render: (l) => [l.cargo, l.cidade].filter(Boolean).join(" · ") || "Não identificado",
    });
  } else {
    colunas.push({
      chave: "empresa",
      titulo: "Empresa",
      render: (l) => [l.empresa, l.cidade].filter(Boolean).join(" · ") || "Não identificada",
    });
    colunas.push({
      chave: "papel",
      titulo: "Papel",
      render: (l) => <ChipPapel lead={l} personas={opcoes.icpPersonas} />,
    });
  }

  colunas.push({ chave: "status", titulo: "Status", render: (l) => <Chip nivel="neutral">{ROTULO_STATUS_LEAD[l.status]}</Chip> });

  colunas.push({
    chave: "acoes",
    titulo: "",
    render: (l) => (
      <MenuAcoesLead
        lead={l}
        crmConfigurado={opcoes.crmConfigurado}
        enviandoCRM={opcoes.enviandoCRMId === l.id}
        apagando={opcoes.apagandoPessoaId === l.id}
        onMudarStatus={(status) => opcoes.onMudarStatus(l.id, status)}
        onEnviarCRM={() => opcoes.onEnviarCRM(l.id)}
        onDescartar={(motivo) => opcoes.onDescartar(l.id, motivo)}
        onApagarPessoa={opcoes.onApagarPessoa ? () => opcoes.onApagarPessoa!(l.id) : undefined}
      />
    ),
  });

  return colunas;
}

type Andamento = {
  reencontrados?: LeadProspeccao[];
  candidatos?: CandidatoParcial[];
  consultas?: ConsultaPesquisa[];
  decisoes?: DecisaoPesquisa[];
  prospeccao: Prospeccao;
  produtoNome: string;
  icpNome: string;
  jornada: Jornada;
  icpPersonas: string[];
  contas: Conta[];
  leads: LeadProspeccao[];
  contasEncontradas: number;
  leadsEncontrados: number;
};

const INTERVALO_POLL_MS = 2000;

export function ProspeccaoAndamento({ prospeccaoId }: { prospeccaoId: string }) {
  const { status, erro } = useStatus();
  const router = useRouter();
  const { confirmar, Dialogo } = useConfirmacao();
  const [andamento, setAndamento] = useState<Andamento | null>(null);
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [repetindo, setRepetindo] = useState(false);
  const [erroRepetir, setErroRepetir] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [erroCancelar, setErroCancelar] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);
  const [erroApagar, setErroApagar] = useState<string | null>(null);
  const [erroAtualizacao, setErroAtualizacao] = useState<string | null>(null);
  const [semSessao, setSemSessao] = useState(false);
  const [ultimoContato, setUltimoContato] = useState<number | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [buscandoPessoasId, setBuscandoPessoasId] = useState<string | null>(null);
  const [erroVerPessoas, setErroVerPessoas] = useState<string | null>(null);
  const [apagandoPessoaId, setApagandoPessoaId] = useState<string | null>(null);
  const [enviandoCRMId, setEnviandoCRMId] = useState<string | null>(null);
  const [erroCRM, setErroCRM] = useState<string | null>(null);
  const [erroAcaoPessoa, setErroAcaoPessoa] = useState<string | null>(null);
  const [aba, setAba] = useState<AbaFunil>("descobertos");

  useEffect(() => {
    let desmontado = false;
    let ocupado = false;
    let terminou = false;
    let proxima: ReturnType<typeof setTimeout> | undefined;
    let requisicao: AbortController | undefined;
    async function carregar() {
      if (desmontado || ocupado || terminou) return;
      clearTimeout(proxima);
      ocupado = true;
      requisicao = new AbortController();
      const limite = setTimeout(() => requisicao?.abort(), 15000);
      let intervalo = INTERVALO_POLL_MS;
      try {
        const r = await fetch(`/api/prospeccoes/${prospeccaoId}/andamento`, { signal: requisicao.signal, cache: "no-store" });
        if (desmontado) return;
        if (r.status === 404) { setNaoEncontrada(true); terminou = true; return; }
        if (r.status === 401) { setSemSessao(true); terminou = true; }
        if (!r.ok) throw new Error((await lerErro(r)).mensagem);
        const dados = await r.json() as Andamento;
        if (desmontado) return;
        if (dados.prospeccao?.id !== prospeccaoId || !Array.isArray(dados.leads) || !Array.isArray(dados.contas)) throw new Error("Não foi possível ler o andamento. Tente atualizar novamente.");
        // Uma resposta iniciada antes do cancelamento não pode voltar a tela para executando.
        setAndamento(anterior => anterior?.prospeccao.id === prospeccaoId && anterior.prospeccao.estado !== "executando" && dados.prospeccao.estado === "executando" ? anterior : dados);
        setErroAtualizacao(null);
        setSemSessao(false);
        setUltimoContato(Date.now());
        terminou = dados.prospeccao.estado !== "executando";
      } catch (e) {
        if (!desmontado) setErroAtualizacao(e instanceof Error && e.name !== "AbortError" && e.name !== "TypeError" ? e.message : "Não conseguimos atualizar o andamento. Verifique sua conexão; tentaremos novamente automaticamente.");
        intervalo = 5000;
      } finally {
        clearTimeout(limite);
        ocupado = false;
        if (!desmontado && !terminou) proxima = setTimeout(() => { if (document.visibilityState === "visible") void carregar(); }, intervalo);
      }
    }
    const aoVoltar = () => { if (document.visibilityState === "visible") void carregar(); };
    void carregar();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("online", aoVoltar);
    return () => {
      desmontado = true;
      clearTimeout(proxima);
      requisicao?.abort();
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("online", aoVoltar);
    };
  }, [prospeccaoId, tentativa]);

  async function repetir() {
    if (!andamento || repetindo) return;
    setRepetindo(true);
    setErroRepetir(null);
    try {
      const r = await fetch("/api/prospeccoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produtoId: andamento.prospeccao.produtoId,
          icpId: andamento.prospeccao.icpId,
          modo: andamento.prospeccao.modo,
          criterios: andamento.prospeccao.criterios,
        }),
      });
      if (!r.ok) {
        const lido = await lerErro(r);
        setErroRepetir(lido.mensagem);
        setRepetindo(false);
        return;
      }
      const nova = (await r.json()) as Prospeccao;
      router.push(`/prospeccoes/${nova.id}`);
    } catch (e) {
      const lido = await lerErro(e);
      setErroRepetir(lido.mensagem);
      setRepetindo(false);
    }
  }

  /** "Ver pessoas" de uma conta (US-017): abre uma nova prospecção no modo "Explorar uma empresa" já
   * preenchida com o que a conta encontrada trouxe — mesmo caminho de "Explorar uma empresa" (modo
   * `empresa_unica`) que a pessoa já usaria manualmente, sem inventar uma segunda tela. */
  async function verPessoas(conta: Conta) {
    if (!andamento || buscandoPessoasId) return;
    setBuscandoPessoasId(conta.id);
    setErroVerPessoas(null);
    try {
      const r = await fetch("/api/prospeccoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produtoId: andamento.prospeccao.produtoId,
          icpId: andamento.prospeccao.icpId,
          modo: "empresa_unica",
          criterios: { empresaNome: conta.nome, segmento: conta.setor ?? "", localizacao: conta.cidade ?? "", porte: conta.porte ?? "" },
        }),
      });
      if (!r.ok) {
        const lido = await lerErro(r);
        setErroVerPessoas(lido.mensagem);
        setBuscandoPessoasId(null);
        return;
      }
      const nova = (await r.json()) as Prospeccao;
      router.push(`/prospeccoes/${nova.id}`);
    } catch (e) {
      const lido = await lerErro(e);
      setErroVerPessoas(lido.mensagem);
      setBuscandoPessoasId(null);
    }
  }

  async function cancelar() {
    if (cancelando) return;
    setCancelando(true);
    setErroCancelar(null);
    try {
      const r = await fetch(`/api/prospeccoes/${prospeccaoId}/cancelar`, { method: "POST" });
      if (!r.ok) {
        const lido = await lerErro(r);
        setErroCancelar(lido.mensagem);
        setCancelando(false);
        return;
      }
      const atualizada = (await r.json()) as Prospeccao;
      setAndamento((a) => (a ? { ...a, prospeccao: atualizada } : a));
    } catch (e) {
      const lido = await lerErro(e);
      setErroCancelar(lido.mensagem);
    } finally {
      setCancelando(false);
    }
  }

  async function apagar() {
    if (apagando) return;
    const ok = await confirmar("Apagar esta prospecção? As empresas, pessoas e abordagens encontradas aqui somem junto.", { confirmarRotulo: "Apagar" });
    if (!ok) return;
    setApagando(true);
    setErroApagar(null);
    try {
      const r = await fetch(`/api/prospeccoes/${prospeccaoId}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await lerErro(r)).mensagem);
      router.push("/prospeccoes");
    } catch (e) {
      setErroApagar(e instanceof Error && e.name !== "TypeError" ? e.message : "Não foi possível excluir a prospecção. Verifique sua conexão e tente novamente.");
      setApagando(false);
    }
  }

  /** "Apagar dados desta pessoa" (US-021, jornada B2C): apaga o lead e as abordagens dele por completo,
   * sem afetar mais ninguém da prospecção — diferente de "Apagar" (acima), que apaga a prospecção inteira. */
  async function apagarPessoa(leadId: string) {
    const ok = await confirmar("Apagar os dados desta pessoa? A ação não pode ser desfeita.", { confirmarRotulo: "Apagar" });
    if (!ok) return;
    setApagandoPessoaId(leadId);
    setErroAcaoPessoa(null);
    try {
      const r = await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await lerErro(r)).mensagem);
      setAndamento(a => a ? { ...a, leads: a.leads.filter(l => l.id !== leadId), leadsEncontrados: a.leads.filter(l => l.id !== leadId).length } : a);
    } catch (e) {
      setErroAcaoPessoa(e instanceof Error && e.name !== "TypeError" ? e.message : "Não foi possível excluir esta pessoa. Tente novamente.");
    } finally { setApagandoPessoaId(null); }
  }

  /** "Mudar status"/"Descartar" do menu "•••" (US-033/US-034): `PUT /api/leads/[id]` com `{ status }` (mais
   * `motivo`, só quando `status === "descartado"`) — extensão da mesma rota que já grava `papel` (US-026),
   * a única escrita de status fora do pipeline. */
  async function mudarStatusLead(leadId: string, status: StatusLead, motivo?: MotivoDescarte) {
    const corpo = status === "descartado" ? { status, motivo } : { status };
    setErroAcaoPessoa(null);
    try {
      const r = await fetch(`/api/leads/${leadId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      if (!r.ok) throw new Error((await lerErro(r)).mensagem);
      const atualizado = (await r.json()) as LeadProspeccao;
      setAndamento((a) => (a ? { ...a, leads: a.leads.map((l) => (l.id === leadId ? atualizado : l)) } : a));
    } catch (e) {
      setErroAcaoPessoa(e instanceof Error && e.name !== "TypeError" ? e.message : "Não foi possível salvar a alteração desta pessoa. Tente novamente.");
    }
  }

  /** "Enviar para o CRM" do menu "•••" (US-033): mesma rota já usada por `AbordagemLead.tsx` (US-032). */
  async function enviarParaCRM(leadId: string) {
    setEnviandoCRMId(leadId);
    setErroCRM(null);
    try {
      const r = await fetch(`/api/leads/${leadId}/crm`, { method: "POST" });
      const corpo = await r.json().catch(() => null);
      if (!r.ok) { setErroCRM(corpo?.error || "Não foi possível enviar para o CRM."); return; }
      setAndamento((a) => (a ? { ...a, leads: a.leads.map((l) => (l.id === leadId ? (corpo as LeadProspeccao) : l)) } : a));
    } catch {
      setErroCRM("Não foi possível enviar para o CRM.");
    } finally {
      setEnviandoCRMId(null);
    }
  }

  /** "Exportar CSV" (US-037): as colunas visíveis da lista de leads desta prospecção (Lead/Empresa ou
   * Contexto/Fit/Papel/Sinal/Status) mais LinkedIn, site (da `Conta` vinculada) e TODOS os sinais com
   * data — a coluna "Sinal" da tabela mostra só o mais recente truncado. `leads` já chega filtrado pela
   * aba do funil aplicada (a mesma lista que o `DataTable` desenha). */
  function exportarLeadsCSV(leads: LeadProspeccao[]) {
    const contaPorId = new Map((andamento?.contas ?? []).map((c) => [c.id, c] as const));
    const cabecalho = ["Nome", "Cargo", "Empresa", "Cidade", "Fit", "Papel", "Status", "LinkedIn", "Site", "Sinais (com data)"];
    const linhas = leads.map((l) => {
      const conta = l.contaId ? contaPorId.get(l.contaId) : undefined;
      return [
        l.nome,
        l.cargo ?? "",
        l.empresa ?? conta?.nome ?? "",
        l.cidade ?? conta?.cidade ?? "",
        l.fit ? ROTULO_FIT[l.fit] : "",
        ROTULO_PAPEL[l.papel] ?? "",
        ROTULO_STATUS_LEAD[l.status],
        l.linkedin ?? "",
        conta?.site ?? "",
        l.sinais.map((s) => `${s.descricao} (${data(s.data, { comAno: true })})`).join(" | "),
      ];
    });
    baixarCSV(cabecalho, linhas, "leads.csv");
  }

  const nomeDaProspeccao = andamento ? `${({ pessoas: "Pessoas", empresas: "Empresas", empresa_unica: "Pesquisa de empresa", oportunidades: "Oportunidades" })[andamento.prospeccao.modo]} para ${andamento.produtoNome}` : "";
  const recorte = andamento ? recorteProspeccao(andamento.prospeccao.modo, andamento.prospeccao.criterios) : "";
  const funil = andamento ? funilContagens(andamento.leads) : null;
  const candidatos = andamento?.candidatos ?? [];
  const reencontrados = andamento?.reencontrados ?? [];
  const mostrarParciais = !!andamento && andamento.prospeccao.estado !== "rascunho" && (andamento.prospeccao.estado !== "pronta" || (!!andamento.prospeccao.erro && candidatos.length > 0));
  const leadsFiltrados = andamento ? leadsNaAba(andamento.leads, aba) : [];
  // Os números do funil viram abas só quando há uma lista de leads abaixo para filtrar.
  const filtraLeads = !!andamento && andamento.prospeccao.estado === "pronta" && (andamento.prospeccao.modo === "pessoas" || andamento.prospeccao.modo === "oportunidades") && andamento.leads.length > 0;
  const colunasLeads = andamento
    ? construirColunasLeads({
        jornada: andamento.jornada,
        icpPersonas: andamento.icpPersonas,
        crmConfigurado: !!status?.integrations?.["mcp-crm"],
        enviandoCRMId,
        apagandoPessoaId,
        onMudarStatus: mudarStatusLead,
        onEnviarCRM: enviarParaCRM,
        onDescartar: (leadId, motivo) => mudarStatusLead(leadId, "descartado", motivo),
        onApagarPessoa: andamento.jornada === "b2c" ? apagarPessoa : undefined,
      })
    : [];

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} usuario={status?.usuario} navegacao={NAVEGACAO_PROSPECCAO} />

      <main className="max-w-[1000px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        {naoEncontrada ? (
          <Aviso tom="danger" acao={{ rotulo: "Nova prospecção", url: "/prospeccoes/nova" }}>
            Esta prospecção não existe mais.
          </Aviso>
        ) : !andamento && erroAtualizacao ? (
          <div role="alert">
            <Aviso tom="danger" acao={semSessao ? { rotulo: "Entrar novamente", url: `/entrar?next=${encodeURIComponent(`/prospeccoes/${prospeccaoId}`)}` } : { rotulo: "Tentar novamente", onClick: () => setTentativa(t => t + 1) }}>
              <p className="font-semibold mb-1">Não foi possível carregar a prospecção</p>
              {erroAtualizacao}
            </Aviso>
          </div>
        ) : !andamento ? (
          <div className="card p-6 flex flex-col gap-4" role="status" aria-label="Carregando prospecção">
            <p className="text-sm text-muted">Carregando sua prospecção…</p>
            {[0, 1, 2].map((i) => (
              <span key={i} className="skeleton block w-full h-11" />
            ))}
          </div>
        ) : (
          <>
            <Link href="/prospeccoes" className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent-ink mb-5 min-h-8">← Prospecções</Link>
            <header className="mb-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-2xl md:text-[28px] leading-tight font-extrabold tracking-tight break-words line-clamp-2" title={nomeDaProspeccao}>{nomeDaProspeccao}</h1>
                  <div className="flex items-center gap-2 flex-wrap mt-3">
                    <Chip nivel="neutral">{ROTULO_MODO[andamento.prospeccao.modo]}</Chip>
                    {andamento.prospeccao.demo && <Chip nivel="cinza">Exemplo</Chip>}
                    <span className="text-xs text-muted">Criada em {data(andamento.prospeccao.criadoEm, { comAno: true })}</span>
                  </div>
                </div>
                <button type="button" className="size-11 shrink-0 grid place-items-center rounded-xl border border-line text-muted hover:text-danger hover:border-danger/30 hover:bg-danger/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50" onClick={apagar} disabled={apagando} aria-label={apagando ? "Excluindo prospecção" : "Excluir prospecção"} title="Excluir prospecção">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>
                </button>
              </div>
              <details className="mt-4 rounded-xl border border-line bg-surface px-4 py-3">
                <summary className="text-sm cursor-pointer"><span className="font-semibold">Perfil e critérios</span><span className="text-muted ml-2">Ver detalhes da busca</span></summary>
                <div className="mt-3 text-sm leading-relaxed break-words">
                  <p className="font-semibold mb-1">{andamento.icpNome}</p>
                  {recorte && <p className="text-muted">{recorte}</p>}
                  <Link href={`/produtos/${andamento.prospeccao.produtoId}/icps/${andamento.prospeccao.icpId}`} className="btn-link inline-block mt-3 text-sm">Editar perfil ideal</Link>
                </div>
              </details>
            </header>
            {erroApagar && <div role="alert" className="mb-4"><Aviso tom="danger">{erroApagar}</Aviso></div>}
            {erroAtualizacao && <div role="alert" className="mb-4"><Aviso tom="warn" acao={semSessao ? { rotulo: "Entrar novamente", url: `/entrar?next=${encodeURIComponent(`/prospeccoes/${prospeccaoId}`)}` } : { rotulo: "Atualizar agora", onClick: () => setTentativa(t => t + 1) }}>
              <p className="font-semibold mb-1">O andamento pode estar desatualizado</p>
              {erroAtualizacao}
            </Aviso></div>}
            {andamento.prospeccao.estado !== "rascunho" && <ProgressoProspeccao prospeccao={andamento.prospeccao} jornada={andamento.jornada} consultas={andamento.consultas ?? []} decisoes={andamento.decisoes ?? []} contas={andamento.contasEncontradas} pessoas={andamento.leadsEncontrados + reencontrados.length + (mostrarParciais ? candidatos.length : 0)} ultimoContato={ultimoContato} semAtualizacao={!!erroAtualizacao} cancelando={cancelando} onCancelar={cancelar} />}
            {erroCancelar && <div role="alert" className="mb-4"><Aviso tom="danger">{erroCancelar}</Aviso></div>}
            {erroAcaoPessoa && <div role="alert" className="mb-4"><Aviso tom="danger">{erroAcaoPessoa}</Aviso></div>}
            {funil && funil.encontrados > 0 && <FunilResumo funil={funil} aba={filtraLeads ? aba : undefined} onAba={filtraLeads ? setAba : undefined} />}
            {mostrarParciais && <ResultadosParciais candidatos={candidatos} leads={andamento.prospeccao.estado === "pronta" ? [] : andamento.leads} contas={andamento.prospeccao.estado === "pronta" ? [] : andamento.contas} executando={andamento.prospeccao.estado === "executando"} />}
            {reencontrados.length > 0 && <section className="card p-5 mb-5" aria-labelledby="titulo-reencontrados">
              <h2 id="titulo-reencontrados" className="font-bold text-lg">Contatos já encontrados · {reencontrados.length}</h2>
              <p className="text-sm text-muted mt-2 mb-4">Estes perfis apareceram novamente. Atualizamos os dados encontrados na ficha existente e preservamos o histórico e as decisões comerciais.</p>
              <ul className="space-y-3">{reencontrados.map(lead => <li key={lead.id} className="flex items-center gap-3">
                <AvatarPessoa nome={lead.nome} url={lead.avatarUrl} />
                <div className="min-w-0"><p className="text-sm font-semibold break-words">{lead.nome}</p><p className="text-xs text-muted break-words">{[lead.cargo, lead.empresa].filter(Boolean).join(" · ")}</p><Link href={`/leads/${lead.id}`} className="text-xs text-accent-ink hover:underline">Abrir ficha existente</Link></div>
              </li>)}</ul>
            </section>}

            {!!andamento.decisoes?.length && (
              <details className="card px-5 py-4 mb-4">
                <summary className="text-sm font-semibold cursor-pointer">Como a pesquisa foi conduzida</summary>
                <ol className="mt-4 space-y-3 text-sm text-muted">{andamento.decisoes.map(d => <li key={d.id} className="border-l-2 border-line pl-3"><time className="text-xs tabular-nums mr-2" dateTime={d.criadoEm}>{new Date(d.criadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time>{d.mensagem}</li>)}</ol>
              </details>
            )}
            {!!andamento.consultas?.length && (
              <details id="fontes-consultadas" className="card p-5 mb-4 scroll-mt-6" open={andamento.prospeccao.estado === "falhou" || (!andamento.leadsEncontrados && !andamento.contasEncontradas && andamento.prospeccao.estado === "pronta")}>
                <summary className="font-semibold text-sm cursor-pointer">Fontes consultadas · {andamento.consultas.length} consultas</summary>
                <p className="text-xs text-muted mt-3">Os resultados das fontes são candidatos. A lista final considera critérios, evidências e contatos já encontrados.</p>
                <ul className="mt-3 flex flex-col gap-3">
                  {andamento.consultas.map(c => (
                    <li key={c.id} className="text-sm border-t border-line pt-3">
                      <div className="flex justify-between gap-3 flex-wrap">
                        <span className="font-semibold">{NOMES_FONTES[c.fonte] ?? c.fonte} · {nomeAcaoPesquisa(c.acao)}</span>
                        <span className={c.estado === "falhou" || c.estado === "limite" ? "text-danger" : "text-muted"}>{c.estado === "pendente" ? "Qualificação em andamento" : c.estado === "consultando" ? (andamento.prospeccao.estado === "executando" ? "Consultando…" : "Sem conclusão registrada") : c.estado === "falhou" ? "Falha na consulta" : c.estado === "limite" ? "Limite atingido" : c.estado === "vazia" ? "Sem resultados" : `${c.quantidade} resultado(s)`}</span>
                      </div>
                      <p className="text-xs text-muted mt-1 break-words">{c.consulta}</p>
                      {c.mensagem && <p className="text-xs text-danger mt-1">{c.mensagem}</p>}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {andamento.prospeccao.estado === "pronta" && (
              <div className="flex flex-col gap-3">
                <h2 className="font-bold text-lg">Próximo passo</h2>
                {andamento.prospeccao.erro && <Aviso tom="warn">{andamento.prospeccao.erro}</Aviso>}
                <p className="text-[13px] text-muted">
                  {andamento.consultas?.some(c => c.estado === "pendente") ? "O ProspectHalo ainda está preparando candidatos. Use Consultar resultados pendentes para recuperar a mesma busca e confira os perfis já disponíveis." : andamento.leadsEncontrados > 0 || reencontrados.length > 0 ? "Confira os perfis encontrados, valide as evidências e abra uma pessoa para preparar uma abordagem personalizada." : andamento.prospeccao.modo === "empresa_unica" ? "Não foi possível confirmar novos vínculos profissionais com esta empresa. Confira as fontes ou ajuste os critérios antes de repetir." : andamento.contasEncontradas > 0 ? "Confira as empresas e use Ver pessoas para encontrar quem decide em cada uma." : "Revise os cargos, amplie a localização ou simplifique os critérios antes de tentar novamente."}
                </p>

                {andamento.prospeccao.modo === "empresas" && (
                  <div className="flex flex-col gap-2.5 mb-1">
                    {andamento.contas.length === 0 ? (
                      <Aviso tom="warn">Nenhuma empresa encontrada com esses critérios.</Aviso>
                    ) : (
                      andamento.contas.map((conta) => (
                        <div key={conta.id} className="card p-4 flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                              <p className="font-semibold text-[14px]">{conta.nome}</p>
                              <p className="text-[13px] text-muted">
                                {[conta.cidade, conta.porte].filter(Boolean).join(" · ") || "Cidade e porte não identificados"}
                              </p>
                            </div>
                            {conta.fit && <Chip nivel={conta.fit}>{ROTULO_FIT[conta.fit]}</Chip>}
                          </div>
                          {conta.sinais.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {conta.sinais.slice(0, 3).map((sinal, i) => (
                                <ChipSinal key={i} sinal={sinal} />
                              ))}
                            </div>
                          )}
                          <EvidenciasResumo evidencias={conta.evidencias} />
                          <button
                            type="button"
                            className="btn-link text-[13px] self-start"
                            onClick={() => verPessoas(conta)}
                            disabled={buscandoPessoasId === conta.id}
                          >
                            {buscandoPessoasId === conta.id ? "Abrindo…" : "Ver pessoas"}
                          </button>
                        </div>
                      ))
                    )}
                    {erroVerPessoas && <Aviso tom="danger">{erroVerPessoas}</Aviso>}
                  </div>
                )}

                {andamento.prospeccao.modo === "pessoas" && andamento.jornada === "b2c" && (
                  <div className="flex flex-col gap-2.5 mb-1">
                    <Aviso tom="warn">Só entram dados que a própria pessoa publicou em perfil público; nada de lista comprada, inferência ou dado sensível.</Aviso>
                    {andamento.leads.length === 0 ? (
                      <Aviso tom="warn">Nenhuma pessoa encontrada com esses critérios.</Aviso>
                    ) : leadsFiltrados.length === 0 ? (
                      <Aviso tom="warn">Nenhuma pessoa nesta etapa do funil ainda.</Aviso>
                    ) : (
                      <>
                        <button type="button" className="btn-ghost self-end !w-auto" onClick={() => exportarLeadsCSV(leadsFiltrados)}>Exportar CSV</button>
                        <DataTable colunas={colunasLeads} linhas={ordenarLeadsPorPrioridade(leadsFiltrados)} />
                      </>
                    )}
                    {erroCRM && <Aviso tom="danger">{erroCRM}</Aviso>}
                  </div>
                )}

                {andamento.prospeccao.modo === "pessoas" && andamento.jornada === "b2b" && (
                  <div className="flex flex-col gap-2.5 mb-1">
                    {andamento.leads.length === 0 ? (
                      <Aviso tom="warn">Nenhuma pessoa encontrada com esses critérios.</Aviso>
                    ) : leadsFiltrados.length === 0 ? (
                      <Aviso tom="warn">Nenhuma pessoa nesta etapa do funil ainda.</Aviso>
                    ) : (
                      <>
                        <button type="button" className="btn-ghost self-end !w-auto" onClick={() => exportarLeadsCSV(leadsFiltrados)}>Exportar CSV</button>
                        <DataTable colunas={colunasLeads} linhas={ordenarLeadsPorPrioridade(leadsFiltrados)} />
                      </>
                    )}
                    {erroCRM && <Aviso tom="danger">{erroCRM}</Aviso>}
                  </div>
                )}

                {andamento.prospeccao.modo === "empresa_unica" && (
                  andamento.contas.length === 0 ? (
                    <Aviso tom="warn">Não encontramos essa empresa.</Aviso>
                  ) : (
                    <ExploracaoEmpresa
                      conta={andamento.contas[0]}
                      leads={andamento.leads}
                      reencontrados={reencontrados.length}
                      prospeccaoId={prospeccaoId}
                      icpPersonas={andamento.icpPersonas}
                      onLeadsAtualizados={(leads) => setAndamento((a) => (a ? { ...a, leads } : a))}
                    />
                  )
                )}

                {andamento.prospeccao.modo === "oportunidades" && (
                  <div className="flex flex-col gap-2.5 mb-1">
                    {andamento.contas.length === 0 && andamento.leads.length === 0 ? (
                      <Aviso tom="warn">Nenhuma oportunidade encontrada com esses critérios.</Aviso>
                    ) : (
                      <>
                        {andamento.contas.map((conta) => (
                          <div key={conta.id} className="card p-4 flex flex-col gap-2">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div>
                                <p className="font-semibold text-[14px]">{conta.nome}</p>
                                <p className="text-[13px] text-muted">{conta.setor || "Segmento não identificado"}</p>
                              </div>
                              {conta.fit && <Chip nivel={conta.fit}>{ROTULO_FIT[conta.fit]}</Chip>}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {conta.sinais.map((sinal, i) => (
                                <ChipSinal key={i} sinal={sinal} />
                              ))}
                            </div>
                            <EvidenciasResumo evidencias={conta.evidencias} />
                          </div>
                        ))}
                        {andamento.leads.length > 0 && (
                          leadsFiltrados.length === 0 ? (
                            <Aviso tom="warn">Nenhuma pessoa nesta etapa do funil ainda.</Aviso>
                          ) : (
                            <>
                              <button type="button" className="btn-ghost self-end !w-auto" onClick={() => exportarLeadsCSV(leadsFiltrados)}>Exportar CSV</button>
                              <DataTable colunas={colunasLeads} linhas={ordenarLeadsPorPrioridade(leadsFiltrados)} />
                            </>
                          )
                        )}
                      </>
                    )}
                    {erroCRM && <Aviso tom="danger">{erroCRM}</Aviso>}
                  </div>
                )}

                <div className="flex items-center flex-wrap gap-3.5">
                  <Link href="/leads" className="btn-link text-[13px]">Ver leads</Link>
                  <Link href={`/prospeccoes/nova?produtoId=${andamento.prospeccao.produtoId}&icpId=${andamento.prospeccao.icpId}`} className="btn-link text-[13px]">Ajustar critérios</Link>
                  <button type="button" className="btn-link text-[13px]" onClick={repetir} disabled={repetindo}>
                    {repetindo ? "Iniciando…" : andamento.consultas?.some(c => c.estado === "pendente") ? "Consultar resultados pendentes" : "Repetir prospecção"}
                  </button>
                </div>
                {erroRepetir && <Aviso tom="danger">{erroRepetir}</Aviso>}
              </div>
            )}

            {(andamento.prospeccao.estado === "falhou" || andamento.prospeccao.estado === "cancelada") && (
              <div className="flex flex-col gap-3">
                <Aviso tom={andamento.prospeccao.estado === "falhou" ? "danger" : "warn"}>
                  {andamento.prospeccao.erro ?? "A busca foi cancelada. Os resultados encontrados até aqui foram preservados."}
                </Aviso>
                <p className="text-sm text-muted">Confira as fontes e os critérios antes de repetir. Uma nova busca será criada, preservando este histórico.</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <button type="button" className="btn-ghost !text-sm" onClick={repetir} disabled={repetindo}>{repetindo ? "Iniciando…" : "Tentar novamente"}</button>
                  <Link href={`/prospeccoes/nova?produtoId=${andamento.prospeccao.produtoId}&icpId=${andamento.prospeccao.icpId}`} className="btn-link text-sm">Ajustar critérios</Link>
                  <Link href="/setup" className="btn-link text-sm">Verificar conexões</Link>
                  {andamento.leads.length > 0 && <Link href="/leads" className="btn-link text-sm">Ver pessoas já encontradas</Link>}
                </div>
                {erroRepetir && <div role="alert"><Aviso tom="danger">{erroRepetir}</Aviso></div>}
              </div>
            )}
          </>
        )}
      </main>

      {Dialogo}
    </>
  );
}

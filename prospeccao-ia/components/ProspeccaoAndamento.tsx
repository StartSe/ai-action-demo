"use client";
// Tela de andamento de uma prospecção (US-013): a mesma rota de polling (GET
// /api/prospeccoes/[id]/andamento) serve a carga inicial e o poll a cada 2 s, então sair da tela e
// voltar (ou recarregar) sempre mostra o andamento correto, inclusive já concluído. O poll só roda
// enquanto a aba está visível (document.visibilityState === "visible") e só enquanto o estado é
// "executando" — mesmo padrão de components/ConexaoWhatsApp.tsx (whatsapp-atendente): o efeito depende
// do ESTADO (primitivo), não do objeto inteiro de andamento, para não reiniciar o intervalo a cada poll.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, Chip, DataTable, Topbar, data, useConfirmacao, useStatus, lerErro, type Coluna } from "@/components/ui";
import { ExploracaoEmpresa } from "@/components/ExploracaoEmpresa";
import { baixarCSV } from "@/lib/exportacao";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import { formatarFunil, funilContagens, motivoPapel, ordenarLeadsPorPrioridade, sinalAntigo, sinalMaisRecente } from "@/lib/qualificacao";
import { NIVEL_CHIP_EVIDENCIA, ORDEM_MOTIVOS_DESCARTE, ORDEM_STATUS_LEAD, ROTULO_FIT, ROTULO_MODO, ROTULO_MOTIVO_DESCARTE, ROTULO_PAPEL, ROTULO_RESULTADO_EVIDENCIA, ROTULO_STATUS_LEAD, nomeProspeccao, recorteProspeccao } from "@/lib/rotulos";
import { ETAPAS_PROSPECCAO } from "@/lib/execucao-etapas";
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

/** Até `max` palavras, com o texto inteiro no `title` (US-033, coluna "Sinal"): a lista prioriza
 * densidade — a frase inteira, evidências e hipótese de dor continuam na ficha ("Ver ficha", no menu
 * "•••" abaixo), que já mostra tudo isso por extenso desde a US-027. */
function truncarPalavras(texto: string, max: number): string {
  const palavras = texto.trim().split(/\s+/);
  if (palavras.length <= max) return texto;
  return `${palavras.slice(0, max).join(" ")}…`;
}

/** Abas do funil (US-035): filtram a lista de leads por progresso MÍNIMO (ver funilContagens em
 * lib/qualificacao.ts, mesma ordem/regra) — "Descobertos" não tem mínimo, mostra todo mundo, inclusive
 * quem já foi descartado. Só aparecem nos modos que desenham `DataTable` de leads nesta tela
 * ("pessoas"/"oportunidades"); "empresas" e "empresa_unica" não têm uma lista de leads própria para filtrar. */
type AbaFunil = "descobertos" | "qualificados" | "selecionados" | "contatados" | "responderam";

const ABAS_FUNIL: { chave: AbaFunil; rotulo: string; minimo?: StatusLead }[] = [
  { chave: "descobertos", rotulo: "Descobertos" },
  { chave: "qualificados", rotulo: "Qualificados", minimo: "qualificado" },
  { chave: "selecionados", rotulo: "Selecionados", minimo: "selecionado" },
  { chave: "contatados", rotulo: "Contatados", minimo: "abordado" },
  { chave: "responderam", rotulo: "Responderam", minimo: "respondeu" },
];

function leadsNaAba(leads: LeadProspeccao[], aba: AbaFunil): LeadProspeccao[] {
  const minimo = ABAS_FUNIL.find((a) => a.chave === aba)?.minimo;
  if (!minimo) return leads;
  const indiceMinimo = ORDEM_STATUS_LEAD.indexOf(minimo);
  return leads.filter((l) => ORDEM_STATUS_LEAD.indexOf(l.status) >= indiceMinimo);
}

/** Abas do funil (US-035): `role="tablist"` local, sem componente compartilhado ainda (só esta tela
 * precisa hoje) — mesmo critério já usado para outros pares de abas pequenos e locais desta suíte. */
function AbasFunil({ aba, onChange }: { aba: AbaFunil; onChange: (aba: AbaFunil) => void }) {
  return (
    <div role="tablist" aria-label="Etapas do funil" className="flex gap-1.5 flex-wrap mb-3">
      {ABAS_FUNIL.map((item) => (
        <button
          key={item.chave}
          type="button"
          role="tab"
          aria-selected={aba === item.chave}
          className={`px-3 py-1.5 rounded-full text-[13px] font-semibold border cursor-pointer ${
            aba === item.chave ? "bg-accent text-white border-accent" : "border-line text-muted hover:text-ink"
          }`}
          onClick={() => onChange(item.chave)}
        >
          {item.rotulo}
        </button>
      ))}
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
        <div>
          <p className="font-semibold text-[14px]">{l.nome}</p>
          {l.linkedin && (
            <a href={l.linkedin} target="_blank" rel="noopener noreferrer" className="text-[12px] text-accent-ink hover:underline">Ver perfil</a>
          )}
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
  const [buscandoPessoasId, setBuscandoPessoasId] = useState<string | null>(null);
  const [erroVerPessoas, setErroVerPessoas] = useState<string | null>(null);
  const [apagandoPessoaId, setApagandoPessoaId] = useState<string | null>(null);
  const [enviandoCRMId, setEnviandoCRMId] = useState<string | null>(null);
  const [erroCRM, setErroCRM] = useState<string | null>(null);
  const [aba, setAba] = useState<AbaFunil>("descobertos");

  const carregar = useCallback(() => {
    fetch(`/api/prospeccoes/${prospeccaoId}/andamento`)
      .then(async (r) => {
        if (r.status === 404) {
          setNaoEncontrada(true);
          return;
        }
        const dados = (await r.json()) as Andamento;
        setAndamento(dados);
      })
      .catch(() => { /* próxima consulta tenta de novo; a tela mantém o último andamento conhecido */ });
  }, [prospeccaoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (andamento?.prospeccao.estado !== "executando") return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") carregar();
    }, INTERVALO_POLL_MS);
    return () => clearInterval(id);
  }, [andamento?.prospeccao.estado, carregar]);

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
    const ok = await confirmar("Apagar esta prospecção? As empresas, pessoas e abordagens encontradas aqui somem junto.", { confirmarRotulo: "Apagar" });
    if (!ok) return;
    setApagando(true);
    await fetch(`/api/prospeccoes/${prospeccaoId}`, { method: "DELETE" });
    router.push("/prospeccoes");
  }

  /** "Apagar dados desta pessoa" (US-021, jornada B2C): apaga o lead e as abordagens dele por completo,
   * sem afetar mais ninguém da prospecção — diferente de "Apagar" (acima), que apaga a prospecção inteira. */
  async function apagarPessoa(leadId: string) {
    const ok = await confirmar("Apagar os dados desta pessoa? A ação não pode ser desfeita.", { confirmarRotulo: "Apagar" });
    if (!ok) return;
    setApagandoPessoaId(leadId);
    await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
    setAndamento((a) => (a ? { ...a, leads: a.leads.filter((l) => l.id !== leadId) } : a));
    setApagandoPessoaId(null);
  }

  /** "Mudar status"/"Descartar" do menu "•••" (US-033/US-034): `PUT /api/leads/[id]` com `{ status }` (mais
   * `motivo`, só quando `status === "descartado"`) — extensão da mesma rota que já grava `papel` (US-026),
   * a única escrita de status fora do pipeline. */
  async function mudarStatusLead(leadId: string, status: StatusLead, motivo?: MotivoDescarte) {
    const corpo = status === "descartado" ? { status, motivo } : { status };
    const r = await fetch(`/api/leads/${leadId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    if (!r.ok) return;
    const atualizado = (await r.json()) as LeadProspeccao;
    setAndamento((a) => (a ? { ...a, leads: a.leads.map((l) => (l.id === leadId ? atualizado : l)) } : a));
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

  const indiceEtapaAtual = andamento ? ETAPAS_PROSPECCAO.findIndex((e) => e.chave === andamento.prospeccao.etapa) : -1;
  const nomeDaProspeccao = andamento ? nomeProspeccao(andamento.produtoNome, andamento.prospeccao.modo, andamento.prospeccao.criterios) : "";
  const recorte = andamento ? recorteProspeccao(andamento.prospeccao.modo, andamento.prospeccao.criterios) : "";
  const funil = andamento ? funilContagens(andamento.leads) : null;
  const leadsFiltrados = andamento ? leadsNaAba(andamento.leads, aba) : [];
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
        ) : !andamento ? (
          <div className="card p-6 flex flex-col gap-4" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className="skeleton block w-full h-11" />
            ))}
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-4 flex-wrap mb-1.5">
              <h1 className="titulo-painel !mb-0">{nomeDaProspeccao}</h1>
              <button type="button" className="btn-link text-[13px] text-danger" onClick={apagar} disabled={apagando}>
                {apagando ? "Apagando…" : "Apagar"}
              </button>
            </div>
            <p className="text-[13px] text-muted mb-1">
              {data(andamento.prospeccao.criadoEm, { comAno: true })} · {ROTULO_MODO[andamento.prospeccao.modo]}
            </p>
            {funil && <p className="apoio mb-1.5">{formatarFunil(funil)}</p>}
            <p className="text-[13px] text-muted mb-6 line-clamp-2">
              {andamento.produtoNome} · {andamento.icpNome}
              {recorte && ` · ${recorte}`}
              {" · "}
              <Link href={`/produtos/${andamento.prospeccao.produtoId}/icps/${andamento.prospeccao.icpId}`} className="btn-link text-[13px]">Editar estratégia</Link>
            </p>

            {(andamento.prospeccao.estado === "executando" || andamento.prospeccao.estado === "pronta") && (
              <div className="card p-6 flex flex-col gap-4 mb-4">
                <ol className="flex flex-col gap-3">
                  {ETAPAS_PROSPECCAO.map((etapa, i) => {
                    const concluida = andamento.prospeccao.estado === "pronta" || i < indiceEtapaAtual;
                    const atual = andamento.prospeccao.estado === "executando" && i === indiceEtapaAtual;
                    return (
                      <li key={etapa.chave} className="flex items-center gap-3">
                        <span
                          className={`shrink-0 w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold ${
                            concluida ? "bg-ok text-white" : atual ? "border-2 border-accent" : "border-2 border-line"
                          }`}
                          aria-hidden="true"
                        >
                          {concluida ? "✓" : ""}
                        </span>
                        <span className={concluida ? "text-ink" : atual ? "text-ink font-semibold" : "text-muted"}>{etapa.rotulo}</span>
                        {atual && <span className="text-[12px] text-accent-ink" aria-live="polite">Em andamento…</span>}
                      </li>
                    );
                  })}
                </ol>
                <p className="text-[13px] text-muted">
                  {andamento.contasEncontradas} empresas · {andamento.leadsEncontrados} pessoas encontradas até agora
                </p>
              </div>
            )}

            {andamento.prospeccao.estado === "executando" && (
              <div className="flex flex-col gap-3">
                <button type="button" className="btn-ghost self-start !w-auto" onClick={cancelar} disabled={cancelando}>
                  {cancelando ? "Cancelando…" : "Cancelar"}
                </button>
                {erroCancelar && <Aviso tom="danger">{erroCancelar}</Aviso>}
              </div>
            )}

            {andamento.prospeccao.estado === "pronta" && (
              <div className="flex flex-col gap-3">
                <p className="font-semibold text-[15px]">Prospecção concluída</p>
                {andamento.prospeccao.erro && <Aviso tom="warn">{andamento.prospeccao.erro}</Aviso>}
                <p className="text-[13px] text-muted">
                  {andamento.contasEncontradas} empresas e {andamento.leadsEncontrados} pessoas encontradas.
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
                          <EvidenciasLista evidencias={conta.evidencias} />
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
                    {andamento.leads.length > 0 && <AbasFunil aba={aba} onChange={setAba} />}
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
                    {andamento.leads.length > 0 && <AbasFunil aba={aba} onChange={setAba} />}
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
                      prospeccaoId={prospeccaoId}
                      icpPersonas={andamento.icpPersonas}
                      onLeadsAtualizados={(leads) => setAndamento((a) => (a ? { ...a, leads } : a))}
                    />
                  )
                )}

                {andamento.prospeccao.modo === "oportunidades" && (
                  <div className="flex flex-col gap-2.5 mb-1">
                    {andamento.leads.length > 0 && <AbasFunil aba={aba} onChange={setAba} />}
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
                            <EvidenciasLista evidencias={conta.evidencias} />
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

                <div className="flex items-center gap-3.5">
                  <Link href="/leads" className="btn-link text-[13px]">Ver leads</Link>
                  <button type="button" className="btn-link text-[13px]" onClick={repetir} disabled={repetindo}>
                    {repetindo ? "Repetindo…" : "Repetir prospecção"}
                  </button>
                </div>
                {erroRepetir && <Aviso tom="danger">{erroRepetir}</Aviso>}
              </div>
            )}

            {andamento.prospeccao.estado === "falhou" && (
              <div className="flex flex-col gap-3">
                <Aviso tom="danger" acao={{ rotulo: repetindo ? "Repetindo…" : "Repetir", onClick: repetir }}>
                  {andamento.prospeccao.erro ?? "Não foi possível concluir esta prospecção."}
                </Aviso>
                {erroRepetir && <Aviso tom="danger">{erroRepetir}</Aviso>}
              </div>
            )}

            {andamento.prospeccao.estado === "cancelada" && (
              <Aviso tom="warn">Esta prospecção foi cancelada.</Aviso>
            )}
          </>
        )}
      </main>

      {Dialogo}
    </>
  );
}

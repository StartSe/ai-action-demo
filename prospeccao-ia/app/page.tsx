"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Aviso, Chip, CopyButton, DataTable, Entregar, ErrorBox, Field, Hero, Item, Loading, MaisDetalhes, Origem, Passos, Privacidade, ResultHead, Row, Section, SeloIA, Stage, Topbar, data, lerErro, useConfirmacao, useScrollToResult, useStatus, type Coluna, type PassoIndicador } from "@/components/ui";
import { ACAO_BUSCA_DE_LEADS, ACAO_CONFERIR_CRM, ACAO_NOTIFICACOES } from "@/lib/acoes";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import { NAVEGACAO_PROSPECCAO } from "@/lib/navegacao-prospeccao";
import type { Abordagem, DadosBusca, Fonte, Lead } from "@/lib/types";

type ItemHistorico = { id: string; tipo: string; titulo: string; criadoEm: string };

const EXEMPLO: DadosBusca = {
  segmento: "indústria de alimentos",
  cargo: "Diretor de Operações",
  localizacao: "São Paulo, Brasil",
  porte: "51-200",
  proposta:
    "Vendemos um sistema de gestão de manutenção industrial (CMMS) que reduz parada não programada de máquinas. Atendemos indústrias de médio porte que hoje controlam a manutenção em planilha, com implantação em 3 semanas e sem precisar trocar o ERP.",
  quantidade: "15",
  remetenteNome: "Mariana Duarte",
  remetenteEmpresa: "Zetta Manutenção Industrial",
};

const VAZIO: DadosBusca = { segmento: "", cargo: "", localizacao: "", porte: "51-200", proposta: "", quantidade: "10", remetenteNome: "", remetenteEmpresa: "" };

const ETAPAS_BUSCA = ["Lendo o perfil de cliente ideal informado...", "Cruzando com segmento, cargo e localização...", "Montando a lista de leads..."];

/** Quantos leads a demonstração (`?exemplo=1` e "Ver leads de exemplo") já entrega com a abordagem escrita. */
const LEADS_DA_DEMONSTRACAO = 1;

/** Quantos leads entram no atalho "Escrever para os N melhores". */
const MELHORES = 5;

// Textos do topo (economia de texto: título ≤ 8 palavras, apoio ≤ 20, itens ≤ 5 de até 6 palavras — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Vendas",
  titulo: "Sua lista de leads com a abordagem pronta",
  apoio: "Descreva o cliente ideal: a IA monta a lista e escreve a primeira abordagem de cada lead.",
  itens: [
    "Leads com nome e cargo",
    "Empresa, porte e cidade",
    "Um sinal para abrir a conversa",
    "E-mail, LinkedIn e WhatsApp",
    "Lista pronta para o CRM",
  ],
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Cliente ideal", apoio: "Segmento e cargo" },
  { titulo: "Leads", apoio: "Com um sinal cada" },
  { titulo: "Abordagem", apoio: "Nos três canais" },
];

function etapasAbordagem(nome: string) {
  return ["Lendo o sinal e o perfil do lead...", "Conectando com o que sua empresa vende...", `Escrevendo a abordagem para ${nome}...`];
}

function IconeAlvo() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2" />
    </svg>
  );
}

function IconeProposta() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.5h16M4 10h16M4 14.5h11" />
      <path d="M15.5 19.5 18 17l3.5 3.5" />
    </svg>
  );
}

function IconeItem() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0 mt-0.5" aria-hidden="true">
      <path d="M5 12.5 9.5 17 19 7" />
    </svg>
  );
}

/** Desenho de três contatos (avatar + linhas), no lugar de um glifo genérico. */
function IlustracaoLeads() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="16" r="5" />
      <path d="M22 14h30M22 19h18" />
      <circle cx="12" cy="32" r="5" />
      <path d="M22 30h30M22 35h22" />
      <circle cx="12" cy="48" r="5" />
      <path d="M22 46h30M22 51h14" />
    </svg>
  );
}

/** Cartão de entrada com ícone circular e título. */
function CartaoEntrada({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <div className="card p-5 mb-2.5">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0">{icone}</div>
        <h2 className="font-bold text-[15px]">{titulo}</h2>
      </div>
      {children}
    </div>
  );
}

/** Prévia de "o que você vai receber", no lugar do resultado antes da primeira busca. */
function Previa({ itens, onExemplo, carregando }: { itens: string[]; onExemplo: () => void; carregando: boolean }) {
  return (
    <div className="card p-7 max-md:p-5 h-full min-h-[420px] max-md:min-h-0 flex flex-col justify-center">
      <div className="text-accent mb-4">
        <IlustracaoLeads />
      </div>
      <h2 className="font-bold text-[15px] mb-4">O que você vai receber</h2>
      <ul className="flex flex-col gap-3 mb-6">
        {itens.map((it) => (
          <li key={it} className="flex items-start gap-2.5 text-sm text-ink-2">
            <IconeItem />
            <span>{it}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn-secundario !w-auto self-start" onClick={onExemplo} disabled={carregando}>Ver leads de exemplo</button>
    </div>
  );
}

/**
 * Leads com mais material para personalizar a abordagem primeiro (sinal com fatos, LinkedIn, site, cargo):
 * é o que "os N melhores" quer dizer aqui — a busca não devolve pontuação, e ordenar por dado aproveitável
 * é a única leitura verdadeira de "melhor" nesta lista.
 */
function maisMaterial(leads: Lead[], quantos: number): Lead[] {
  const forca = (l: Lead) => (l.sinal ? Math.min(3, Math.ceil(l.sinal.length / 40)) : 0) + (l.linkedin ? 2 : 0) + (l.site ? 1 : 0) + (l.cargo ? 1 : 0);
  return [...leads].sort((a, b) => forca(b) - forca(a)).slice(0, quantos);
}

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string }; dados: DadosBusca }
  | { fase: "lista"; dados: DadosBusca; fonte: Fonte; leads: Lead[]; meta: Meta; id?: string }
  | { fase: "carregando-abordagem"; dados: DadosBusca; fonte: Fonte; leads: Lead[]; meta: Meta; id?: string; lead: Lead }
  | { fase: "erro-abordagem"; dados: DadosBusca; fonte: Fonte; leads: Lead[]; meta: Meta; id?: string; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string } }
  | { fase: "abordagem"; dados: DadosBusca; fonte: Fonte; leads: Lead[]; meta: Meta; id?: string; lead: Lead; abordagem: Abordagem; metaAbordagem: Meta };

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

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [dados, setDados] = useState<DadosBusca>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const [historico, setHistorico] = useState<ItemHistorico[] | null>(null);
  const [abordagens, setAbordagens] = useState<Record<string, { abordagem: Abordagem; meta: Meta }>>({});
  const [carregandoIds, setCarregandoIds] = useState<Set<string>>(new Set());
  const [erroLote, setErroLote] = useState<string | null>(null);
  const [enviandoCRMIds, setEnviandoCRMIds] = useState<Set<string>>(new Set());
  const [erroCRM, setErroCRM] = useState<string | null>(null);
  const [avisoCRM, setAvisoCRM] = useState<string | null>(null);
  const autoEnviado = useRef(false);
  const { confirmar, Dialogo } = useConfirmacao();

  useScrollToResult(estado.fase === "lista" || estado.fase === "abordagem");

  function carregarHistorico() {
    fetch("/api/leads").then((r) => r.json()).then((r) => {
      setHistorico(r.itens);
      if (r.remetenteNome || r.remetenteEmpresa) {
        setDados((d) => ({ ...d, remetenteNome: d.remetenteNome || r.remetenteNome || "", remetenteEmpresa: d.remetenteEmpresa || r.remetenteEmpresa || "" }));
      }
    }).catch(() => setHistorico([]));
  }

  useEffect(() => { carregarHistorico(); }, []);

  async function apagarHistorico() {
    if (!(await confirmar("Apagar todas as buscas salvas? Essa ação não pode ser desfeita.", { confirmarRotulo: "Apagar" }))) return;
    fetch("/api/leads", { method: "DELETE" }).then(carregarHistorico);
  }

  const set = (campo: keyof DadosBusca) => (e: { target: { value: string } }) => setDados((d) => ({ ...d, [campo]: e.target.value }));

  /** Sessão expirada em qualquer chamada: volta para a tela de entrar e retorna para cá depois. */
  function sessaoExpirou(r: Response, codigo?: string): boolean {
    if (r.status === 401 && codigo === "sem_sessao") {
      router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
      return true;
    }
    return false;
  }

  async function buscarLeads(d: DadosBusca, escreverPrimeiros = 0) {
    setEstado({ fase: "carregando" });
    setAbordagens({});
    setCarregandoIds(new Set());
    setErroLote(null);
    setErroCRM(null);
    setAvisoCRM(null);
    try {
      const r = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirou(r, info.codigo)) return;
        setEstado({ fase: "erro", mensagem: info.mensagem, codigo: info.codigo as CodigoErroIA | undefined, acao: info.acao, dados: d });
        return;
      }
      const resposta = await r.json();
      setEstado({ fase: "lista", dados: d, fonte: resposta.fonte, leads: resposta.leads, meta: resposta.meta, id: resposta.id });
      carregarHistorico();
      if (escreverPrimeiros > 0 && resposta.leads?.length) {
        escreverEmLote(d, maisMaterial(resposta.leads as Lead[], escreverPrimeiros));
      }
    } catch (e) {
      setEstado({ fase: "erro", mensagem: (await lerErro(e)).mensagem, dados: d });
    }
  }

  async function gerarAbordagemParaLead(dadosBusca: DadosBusca, lead: Lead): Promise<{ abordagem: Abordagem; meta: Meta }> {
    const r = await fetch("/api/abordagem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead, proposta: dadosBusca.proposta, segmento: dadosBusca.segmento, remetenteNome: dadosBusca.remetenteNome, remetenteEmpresa: dadosBusca.remetenteEmpresa }),
    });
    if (!r.ok) {
      const info = await lerErro(r);
      if (sessaoExpirou(r, info.codigo)) throw new ErroTratado(info.mensagem, info.codigo, info.acao);
      throw new ErroTratado(info.mensagem, info.codigo, info.acao);
    }
    const resposta = await r.json();
    return { abordagem: resposta.abordagem, meta: resposta.meta };
  }

  async function buscarAbordagem(dadosBusca: DadosBusca, fonte: Fonte, leads: Lead[], metaLista: Meta, idLista: string | undefined, lead: Lead) {
    const emCache = abordagens[lead.id];
    if (emCache) {
      setEstado({ fase: "abordagem", dados: dadosBusca, fonte, leads, meta: metaLista, id: idLista, lead, abordagem: emCache.abordagem, metaAbordagem: emCache.meta });
      return;
    }
    setEstado({ fase: "carregando-abordagem", dados: dadosBusca, fonte, leads, meta: metaLista, id: idLista, lead });
    try {
      const { abordagem, meta: metaAbordagem } = await gerarAbordagemParaLead(dadosBusca, lead);
      setAbordagens((prev) => ({ ...prev, [lead.id]: { abordagem, meta: metaAbordagem } }));
      setEstado({ fase: "abordagem", dados: dadosBusca, fonte, leads, meta: metaLista, id: idLista, lead, abordagem, metaAbordagem });
    } catch (e) {
      const info = e instanceof ErroTratado ? e : await lerErro(e);
      setEstado({ fase: "erro-abordagem", dados: dadosBusca, fonte, leads, meta: metaLista, id: idLista, mensagem: info.mensagem, codigo: info.codigo as CodigoErroIA | undefined, acao: info.acao });
    }
  }

  async function escreverEmLote(dadosBusca: DadosBusca, selecionados: Lead[]) {
    const pendentes = selecionados.filter((l) => !abordagens[l.id]);
    if (!pendentes.length) return;
    setErroLote(null);
    setCarregandoIds((prev) => new Set([...prev, ...pendentes.map((l) => l.id)]));
    const falhas: string[] = [];
    let motivo = "";
    for (const lead of pendentes) {
      try {
        const { abordagem, meta: metaAbordagem } = await gerarAbordagemParaLead(dadosBusca, lead);
        setAbordagens((prev) => ({ ...prev, [lead.id]: { abordagem, meta: metaAbordagem } }));
      } catch (e) {
        falhas.push(lead.nome);
        if (!motivo && e instanceof ErroTratado) motivo = e.mensagem;
      } finally {
        setCarregandoIds((prev) => {
          const novo = new Set(prev);
          novo.delete(lead.id);
          return novo;
        });
      }
    }
    if (falhas.length) setErroLote(`Não foi possível escrever para: ${falhas.join(", ")}.${motivo ? ` ${motivo}` : ""}`);
  }

  async function enviarParaCRM(buscaId: string, selecionados: Lead[]) {
    if (!selecionados.length) return;
    const mensagemConfirmacao =
      selecionados.length === 1 ? `Enviar ${selecionados[0].nome} para o CRM como contato?` : `Enviar ${selecionados.length} leads para o CRM como contatos?`;
    if (!(await confirmar(mensagemConfirmacao, { confirmarRotulo: "Enviar" }))) return;
    setErroCRM(null);
    setAvisoCRM(null);
    setEnviandoCRMIds((prev) => new Set([...prev, ...selecionados.map((l) => l.id)]));
    try {
      const r = await fetch(`/api/leads/${buscaId}/crm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selecionados.map((l) => l.id) }),
      });
      if (!r.ok) {
        const info = await lerErro(r);
        if (sessaoExpirou(r, info.codigo)) return;
        setErroCRM(info.mensagem);
        return;
      }
      const resposta = await r.json();
      setEstado((prev) => (prev.fase === "lista" || prev.fase === "abordagem" || prev.fase === "carregando-abordagem" || prev.fase === "erro-abordagem" ? { ...prev, leads: resposta.leads } : prev));
      const falhas = (resposta.resultados || []).filter((res: { ok: boolean }) => !res.ok);
      if (falhas.length) setErroCRM(`Não entraram no CRM: ${falhas.map((f: { nome: string }) => f.nome).join(", ")}. Tente de novo; se continuar, confira a conexão em Configurações.`);
      else setAvisoCRM(selecionados.length === 1 ? `${selecionados[0].nome} entrou no CRM.` : `${selecionados.length} leads entraram no CRM.`);
    } catch (e) {
      setErroCRM((await lerErro(e)).mensagem);
    } finally {
      setEnviandoCRMIds((prev) => {
        const novo = new Set(prev);
        selecionados.forEach((l) => novo.delete(l.id));
        return novo;
      });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    buscarLeads(dados);
  }

  /** "Ver leads de exemplo" preenche, busca e já escreve a abordagem do lead com mais material. */
  function verExemplo() {
    setDados(EXEMPLO);
    buscarLeads(EXEMPLO, LEADS_DA_DEMONSTRACAO);
  }

  function tentarNovamente() {
    if (estado.fase === "erro") buscarLeads(estado.dados);
  }

  // Atalho para demonstrações: /?exemplo=1 preenche, busca os leads e escreve a primeira abordagem.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(verExemplo, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const carregando = estado.fase === "carregando";
  const passoAtual = estado.fase === "abordagem" ? 3 : estado.fase === "vazio" || estado.fase === "carregando" || estado.fase === "erro" ? 1 : 2;

  function voltarALista() {
    if (estado.fase === "abordagem" || estado.fase === "erro-abordagem" || estado.fase === "carregando-abordagem") {
      setEstado({ fase: "lista", dados: estado.dados, fonte: estado.fonte, leads: estado.leads, meta: estado.meta, id: estado.id });
    }
  }

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} resumo="Modo demonstração: os leads exibidos são fictícios." usuario={status?.usuario} navegacao={NAVEGACAO_PROSPECCAO} />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Vendas">
        <Passos passos={PASSOS} atual={passoAtual} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          <form onSubmit={onSubmit}>
            <CartaoEntrada icone={<IconeAlvo />} titulo="O cliente ideal">
              <Field label="Segmento" htmlFor="segmento">
                <input id="segmento" className="input" required placeholder="Indústria de alimentos" value={dados.segmento} onChange={set("segmento")} />
              </Field>
              <Row>
                <Field label="Cargo-alvo" htmlFor="cargo">
                  <input id="cargo" className="input" required placeholder="Diretor de Operações" value={dados.cargo} onChange={set("cargo")} />
                </Field>
                <Field label="Localização" htmlFor="localizacao">
                  <input id="localizacao" className="input" required placeholder="São Paulo, Brasil" value={dados.localizacao} onChange={set("localizacao")} />
                </Field>
              </Row>
            </CartaoEntrada>

            <CartaoEntrada icone={<IconeProposta />} titulo="O que você vende">
              <Field label="O que sua empresa vende e para quem" htmlFor="proposta">
                <textarea
                  id="proposta"
                  className="input min-h-20 resize-y"
                  required
                  placeholder="Quanto mais concreto, melhor o gancho. Ex.: vendemos um sistema de manutenção industrial para indústrias de médio porte, que reduz parada de máquina..."
                  value={dados.proposta}
                  onChange={set("proposta")}
                />
              </Field>
              <div className="[&>details]:mb-0">
                <MaisDetalhes titulo="Assinatura, porte e quantidade">
                  <Row>
                    <Field label="Seu nome" htmlFor="remetenteNome" hint="Assina o e-mail e o WhatsApp.">
                      <input id="remetenteNome" className="input" placeholder="Seu nome" value={dados.remetenteNome ?? ""} onChange={set("remetenteNome")} />
                    </Field>
                    <Field label="Sua empresa" htmlFor="remetenteEmpresa">
                      <input id="remetenteEmpresa" className="input" placeholder="Nome da sua empresa" value={dados.remetenteEmpresa ?? ""} onChange={set("remetenteEmpresa")} />
                    </Field>
                  </Row>
                  <Row>
                    <Field label="Porte da empresa" htmlFor="porte">
                      <select id="porte" className="input" value={dados.porte} onChange={set("porte")}>
                        <option value="11-50">11 a 50 funcionários</option>
                        <option value="51-200">51 a 200 funcionários</option>
                        <option value="201-500">201 a 500 funcionários</option>
                        <option value="501-1000">501 a 1.000 funcionários</option>
                        <option value="1001-5000">1.001 a 5.000 funcionários</option>
                      </select>
                    </Field>
                    <Field label="Quantidade de leads" htmlFor="quantidade">
                      <select id="quantidade" className="input" value={dados.quantidade} onChange={set("quantidade")}>
                        <option value="5">5 leads</option>
                        <option value="10">10 leads</option>
                        <option value="15">15 leads</option>
                      </select>
                    </Field>
                  </Row>
                </MaisDetalhes>
              </div>
            </CartaoEntrada>

            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Buscando leads" : "Buscar leads"}</button>
            <button type="button" className="btn-secundario mt-2" disabled={carregando} onClick={verExemplo}>Ver leads de exemplo</button>
          </form>

          <div className="card p-5 mt-4">
            <Privacidade detalhe="As listas ficam salvas neste app até você apagar. Nenhuma mensagem é enviada sem você aprovar." />

            <MaisDetalhes titulo="Últimos resultados">
              {historico === null ? (
                <p className="text-muted text-sm">Carregando...</p>
              ) : historico.length === 0 ? (
                <p className="text-muted text-sm">Nenhum resultado salvo ainda.</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-1.5 text-sm mb-3">
                    {historico.slice(0, 3).map((h) => (
                      <li key={h.id} className="flex justify-between gap-3">
                        <Link href={`/r/${h.id}`} className="text-accent-ink font-semibold hover:underline truncate">{h.titulo}</Link>
                        <span className="text-muted shrink-0">{data(h.criadoEm)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-4">
                    <Link href="/prospeccoes" className="btn-link text-[13px]">Ver todos</Link>
                    <button type="button" className="btn-ghost" onClick={apagarHistorico}>Apagar tudo</button>
                  </div>
                </>
              )}
            </MaisDetalhes>
          </div>
        </div>

        <Stage>
          {estado.fase === "vazio" && <Previa itens={PROMESSA.itens} onExemplo={verExemplo} carregando={carregando} />}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_BUSCA} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} codigo={estado.codigo} acao={estado.acao} onTentarNovamente={tentarNovamente} />}
          {estado.fase === "lista" && (
            <Resultado
              dados={estado.dados}
              fonte={estado.fonte}
              leads={estado.leads}
              meta={estado.meta}
              id={estado.id}
              onEscrever={(lead) => buscarAbordagem(estado.dados, estado.fonte, estado.leads, estado.meta, estado.id, lead)}
              onEscreverLote={(selecionados) => escreverEmLote(estado.dados, selecionados)}
              leadsProntos={new Set(Object.keys(abordagens))}
              carregandoIds={carregandoIds}
              erroLote={erroLote}
              onEnviarCRM={estado.id ? (selecionados) => enviarParaCRM(estado.id!, selecionados) : undefined}
              crmConfigurado={status?.integrations?.["mcp-crm"]}
              enviandoCRMIds={enviandoCRMIds}
              erroCRM={erroCRM}
              avisoCRM={avisoCRM}
              iaLigada={Boolean(status?.ai)}
            />
          )}
          {estado.fase === "carregando-abordagem" && <Loading etapas={etapasAbordagem(estado.lead.nome)} />}
          {estado.fase === "erro-abordagem" && (
            <div>
              <ErrorBox mensagem={estado.mensagem} codigo={estado.codigo} acao={estado.acao} />
              <button type="button" className="btn-ghost mt-3.5" onClick={voltarALista}>Voltar à lista</button>
            </div>
          )}
          {estado.fase === "abordagem" && <AbordagemView lead={estado.lead} abordagem={estado.abordagem} meta={estado.metaAbordagem} onVoltar={voltarALista} />}
        </Stage>
      </main>
      {Dialogo}
    </>
  );
}

/** Erro já traduzido por `lerErro` (mensagem, código e ação), para atravessar um `throw` sem virar texto cru. */
class ErroTratado extends Error {
  codigo?: string;
  acao?: { rotulo: string; url: string };
  constructor(mensagem: string, codigo?: string, acao?: { rotulo: string; url: string }) {
    super(mensagem);
    this.name = "ErroTratado";
    this.codigo = codigo;
    this.acao = acao;
  }
  get mensagem() {
    return this.message;
  }
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

function AbordagemView({ lead, abordagem, meta, onVoltar }: { lead: Lead; abordagem: Abordagem; meta: Meta; onVoltar: () => void }) {
  const email = abordagem.email || { assunto: "", corpo: "" };
  const tamanhoLinkedin = (abordagem.linkedin || "").length;

  return (
    <article className="reveal">
      <ResultHead titulo={`Abordagem para ${lead.nome}`} subtitulo={`${lead.cargo} — ${lead.empresa}`}>
        <button type="button" className="btn-ghost" onClick={onVoltar}>Voltar à lista</button>
      </ResultHead>

      <Origem meta={meta} />

      <p className="summary">{abordagem.gancho}</p>

      <Section titulo="E-mail">
        <Item>
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <strong className="text-sm">{email.assunto}</strong>
            <CopyButton texto={() => `Assunto: ${email.assunto}\n\n${email.corpo}`} rotulo="Copiar" />
          </div>
          <p className="whitespace-pre-wrap text-ink text-sm m-0">{email.corpo}</p>
        </Item>
      </Section>

      <Section titulo="LinkedIn">
        <Item>
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <span className="text-muted text-[12.5px]">{tamanhoLinkedin}/300 caracteres</span>
            <CopyButton texto={() => abordagem.linkedin || ""} rotulo="Copiar" />
          </div>
          <p className="whitespace-pre-wrap text-ink text-sm m-0">{abordagem.linkedin}</p>
        </Item>
      </Section>

      <Section titulo="WhatsApp">
        <Item>
          <div className="flex items-center justify-end gap-3 mb-2.5">
            <CopyButton texto={() => abordagem.whatsapp || ""} rotulo="Copiar" />
          </div>
          <p className="whitespace-pre-wrap text-ink text-sm m-0">{abordagem.whatsapp}</p>
        </Item>
      </Section>

      <Section titulo="Próximo passo">
        <Item><p className="m-0">{abordagem.proximo_passo}</p></Item>
      </Section>

      <SeloIA demo={meta.demo} />
    </article>
  );
}

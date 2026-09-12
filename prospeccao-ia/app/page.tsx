"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CopyButton, DataTable, DemoNotice, Empty, ErrorBox, Field, Item, Loading, Panel, ResultHead, Row, Section, Stage, Topbar, Workspace, useScrollToResult, useStatus } from "@/components/ui";
import type { Abordagem, DadosBusca, Fonte, Lead } from "@/lib/types";

const EXEMPLO: DadosBusca = {
  segmento: "indústria de alimentos",
  cargo: "Diretor de Operações",
  localizacao: "São Paulo, Brasil",
  porte: "51-200",
  proposta:
    "Vendemos um sistema de gestão de manutenção industrial (CMMS) que reduz parada não programada de máquinas. Atendemos indústrias de médio porte que hoje controlam a manutenção em planilha, com implantação em 3 semanas e sem precisar trocar o ERP.",
  quantidade: "15",
};

const VAZIO: DadosBusca = { segmento: "", cargo: "", localizacao: "", porte: "51-200", proposta: "", quantidade: "10" };

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "lista"; dados: DadosBusca; fonte: Fonte; leads: Lead[] }
  | { fase: "carregando-abordagem"; dados: DadosBusca; fonte: Fonte; leads: Lead[]; lead: Lead }
  | { fase: "erro-abordagem"; dados: DadosBusca; fonte: Fonte; leads: Lead[]; mensagem: string }
  | { fase: "abordagem"; dados: DadosBusca; fonte: Fonte; leads: Lead[]; lead: Lead; abordagem: Abordagem; demo: boolean };

function resumoBusca(dados: DadosBusca, total: number) {
  const cidade = String(dados.localizacao || "").split(",")[0].trim();
  return `${total} lead${total === 1 ? "" : "s"} encontrado${total === 1 ? "" : "s"} para ${dados.cargo} em ${dados.segmento}${cidade ? `, ${cidade}` : ""}.`;
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
  const [dados, setDados] = useState<DadosBusca>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const autoAbrirPrimeiro = useRef(false);
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "lista" || estado.fase === "abordagem");

  const set = (campo: keyof DadosBusca) => (e: { target: { value: string } }) => setDados((d) => ({ ...d, [campo]: e.target.value }));

  async function buscarLeads(d: DadosBusca) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao buscar leads.");
      setEstado({ fase: "lista", dados: d, fonte: data.fonte, leads: data.leads });
      if (autoAbrirPrimeiro.current && data.leads?.length) {
        autoAbrirPrimeiro.current = false;
        buscarAbordagem(d, data.fonte, data.leads, data.leads[0]);
      }
    } catch (e) {
      setEstado({ fase: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." });
    }
  }

  async function buscarAbordagem(dadosBusca: DadosBusca, fonte: Fonte, leads: Lead[], lead: Lead) {
    setEstado({ fase: "carregando-abordagem", dados: dadosBusca, fonte, leads, lead });
    try {
      const r = await fetch("/api/abordagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead, proposta: dadosBusca.proposta, segmento: dadosBusca.segmento }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Falha ao gerar a abordagem.");
      setEstado({ fase: "abordagem", dados: dadosBusca, fonte, leads, lead, abordagem: data.abordagem, demo: data.demo });
    } catch (e) {
      setEstado({ fase: "erro-abordagem", dados: dadosBusca, fonte, leads, mensagem: e instanceof Error ? e.message : "Erro inesperado." });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    buscarLeads(dados);
  }

  function preencherExemplo() {
    setDados(EXEMPLO);
    document.getElementById("segmento")?.focus();
  }

  // Atalho para demonstrações: /?exemplo=1 preenche, busca os leads e abre a abordagem do primeiro.
  useEffect(() => {
    if (autoEnviado.current) return;
    if (new URLSearchParams(location.search).get("exemplo") === "1") {
      autoEnviado.current = true;
      autoAbrirPrimeiro.current = true;
      const t = setTimeout(() => { setDados(EXEMPLO); buscarLeads(EXEMPLO); }, 0);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carregando = estado.fase === "carregando";

  function voltarALista() {
    if (estado.fase === "abordagem" || estado.fase === "erro-abordagem" || estado.fase === "carregando-abordagem") {
      setEstado({ fase: "lista", dados: estado.dados, fonte: estado.fonte, leads: estado.leads });
    }
  }

  return (
    <>
      <Topbar marca="P" nome="Prospecção com IA" area="Vendas" status={status} erro={erro} />
      <DemoNotice visivel={Boolean(status && (!status.ai || !status.integrations?.apollo))} resumo="Modo demonstração: os leads exibidos podem ser fictícios." />

      <Workspace>
        <Panel titulo="Sua lista de leads e a primeira abordagem, em minutos." lead="Descreva o cliente ideal. A IA monta a lista de leads e escreve uma abordagem personalizada para cada um.">
          <form onSubmit={onSubmit}>
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
            <Field label="Porte da empresa (funcionários)" htmlFor="porte">
              <select id="porte" className="input" value={dados.porte} onChange={set("porte")}>
                <option value="11-50">11 a 50 funcionários</option>
                <option value="51-200">51 a 200 funcionários</option>
                <option value="201-500">201 a 500 funcionários</option>
                <option value="501-1000">501 a 1.000 funcionários</option>
                <option value="1001-5000">1.001 a 5.000 funcionários</option>
              </select>
            </Field>
            <Field label="O que sua empresa vende e para quem" htmlFor="proposta" hint="Quanto mais concreto, melhor o gancho da abordagem.">
              <textarea
                id="proposta"
                className="input min-h-24 resize-y"
                required
                placeholder="Ex.: vendemos um sistema de gestão de manutenção industrial para indústrias de médio porte, que reduz parada não programada de máquinas..."
                value={dados.proposta}
                onChange={set("proposta")}
              />
            </Field>
            <Field label="Quantidade de leads" htmlFor="quantidade">
              <select id="quantidade" className="input" value={dados.quantidade} onChange={set("quantidade")}>
                <option value="5">5 leads</option>
                <option value="10">10 leads</option>
                <option value="15">15 leads</option>
              </select>
            </Field>
            <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Buscando leads" : "Buscar leads"}</button>
          </form>
          <p className="mt-3.5 text-muted text-[12.5px]">Nada é salvo. A lista e as abordagens existem só nesta tela.</p>
        </Panel>

        <Stage>
          {estado.fase === "vazio" && (
            <Empty glifo="P" titulo="A lista de leads aparece aqui" descricao="Nome, cargo, empresa, porte, cidade e um sinal de prospecção para cada lead, com abordagem pronta em um clique." acao="Preencher com um exemplo" onAcao={preencherExemplo} />
          )}
          {estado.fase === "carregando" && <Loading texto="Buscando leads que combinam com o perfil informado..." />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} />}
          {estado.fase === "lista" && <ListaLeads dados={estado.dados} fonte={estado.fonte} leads={estado.leads} onEscrever={(lead) => buscarAbordagem(estado.dados, estado.fonte, estado.leads, lead)} />}
          {estado.fase === "carregando-abordagem" && <Loading texto={`Escrevendo a abordagem para ${estado.lead.nome}...`} />}
          {estado.fase === "erro-abordagem" && (
            <div>
              <ErrorBox mensagem={estado.mensagem} />
              <button type="button" className="btn-ghost mt-3.5" onClick={voltarALista}>Voltar à lista</button>
            </div>
          )}
          {estado.fase === "abordagem" && <AbordagemView lead={estado.lead} abordagem={estado.abordagem} demo={estado.demo} onVoltar={voltarALista} />}
        </Stage>
      </Workspace>
    </>
  );
}

function ListaLeads({ dados, fonte, leads, onEscrever }: { dados: DadosBusca; fonte: Fonte; leads: Lead[]; onEscrever: (lead: Lead) => void }) {
  return (
    <article className="reveal">
      <ResultHead titulo="Leads encontrados" subtitulo={fonte === "demo" ? "Dados de exemplo" : "Buscado via Apollo.io"}>
        <button type="button" className="btn-ghost" onClick={() => exportarCSV(leads)}>Exportar CSV</button>
      </ResultHead>

      <p className="summary">{resumoBusca(dados, leads.length)}</p>

      <DataTable
        colunas={[
          { chave: "nome", titulo: "Nome", render: (l: Lead) => <strong>{l.nome}</strong> },
          { chave: "cargo", titulo: "Cargo", render: (l: Lead) => l.cargo },
          { chave: "empresa", titulo: "Empresa", render: (l: Lead) => l.empresa },
          { chave: "porte", titulo: "Porte", render: (l: Lead) => l.porte },
          { chave: "cidade", titulo: "Cidade", render: (l: Lead) => l.cidade },
          { chave: "sinal", titulo: "Sinal", render: (l: Lead) => <span className="block max-w-[280px]">{l.sinal}</span> },
          {
            chave: "acao",
            titulo: "",
            render: (l: Lead) => (
              <button type="button" className="btn-ghost !px-3.5 !py-2 !text-[13px] whitespace-nowrap" onClick={() => onEscrever(l)}>
                Escrever abordagem
              </button>
            ),
          },
        ]}
        linhas={leads}
      />
    </article>
  );
}

function AbordagemView({ lead, abordagem, demo, onVoltar }: { lead: Lead; abordagem: Abordagem; demo: boolean; onVoltar: () => void }) {
  const email = abordagem.email || { assunto: "", corpo: "" };
  const tamanhoLinkedin = (abordagem.linkedin || "").length;

  return (
    <article className="reveal">
      <ResultHead titulo={`Abordagem para ${lead.nome}`} subtitulo={`${lead.cargo} — ${lead.empresa}${demo ? " (exemplo em modo demonstração)" : ""}`}>
        <button type="button" className="btn-ghost" onClick={onVoltar}>Voltar à lista</button>
      </ResultHead>

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
    </article>
  );
}

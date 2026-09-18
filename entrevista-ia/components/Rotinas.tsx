"use client";
// Cartão adicional do /setup: agenda o app para gerar e entregar um resultado sozinho, em um horário
// fixo, sem que ninguém precise abrir a tela (lib/rotinas.ts). Lista as rotinas, permite criar,
// executar agora, pausar e apagar, e mostra o código de acesso do gatilho externo.
import { useEffect, useState, type FormEvent } from "react";
import { data } from "@/lib/formato";
import { CopyButton, DataTable } from "./ui";
import type { Coluna } from "./ui";

type Frequencia = "diaria" | "semanal" | "mensal" | "unica";
type Canal = "email" | "slack";

type Rotina = {
  id: string;
  tipo: string;
  frequencia: Frequencia;
  hora: string;
  diaSemana: number | null;
  diaMes: number | null;
  dataUnica: string | null;
  canal: Canal;
  destino: string | null;
  ativa: boolean;
  ultimaExecucao: string | null;
  criadoEm: string;
};

type TipoRotina = { tipo: string; rotulo: string };
type StatusCodigo = { ativo: boolean; mascarado: string | null };

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function descreverAgenda(r: Rotina): string {
  if (r.frequencia === "diaria") return `Todos os dias às ${r.hora}`;
  if (r.frequencia === "semanal") return `Toda ${DIAS_SEMANA[r.diaSemana ?? 0]} às ${r.hora}`;
  if (r.frequencia === "mensal") return `Dia ${r.diaMes ?? 1} de cada mês às ${r.hora}`;
  return r.dataUnica ? `Em ${data(r.dataUnica, { comAno: true })} às ${r.hora}` : `Uma vez às ${r.hora}`;
}

export function Rotinas() {
  const [itens, setItens] = useState<Rotina[] | null>(null);
  const [tipos, setTipos] = useState<TipoRotina[]>([]);
  const [destinoPadrao, setDestinoPadrao] = useState("");
  const [executando, setExecutando] = useState<string | null>(null);

  const [status, setStatus] = useState<StatusCodigo | null>(null);
  const [codigoNovo, setCodigoNovo] = useState<string | null>(null);
  const [endereco, setEndereco] = useState("/api/rotinas/executar");
  const [gerando, setGerando] = useState(false);

  const [tipo, setTipo] = useState("");
  const [frequencia, setFrequencia] = useState<Frequencia>("diaria");
  const [hora, setHora] = useState("09:00");
  const [diaSemana, setDiaSemana] = useState(1);
  const [diaMes, setDiaMes] = useState(1);
  const [dataUnica, setDataUnica] = useState("");
  const [canal, setCanal] = useState<Canal>("email");
  const [destino, setDestino] = useState("");
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState("");

  function carregar() {
    fetch("/api/rotinas")
      .then((r) => r.json())
      .then((d) => {
        setItens(d.itens);
        setTipos(d.tipos);
        setDestinoPadrao(d.destinoPadrao || "");
        setTipo((t) => t || d.tipos[0]?.tipo || "");
      })
      .catch(() => setItens([]));
  }

  useEffect(() => {
    carregar();
    fetch("/api/rotinas/token")
      .then((r) => r.json())
      .then((d) => {
        setStatus(d);
        setEndereco(`${window.location.origin}/api/rotinas/executar`);
      })
      .catch(() => {});
  }, []);

  async function gerarCodigo() {
    setGerando(true);
    try {
      const r = await fetch("/api/rotinas/token", { method: "POST" });
      const d = await r.json();
      setCodigoNovo(d.codigo);
      setStatus({ ativo: true, mascarado: null });
    } finally {
      setGerando(false);
    }
  }

  async function criar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setCriando(true);
    try {
      const r = await fetch("/api/rotinas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          frequencia,
          hora,
          diaSemana: frequencia === "semanal" ? diaSemana : undefined,
          diaMes: frequencia === "mensal" ? diaMes : undefined,
          dataUnica: frequencia === "unica" ? dataUnica : undefined,
          canal,
          destino: destino || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível criar a rotina.");
      setDestino("");
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setCriando(false);
    }
  }

  async function pausar(id: string, ativa: boolean) {
    await fetch(`/api/rotinas/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativa }) });
    carregar();
  }

  async function apagar(id: string) {
    if (!window.confirm("Apagar esta rotina?")) return;
    await fetch(`/api/rotinas/${id}`, { method: "DELETE" });
    carregar();
  }

  async function executarAgora(id: string) {
    setExecutando(id);
    try {
      await fetch(`/api/rotinas/${id}/executar-agora`, { method: "POST" });
      carregar();
    } finally {
      setExecutando(null);
    }
  }

  const colunas: Coluna<Rotina>[] = [
    { chave: "tipo", titulo: "Rotina", papel: "titulo", render: (r) => tipos.find((t) => t.tipo === r.tipo)?.rotulo || r.tipo },
    { chave: "agenda", titulo: "Quando", papel: "resumo", render: (r) => `${descreverAgenda(r)}${r.ativa ? "" : " · Pausada"}` },
    { chave: "canal", titulo: "Canal", papel: "chip", render: (r) => <span className="chip-neutral">{r.canal === "email" ? "E-mail" : "Slack"}</span> },
    { chave: "ultima", titulo: "Última execução", render: (r) => (r.ultimaExecucao ? data(r.ultimaExecucao, { comHora: true }) : "Nunca rodou") },
    {
      chave: "acoes",
      titulo: "Ações",
      render: (r) => (
        <div className="flex gap-3 flex-wrap">
          <button type="button" className="btn-link text-[12.5px]" onClick={() => executarAgora(r.id)} disabled={executando === r.id}>
            {executando === r.id ? "Executando" : "Executar agora"}
          </button>
          <button type="button" className="btn-link text-[12.5px]" onClick={() => pausar(r.id, !r.ativa)}>
            {r.ativa ? "Pausar" : "Retomar"}
          </button>
          <button type="button" className="btn-link text-[12.5px] text-danger" onClick={() => apagar(r.id)}>
            Apagar
          </button>
        </div>
      ),
    },
  ];

  return (
    // `id` próprio para `/setup#rotinas` (lib/acoes.ts) rolar até aqui, como nos outros cartões
    // deste app — o `id={i.id}` dos cartões de integração de components/setup.tsx não alcança os
    // cartões que vêm depois do <SetupPage />.
    <section id="rotinas" className="card p-6 max-md:p-5">
      <h2 className="text-lg font-bold mb-1">Rotinas</h2>
      <p className="text-muted text-sm mb-4 max-w-[640px]">Agende o app para gerar e entregar um resultado sozinho, em um horário fixo, sem que ninguém precise abrir a tela.</p>

      {itens === null ? (
        <p className="text-muted text-sm">Carregando...</p>
      ) : itens.length === 0 ? (
        <p className="text-muted text-sm">Nenhuma rotina criada ainda.</p>
      ) : (
        <DataTable colunas={colunas} linhas={itens} />
      )}

      <div className="mt-6 pt-5 border-t border-line">
        <h3 className="text-sm font-semibold mb-3">Nova rotina</h3>
        {tipos.length === 0 ? (
          <p className="text-muted text-sm">Nenhum tipo de rotina disponível neste app ainda.</p>
        ) : (
          <form onSubmit={criar} className="flex flex-col gap-3">
            <div className="flex gap-3 flex-wrap">
              <label className="flex flex-col gap-1 text-[13px] font-semibold flex-1 min-w-[200px]">
                O que fazer
                <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  {tipos.map((t) => (
                    <option key={t.tipo} value={t.tipo}>{t.rotulo}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[13px] font-semibold flex-1 min-w-[160px]">
                Frequência
                <select className="input" value={frequencia} onChange={(e) => setFrequencia(e.target.value as Frequencia)}>
                  <option value="diaria">Diária</option>
                  <option value="semanal">Semanal</option>
                  <option value="mensal">Mensal</option>
                  <option value="unica">Uma vez</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[13px] font-semibold w-28">
                Horário
                <input type="time" className="input" value={hora} onChange={(e) => setHora(e.target.value)} required />
              </label>
            </div>
            <div className="flex gap-3 flex-wrap">
              {frequencia === "semanal" && (
                <label className="flex flex-col gap-1 text-[13px] font-semibold flex-1 min-w-[160px]">
                  Dia da semana
                  <select className="input" value={diaSemana} onChange={(e) => setDiaSemana(Number(e.target.value))}>
                    {DIAS_SEMANA.map((d, i) => (
                      <option key={d} value={i}>{d}</option>
                    ))}
                  </select>
                </label>
              )}
              {frequencia === "mensal" && (
                <label className="flex flex-col gap-1 text-[13px] font-semibold w-32">
                  Dia do mês
                  <input type="number" min={1} max={31} className="input" value={diaMes} onChange={(e) => setDiaMes(Number(e.target.value))} required />
                </label>
              )}
              {frequencia === "unica" && (
                <label className="flex flex-col gap-1 text-[13px] font-semibold flex-1 min-w-[160px]">
                  Data
                  <input type="date" className="input" value={dataUnica} onChange={(e) => setDataUnica(e.target.value)} required />
                </label>
              )}
              <label className="flex flex-col gap-1 text-[13px] font-semibold flex-1 min-w-[140px]">
                Canal
                <select className="input" value={canal} onChange={(e) => setCanal(e.target.value as Canal)}>
                  <option value="email">E-mail</option>
                  <option value="slack">Slack</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[13px] font-semibold flex-1 min-w-[200px]">
                {canal === "email" ? "E-mail de destino" : "Canal do Slack (opcional)"}
                <input
                  className="input"
                  placeholder={canal === "email" ? destinoPadrao || "voce@empresa.com" : "#geral"}
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                />
              </label>
            </div>
            {erro && <p className="text-danger text-sm">{erro}</p>}
            <button type="submit" className="btn-primary !w-auto self-start" disabled={criando}>{criando ? "Criando" : "Criar rotina"}</button>
          </form>
        )}
      </div>

      <div className="mt-6 pt-5 border-t border-line">
        <h3 className="text-sm font-semibold mb-2">Rodar sozinho, sem abrir o app</h3>
        <div className="mb-4 px-4 py-3 rounded-[10px] text-sm border bg-[#fff4e0] border-[#f0d999] text-warn">
          No plano gratuito o app hiberna e a rotina só roda quando alguém acessa. Para rodar sozinho, use um plano pago ou chame esta URL de um agendador externo.
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[13px] font-semibold w-[130px] shrink-0">Endereço</span>
            <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[220px]">{endereco}</code>
            <CopyButton texto={() => endereco} rotulo="Copiar" />
          </div>
          {codigoNovo ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[13px] font-semibold w-[130px] shrink-0">Código (só agora)</span>
              <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[220px]">{codigoNovo}</code>
              <CopyButton texto={() => codigoNovo} rotulo="Copiar" />
            </div>
          ) : status?.ativo && status.mascarado ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[13px] font-semibold w-[130px] shrink-0">Código</span>
              <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px]">{status.mascarado}</code>
            </div>
          ) : null}
          <div className="flex items-center gap-3 flex-wrap mt-1">
            <button type="button" className="btn-primary !w-auto" onClick={gerarCodigo} disabled={gerando}>
              {gerando ? "Gerando" : status?.ativo ? "Gerar novo código" : "Gerar código"}
            </button>
          </div>
          {codigoNovo && <p className="text-[12.5px] text-muted">Guarde este código agora: por segurança, ele não aparece de novo depois desta tela.</p>}
        </div>
      </div>
    </section>
  );
}

"use client";
// A aba Equipe do painel de um treino (US-023).
//
// Ela responde uma pergunta prática: "com quem eu converso esta semana?". Por isso a tabela mostra
// pouca coisa — quem é, como está, para onde está indo, quanto treinou e quando foi a última vez — e
// o resto (com que tipo de cliente a pessoa vai bem, com qual ela trava, o link da última conversa)
// fica atrás de "Ver detalhes", aberto uma linha por vez.
//
// Nenhum número é calculado aqui: tudo vem pronto de `montarPainelSimulacao`. Ordenar, buscar e
// exportar são operações sobre a lista que já está na tela — são trinta pessoas, e voltar ao servidor
// a cada tecla seria mais lento e mais frágil.
import { useState } from "react";
import Link from "next/link";
import { Chip, DataTable, data } from "@/components/ui";
import type { PainelSimulacao, Tendencia, VendedorNaSimulacao } from "@/lib/painel-simulacao";
import type { ModoSessao, StatusSessao } from "@/lib/sessoes";
import { contagem, nota, normalizar, tomDaNota } from "./apresentacao";

const TENDENCIAS: Record<Tendencia, { rotulo: string; nivel: string }> = {
  subindo: { rotulo: "↑ Subindo", nivel: "positivo" },
  estavel: { rotulo: "→ Estável", nivel: "cinza" },
  caindo: { rotulo: "↓ Caindo", nivel: "negativo" },
};

/** Quem está caindo vem primeiro: a lista existe para dizer com quem falar, e é com essa pessoa. */
const PESO_TENDENCIA: Record<Tendencia, number> = { caindo: 0, estavel: 1, subindo: 2 };

const ORDENS: { id: "nota" | "tendencia"; rotulo: string }[] = [
  { id: "nota", rotulo: "Maior nota" },
  { id: "tendencia", rotulo: "Quem está caindo" },
];

const COMO_CONVERSOU: Record<ModoSessao, string> = {
  "voz-agente": "Por voz",
  "voz-navegador": "Por voz",
  texto: "Por escrito",
};

const SITUACAO: Record<StatusSessao, string> = {
  preparando: "Não começou",
  em_andamento: "Em andamento",
  encerrada: "Aguardando avaliação",
  avaliada: "Avaliada",
  abandonada: "Abandonada",
};

/** A cor da nota na tabela: a mesma régua das barras da visão geral. */
const TOM_DO_CHIP: Record<string, string> = { ok: "positivo", warn: "neutro", danger: "negativo", neutro: "cinza" };

/**
 * O detalhe de uma pessoa, aberto dentro da própria linha.
 *
 * Fica inteiro no `render` da coluna, com o próprio estado — mesmo molde de
 * `components/VendedoresPainel.tsx`: é dado que já veio na linha, nenhuma chamada nova.
 */
function Detalhe({ vendedor }: { vendedor: VendedorNaSimulacao }) {
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <button type="button" className="btn-link text-[13px]" onClick={() => setAberto(true)}>
        Ver detalhes
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-[13px] min-w-[230px]">
      <div>
        <span className="text-muted">Nota: </span>
        <strong>{nota(vendedor.nota)}</strong>
        {vendedor.avaliadas > 0 && <span className="text-muted">{` em ${contagem(vendedor.avaliadas, "conversa avaliada", "conversas avaliadas")}`}</span>}
      </div>
      <div>
        <span className="text-muted">Treinou aqui: </span>
        <strong>{contagem(vendedor.sessoes, "vez", "vezes")}</strong>
      </div>
      <div>
        <span className="text-muted">Já participou de: </span>
        <strong>{contagem(vendedor.treinos, "treino", "treinos")}</strong>
      </div>
      {vendedor.melhor && (
        <div>
          <span className="text-muted">Vai melhor com: </span>
          <strong>{vendedor.melhor.persona}</strong>
          <span className="text-muted">{` · nota ${nota(vendedor.melhor.nota)}`}</span>
        </div>
      )}
      {vendedor.desafio && (
        <div>
          <span className="text-muted">Maior desafio: </span>
          <strong>{vendedor.desafio.persona}</strong>
          <span className="text-muted">{` · nota ${nota(vendedor.desafio.nota)}`}</span>
        </div>
      )}
      {!vendedor.melhor && <p className="text-muted">Nenhuma conversa desta pessoa foi avaliada ainda.</p>}
      {vendedor.ultimoResultadoId && (
        <Link href={`/r/${vendedor.ultimoResultadoId}`} className="text-accent-ink font-semibold hover:underline self-start">
          Abrir a última conversa
        </Link>
      )}
      <button type="button" className="btn-link self-start" onClick={() => setAberto(false)}>
        Fechar
      </button>
    </div>
  );
}

/**
 * Uma linha por **sessão**, não por pessoa: é a planilha que o gestor leva para a reunião de equipe,
 * e lá ele quer olhar conversa a conversa. Separador ";" e BOM para abrir direto no Excel em
 * português, mesmo padrão de exportação que o resto da suíte já usa.
 */
function exportarSessoesCSV(painel: PainelSimulacao) {
  const cabecalho = ["Vendedor", "E-mail", "Treino", "Cliente", "Como conversou", "Situação", "Data", "Duração (min)", "Nota", "Link do resultado"];
  const linhas = [cabecalho.join(";")];
  for (const v of painel.equipe) {
    for (const c of v.conversas) {
      const campos = [
        v.nome,
        v.email,
        painel.nome,
        c.persona,
        COMO_CONVERSOU[c.modo],
        SITUACAO[c.status],
        data(c.quando, { comHora: true, comAno: true }),
        // Minutos com uma casa: arredondar para inteiro escreveria "0" numa conversa de quarenta
        // segundos, e conversa curta demais é justamente o que o gestor quer enxergar na planilha.
        c.duracaoSeg === null ? "" : (c.duracaoSeg / 60).toFixed(1).replace(".", ","),
        c.nota === null ? "" : nota(c.nota),
        c.resultadoId ? `${window.location.origin}/r/${c.resultadoId}` : "",
      ];
      linhas.push(campos.map((campo) => `"${String(campo ?? "").replace(/"/g, '""')}"`).join(";"));
    }
  }

  const csv = "﻿" + linhas.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `equipe-${painel.codigo}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Equipe({ painel }: { painel: PainelSimulacao }) {
  const [ordem, setOrdem] = useState<"nota" | "tendencia">("nota");
  const [busca, setBusca] = useState("");

  if (painel.equipe.length === 0) {
    return (
      <div className="card px-6 py-7">
        <h2 className="font-bold text-[17px] mb-1.5">Ninguém treinou ainda</h2>
        <p className="apoio">Assim que a primeira pessoa abrir o link e conversar, ela aparece aqui com a nota, a tendência e o cliente que mais a desafia.</p>
      </div>
    );
  }

  const alvo = normalizar(busca.trim());
  const visiveis = [...painel.equipe]
    .filter((v) => !alvo || normalizar(v.nome).includes(alvo))
    .sort((a, b) =>
      ordem === "nota"
        ? (b.nota ?? -1) - (a.nota ?? -1) || a.nome.localeCompare(b.nome, "pt-BR")
        : PESO_TENDENCIA[a.tendencia] - PESO_TENDENCIA[b.tendencia] || (a.variacao ?? 0) - (b.variacao ?? 0) || a.nome.localeCompare(b.nome, "pt-BR"),
    );

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-4 max-md:flex-col max-md:items-stretch">
        <div className="flex gap-1.5" role="group" aria-label="Ordenar a lista">
          {ORDENS.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={ordem === o.id}
              className={`text-[13px] font-semibold px-3 py-1.5 rounded-chip border ${ordem === o.id ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-muted hover:bg-bg"}`}
              onClick={() => setOrdem(o.id)}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2.5 max-md:flex-col max-md:items-stretch">
          <input
            type="search"
            className="input !w-[220px] max-md:!w-full"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome"
            aria-label="Buscar vendedor"
          />
          <button type="button" className="btn-ghost shrink-0" onClick={() => exportarSessoesCSV(painel)}>
            Baixar planilha
          </button>
        </div>
      </div>

      {visiveis.length === 0 ? (
        <p className="text-muted text-sm">Ninguém com esse nome treinou neste link. Limpe a busca para ver o time inteiro.</p>
      ) : (
        <DataTable
          colunas={[
            { chave: "nome", titulo: "Vendedor", papel: "titulo", render: (v: VendedorNaSimulacao) => <strong>{v.nome}</strong> },
            {
              chave: "nota",
              titulo: "Nota",
              render: (v: VendedorNaSimulacao) =>
                v.nota === null ? <span className="text-muted">Sem nota ainda</span> : <Chip nivel={TOM_DO_CHIP[tomDaNota(v.nota)]}>{nota(v.nota)}</Chip>,
            },
            {
              chave: "tendencia",
              titulo: "Tendência",
              papel: "chip",
              render: (v: VendedorNaSimulacao) => <Chip nivel={TENDENCIAS[v.tendencia].nivel}>{TENDENCIAS[v.tendencia].rotulo}</Chip>,
            },
            { chave: "sessoes", titulo: "Sessões", render: (v: VendedorNaSimulacao) => v.sessoes },
            { chave: "ultima", titulo: "Última", render: (v: VendedorNaSimulacao) => (v.ultima ? data(v.ultima) : "—") },
            { chave: "detalhe", titulo: "Detalhes", render: (v: VendedorNaSimulacao) => <Detalhe vendedor={v} /> },
          ]}
          linhas={visiveis}
        />
      )}

      <p className="text-muted text-[13px] mt-3">
        A tendência compara os últimos {painel.dias} dias com os {painel.dias} anteriores: a seta só aparece a partir de 0,3 de diferença na nota.
      </p>
    </section>
  );
}

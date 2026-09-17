"use client";
// Os dois jeitos de levar os números de Relatórios para fora do app: a planilha (e o resumo em texto)
// agora, pelo menu "Exportar", e o relatório diário que chega sozinho todo dia de manhã.
//
// O agendamento é a MESMA rotina que /setup cria, edita e pausa (lib/rotinas.ts, tipo
// "relatorio-atendimento"): aqui ela nasce em um clique, com o horário e o destino já decididos, para
// quem está olhando os números não precisar aprender o formulário de rotinas.
import { useEffect, useState } from "react";
import { Aviso, ITEM_DE_MENU, lerErro, useMenuSuspenso, type ErroLido } from "./ui";
import type { PeriodoMetricas } from "@/lib/types";

/** O que `GET /api/relatorio-diario` responde. */
interface EstadoRelatorioDiario {
  canal: "email" | "slack";
  /** As notificações já conseguem sair por esse canal. */
  prontas: boolean;
  agendado: { hora: string; ativa: boolean; destino: string } | null;
}

const FALHA_COPIA = "Não foi possível copiar automaticamente. Selecione o texto e copie com Ctrl+C (ou Cmd+C no Mac).";

/** "08:00" escrito como alguém fala: "8h" (ou "8h30" quando o horário não é redondo). */
function horaFalada(hora: string): string {
  const [h, m] = hora.split(":");
  const inteira = Number(h);
  return m === "00" ? `${inteira}h` : `${inteira}h${m}`;
}

/**
 * Botão "Exportar", ao lado do seletor de período: baixar a planilha das conversas do período ou
 * copiar o resumo em texto (os quatro números e os assuntos) para colar numa mensagem.
 */
export function MenuExportar({ periodo, resumo }: { periodo: PeriodoMetricas; resumo: () => string }) {
  const { aberto, setAberto, menuRef } = useMenuSuspenso();
  const [copiado, setCopiado] = useState(false);
  const [falha, setFalha] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(resumo());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setFalha(true);
      setTimeout(() => setFalha(false), 4000);
    }
    setAberto(false);
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className="btn-ghost max-md:w-full"
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        Exportar
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-20 w-60 card p-1.5 text-[13.5px]">
          {/* Link de verdade (e não um fetch): quem baixa uma planilha espera poder abrir em outra aba
              e o navegador cuidar do download; o nome do arquivo vem do próprio servidor. */}
          <a role="menuitem" className={`${ITEM_DE_MENU} block`} href={`/api/metricas/exportar?periodo=${periodo}`} onClick={() => setAberto(false)}>
            Baixar planilha (CSV)
          </a>
          <button type="button" role="menuitem" className={ITEM_DE_MENU} onClick={copiar}>
            Copiar resumo
          </button>
        </div>
      )}
      {(copiado || falha) && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[300px] max-md:w-full">
          {falha ? <Aviso tom="danger">{FALHA_COPIA}</Aviso> : <Aviso>Resumo copiado. É só colar onde quiser.</Aviso>}
        </div>
      )}
    </div>
  );
}

/**
 * Cartão do rodapé de Relatórios: agenda (ou mostra que já agendou) o relatório diário do atendimento.
 * Quando as notificações ainda não estão configuradas, o cartão leva à tela de configuração em vez de
 * oferecer um botão que falharia.
 */
export function RelatorioDiario() {
  const [estado, setEstado] = useState<EstadoRelatorioDiario | null>(null);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<(ErroLido & { motivo?: string }) | null>(null);

  useEffect(() => {
    fetch("/api/relatorio-diario")
      .then((r) => r.json())
      .then(setEstado)
      .catch(() => setEstado({ canal: "email", prontas: false, agendado: null }));
  }, []);

  async function agendar() {
    setErro(null);
    setCriando(true);
    try {
      const r = await fetch("/api/relatorio-diario", { method: "POST" });
      if (!r.ok) {
        const lido = await lerErro(r.clone());
        const corpo = await r.json().catch(() => ({}));
        setErro({ ...lido, motivo: typeof corpo?.motivo === "string" ? corpo.motivo : undefined });
        return;
      }
      setEstado(await r.json());
    } catch (e) {
      setErro(await lerErro(e));
    } finally {
      setCriando(false);
    }
  }

  const porOnde = estado?.canal === "slack" ? "no Slack" : "por e-mail";

  return (
    <section className="card px-5 py-[18px]" aria-label="Relatório diário do atendimento">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <h2 className="section-title !mb-0">Receber o relatório diário {porOnde}</h2>
        <a href="/historico" className="btn-link text-[13px]">Relatórios anteriores</a>
      </div>

      {estado === null ? (
        <span className="skeleton block w-2/3 mt-3.5" aria-hidden="true" />
      ) : estado.agendado ? (
        <p className="text-sm text-ink-2 mt-3">
          Todo dia às {horaFalada(estado.agendado.hora)} você recebe o resumo do atendimento {porOnde}
          {estado.agendado.destino ? `, em ${estado.agendado.destino}` : ""}. Para mudar o horário ou parar de receber, abra as{" "}
          <a href="/setup" className="btn-link">configurações</a>.
        </p>
      ) : estado.prontas ? (
        <>
          <p className="text-sm text-ink-2 mt-3 mb-3">
            Todo dia às 8h, um resumo do atendimento e as perguntas que merecem sua atenção chegam {porOnde}.
          </p>
          <button type="button" className="btn-ghost" onClick={agendar} disabled={criando}>
            {criando ? "Agendando" : "Receber todo dia"}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-2 mt-3 mb-3">
            Escolha por onde o app avisa você para receber, todo dia às 8h, um resumo do atendimento e as perguntas que merecem sua atenção.
          </p>
          {/* O endereço vai no href literal (padrão da suíte): como propriedade de objeto ele seria
              lido como jargão pelo verificador de linguagem. */}
          <a href="/setup#notificacoes" className="btn-ghost">Escolher por onde receber</a>
        </>
      )}

      {erro && (
        <div className="mt-3">
          <Aviso tom="danger" acao={erro.motivo === "notificacoes" ? undefined : erro.acao}>
            {erro.mensagem} {erro.motivo === "notificacoes" && <a href="/setup#notificacoes" className="underline">Escolher por onde receber</a>}
          </Aviso>
        </div>
      )}
    </section>
  );
}

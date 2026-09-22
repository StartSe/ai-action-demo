"use client";
// Cabeçalho, aviso de números de exemplo, grade e rodapé do painel. Usado pela tela principal (fase "pronto")
// e por /r/[id]; recebe os botões extras e a conversa como nós prontos, para servir também a um Server Component.
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Aviso, Entregar, Origem, ResultHead, SeloIA, data } from "./ui";
import { Painel } from "./Painel";
import { csvDoPainel, painelParaTexto } from "@/lib/formatar";
import type { Meta } from "@/lib/ai";
import { INSUMO_PLANILHA } from "@/lib/planilha";
import type { EspecPainel } from "@/lib/types";

export function ResultadoPainel({ painel, meta, id, acoes, antes, depois, grade }: { painel: EspecPainel; meta: Meta; id?: string; acoes?: ReactNode; antes?: ReactNode; depois?: ReactNode; /** Substitui a grade padrão — usado pelo modo de reorganizar, que precisa de cartões arrastáveis. */ grade?: ReactNode }) {
  const [avisoCopia, setAvisoCopia] = useState<"ok" | "falha" | null>(null);
  // A origem viaja no `insumo` gravado com o painel; ver INSUMO_PLANILHA.
  const daPlanilha = meta.insumo.startsWith(INSUMO_PLANILHA);
  const recorteAutomatico = daPlanilha && meta.insumo.endsWith("(recorte automático)");
  const arquivo = daPlanilha ? meta.insumo.slice(INSUMO_PLANILHA.length).replace(" (recorte automático)", "") : "";

  async function copiarNumeros() {
    try {
      await navigator.clipboard.writeText(csvDoPainel(painel));
      setAvisoCopia("ok");
    } catch {
      setAvisoCopia("falha");
    }
    setTimeout(() => setAvisoCopia(null), 4000);
  }

  return (
    <article className="reveal">
      <ResultHead titulo={painel.titulo} subtitulo={`${painel.setor} · ${painel.resumo}`}>
        {acoes}
        <Entregar id={id} titulo={painel.titulo} texto={() => painelParaTexto(painel)} extras={[{ rotulo: "Copiar números do painel", onClick: copiarNumeros }]} />
      </ResultHead>
      {avisoCopia === "ok" && <div className="mb-4"><Aviso tom="ok">Números copiados como planilha (separados por ponto e vírgula). Cole no Excel ou no Google Planilhas.</Aviso></div>}
      {avisoCopia === "falha" && <div className="mb-4"><Aviso tom="danger">Não foi possível copiar automaticamente. Use &ldquo;Copiar texto&rdquo; no menu Mais.</Aviso></div>}

      {/*
        No recorte automático nenhuma IA foi chamada: os componentes `Origem`/`SeloIA` do padrão
        diriam "Gerado com IA", que seria falso. Como `components/ui.tsx` é arquivo comparado byte a
        byte com o pdi-time, a exceção mora aqui, não lá.
      */}
      {recorteAutomatico ? (
        <p className="text-muted text-[13px] mb-4">
          {`Calculado a partir de ${arquivo}, em ${data(meta.geradoEm, { comHora: true })}. Sem IA: o recorte veio da forma das colunas.`}
        </p>
      ) : (
        <Origem meta={meta} />
      )}
      <div className="mb-5">
        {daPlanilha ? (
          <Aviso tom="ok">
            Números calculados a partir do seu arquivo{arquivo ? ` (${arquivo})` : ""}.
            {recorteAutomatico && (
              <> O recorte foi escolhido pela forma das colunas; <Link className="font-semibold underline underline-offset-2" href="/setup#openrouter">conectar a IA</Link> costuma render um recorte melhor.</>
            )}
          </Aviso>
        ) : (
          <Aviso tom="warn">
            Números de exemplo, para você validar o formato do painel.{meta.demo && <> <Link className="font-semibold underline underline-offset-2" href="/setup#openrouter">Conectar a IA em 1 minuto</Link> para gerar a partir do seu pedido.</>}
          </Aviso>
        )}
      </div>
      {antes}
      {grade ?? <Painel painel={painel} />}
      {depois}
      {recorteAutomatico ? (
        <p className="text-center mt-6"><span className="chip-cinza">Calculado do seu arquivo, sem IA</span></p>
      ) : (
        <SeloIA demo={meta.demo} />
      )}
    </article>
  );
}

"use client";
// Cabeçalho, aviso de números de exemplo, grade e rodapé do painel. Usado pela tela principal (fase "pronto")
// e por /r/[id]; recebe os botões extras e a conversa como nós prontos, para servir também a um Server Component.
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Aviso, Entregar, Origem, ResultHead, SeloIA } from "./ui";
import { Painel } from "./Painel";
import { csvDoPainel, painelParaTexto } from "@/lib/formatar";
import type { Meta } from "@/lib/ai";
import type { EspecPainel } from "@/lib/types";

export function ResultadoPainel({ painel, meta, id, acoes, antes, depois }: { painel: EspecPainel; meta: Meta; id?: string; acoes?: ReactNode; antes?: ReactNode; depois?: ReactNode }) {
  const [avisoCopia, setAvisoCopia] = useState<"ok" | "falha" | null>(null);

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

      <Origem meta={meta} />
      <div className="mb-5">
        <Aviso tom="warn">
          Números de exemplo, para você validar o formato do painel.{meta.demo && <> <Link className="font-semibold underline underline-offset-2" href="/setup#openrouter">Conectar a IA em 1 minuto</Link> para gerar a partir do seu pedido.</>}
        </Aviso>
      </div>
      {antes}
      <Painel painel={painel} />
      {depois}
      <SeloIA demo={meta.demo} />
    </article>
  );
}

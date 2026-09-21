"use client";
// Resultado completo de uma página (cabeçalho, proveniência, prévia e editor de versões). Veio de app/page.tsx
// quando a tela inicial virou "Meus sites" (US-002): continua sendo o que /r/[id] mostra para uma página salva.
import { useState } from "react";
import { Aviso, Origem, ResultHead, useStatus } from "./ui";
import { ACAO_CONECTAR_IA, ACAO_CONECTAR_OPENROUTER } from "@/lib/acoes";
import { EditorPagina } from "./EditorPagina";
import { EntregarPagina } from "./EntregarPagina";
import { PreviaPagina } from "./PreviaPagina";
import type { Meta } from "@/lib/ai";
import type { Pagina } from "@/lib/types";

export function rotuloFormato(html: string): string {
  return /cdn\.tailwindcss\.com/.test(html) ? "HTML com Tailwind" : "HTML com CSS";
}

export function Resultado({ pagina: inicial, meta: metaInicial, id, referencia }: { pagina: Pagina; meta: Meta; id: string; referencia?: string }) {
  // A página muda a cada edição/volta de versão sem sair da tela; a proveniência exibida passa a ser a da última mudança.
  const [pagina, setPagina] = useState<Pagina>(inicial);
  const [meta, setMeta] = useState<Meta>(metaInicial);
  const { status } = useStatus();
  // `vision` é um campo extra do /api/status deste app (a Status compartilhada não o declara).
  const semVisao = Boolean(status?.ai) && !(status as { vision?: boolean } | null)?.vision;
  const atual = pagina.versoes[pagina.versoes.length - 1];
  const modeloGratuito = !meta.demo && meta.model.endsWith(":free");
  return (
    <article className="reveal" data-id={id} data-versao={atual.n}>
      {/* Subtítulo sem o nome da marca: ele já está no título da página gerada, logo acima. */}
      <ResultHead titulo={pagina.titulo} subtitulo={`Versão ${atual.n} · ${rotuloFormato(atual.html)}`}>
        <EntregarPagina id={id} titulo={pagina.titulo} html={atual.html} versao={atual.n} />
      </ResultHead>
      {/* A faixa logo abaixo é que explica o que aconteceu e o que fazer; aqui fica só a proveniência. */}
      <Origem meta={meta} demoTexto="Exemplo ilustrativo, sem usar inteligência artificial." />

      {meta.demo && (
        <div className="mb-4">
          {semVisao ? (
            <Aviso acao={ACAO_CONECTAR_OPENROUTER}>
              A sua captura não foi lida: o ChatGPT cuida dos textos e das edições, mas a leitura da imagem passa pelo OpenRouter. Conecte também o OpenRouter para clonar por captura.
            </Aviso>
          ) : (
            <Aviso>
              Esta é uma página de exemplo fixa: a sua captura não foi lida.{" "}
              <a className="btn-link text-[13px]" href={ACAO_CONECTAR_IA.url}>Conecte a inteligência artificial para gerar a sua versão</a>
            </Aviso>
          )}
        </div>
      )}
      {modeloGratuito && (
        <div className="mb-4">
          <Aviso>
            Gerado com o modelo gratuito.{" "}
            <a className="btn-link text-[13px]" href="/setup#qualidade-da-pagina">Para páginas mais fiéis, troque o modelo que lê a captura</a>
          </Aviso>
        </div>
      )}

      <PreviaPagina key={atual.n} html={atual.html} titulo={pagina.titulo} referencia={referencia} />
      <EditorPagina pagina={pagina} demo={meta.demo} onAtualizada={(nova, novaMeta) => { setPagina(nova); if (novaMeta) setMeta(novaMeta); }} />
    </article>
  );
}

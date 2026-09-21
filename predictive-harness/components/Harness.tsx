"use client";
import type { Mensagem, RegistroDecisao } from "@/lib/types";
import { fmtMs, fmtPct, fmtUsd } from "./ui";
const ESTACOES: { id: RegistroDecisao["estacao"]; nome: string }[] = [
  { id: "triagem", nome: "1 · Triagem (Jev)" },
  { id: "roteamento", nome: "2 · Roteamento (código)" },
  { id: "verificacao", nome: "3 · Verificação (Jev)" },
  { id: "sugestoes", nome: "4 · Próximas perguntas (Jev)" },
  { id: "classificacao", nome: "Classificação das colunas (Jev)" },
];
export function Harness({ mensagem }: { mensagem: Mensagem | null }) {
  if (!mensagem?.decisoes?.length)
    return (
      <div className="harness-vazio">
        <p>Aqui aparece por que o sistema fez o que fez em cada resposta. O modelo de linguagem pensa e escreve; o Jev decide rápido nas estações:</p>
        <ol>
          <li><b>Triagem</b>: intenção, se dá para responder com estas colunas, se precisa de cálculo ou de contexto externo, ambiguidade, complexidade e dado pessoal.</li>
          <li><b>Roteamento</b>: o código escolhe o caminho e o modelo a partir das decisões.</li>
          <li><b>Verificação</b>: a resposta responde à pergunta? Os números batem com os dados? Que gráfico ajudaria? Pede validação humana?</li>
          <li><b>Próximas perguntas</b>: o modelo propõe cinco, o Jev ranqueia, ficam três.</li>
        </ol>
        <p>Cada decisão traz probabilidade e confiança; abaixo do mínimo, o harness escolhe o caminho conservador e avisa.</p>
      </div>
    );
  const h = mensagem.harness;
  return (
    <>
      {h && (
        <div className="harness-resumo">
          <div className="stat"><small>Chamadas ao Jev</small><strong>{h.chamadasJev}</strong></div>
          <div className="stat"><small>Tempo do Jev</small><strong>{fmtMs(h.latenciaJevMs)}</strong></div>
          <div className="stat"><small>Custo do Jev</small><strong>{fmtUsd(h.custoJevUsd)}</strong></div>
          <div className="stat"><small>Tempo total</small><strong>{fmtMs(h.latenciaTotalMs)}</strong></div>
          <div className="stat" style={{ gridColumn: "1 / -1" }}><small>Modelo da resposta</small><strong style={{ fontSize: 12 }}>{h.modelo}</strong></div>
        </div>
      )}
      {ESTACOES.map((e) => {
        const itens = mensagem.decisoes!.filter((d) => d.estacao === e.id);
        if (!itens.length) return null;
        return (
          <section className="estacao" key={e.id}>
            <h3><i /> {e.nome}</h3>
            {itens.map((d, i) => (
              <div className={"decisao" + (d.baixaConfianca ? " baixa" : "") + (d.exemplo ? " exemplo" : "")} key={d.chave + i}>
                <div className="cab"><span>{d.rotulo}</span><strong>{d.valor}</strong></div>
                {d.probabilidade !== null && <div className="barra"><i style={{ width: `${Math.round(d.probabilidade * 100)}%` }} /></div>}
                <div className="rodape">
                  <span>{d.probabilidade !== null ? `probabilidade ${fmtPct(d.probabilidade)}` : ""}</span>
                  <span>{d.baixaConfianca ? "baixa confiança" : d.confianca !== null ? `confiança ${fmtPct(d.confianca)}` : ""}{d.exemplo ? " · exemplo" : ""}</span>
                </div>
              </div>
            ))}
          </section>
        );
      })}
      {h?.avisos.length ? <div className="avisos-harness">{h.avisos.map((a, i) => <div key={i}>{a}</div>)}</div> : null}
    </>
  );
}

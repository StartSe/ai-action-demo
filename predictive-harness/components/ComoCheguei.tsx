"use client";
// Coluna "Como cheguei aqui": premissas usadas (editáveis, com recálculo local sem IA), a fórmula em
// português com os números substituídos e as decisões do harness, estação por estação.
import { useState } from "react";
import type { Mensagem, RegistroDecisao } from "@/lib/types";
import { ROTULO_PREMISSA, UNIDADE_PREMISSA, formatarPremissa, type ChavePremissa } from "@/lib/fpa";
import { Icon, ErrorBox, fmtMs, fmtPct, fmtUsd } from "./ui";

const ESTACOES: { id: RegistroDecisao["estacao"]; nome: string; quem: string }[] = [
  { id: "triagem", nome: "Triagem", quem: "Jev" },
  { id: "roteamento", nome: "Roteamento", quem: "código" },
  { id: "especificacao", nome: "Especificação do cenário", quem: "modelo traduz, código valida" },
  { id: "motor", nome: "Motor", quem: "código" },
  { id: "verificacao", nome: "Verificação", quem: "Jev" },
  { id: "sugestoes", nome: "Próximas perguntas", quem: "Jev" },
  { id: "classificacao", nome: "Classificação das colunas", quem: "Jev" },
];

type Recalcular = (id: string, ajustes: Partial<Record<ChavePremissa, string>>, salvar: boolean) => Promise<void>;

export function ComoCheguei({ mensagem, onRecalcular, onLivro }: { mensagem: Mensagem | null; onRecalcular: Recalcular; onLivro: () => void }) {
  if (!mensagem?.decisoes?.length)
    return (
      <div className="harness-vazio">
        <p>Aqui aparece por que o agente respondeu o que respondeu. Escolha uma resposta na conversa para ver:</p>
        <ol>
          <li><b>Premissas usadas</b>, com a origem de cada uma (da base, informada ou sugerida). Você pode ajustar qualquer uma e recalcular na hora, sem chamar o modelo.</li>
          <li><b>Fórmula</b>: a conta em português, com os números substituídos.</li>
          <li><b>Decisões do Jev</b>: o que o Jev decidiu em cada estação, com probabilidade e confiança.</li>
        </ol>
        <p>O modelo de linguagem só traduz a pergunta e escreve a leitura. Toda conta é do motor.</p>
      </div>
    );
  const h = mensagem.harness;
  const fpa = mensagem.fpa;
  return (
    <>
      {fpa && <PremissasUsadas key={mensagem.id + (fpa.recalculadoEm || "")} mensagem={mensagem} onRecalcular={onRecalcular} onLivro={onLivro} />}
      {fpa && fpa.formula.length > 0 && (
        <section className="bloco">
          <h3>Fórmula</h3>
          <ol className="formula">
            {fpa.formula.map((l, i) => <li key={i}>{l}</li>)}
          </ol>
          <small className="muted">{fpa.base}</small>
        </section>
      )}
      <section className="bloco">
        <h3>Decisões do Jev</h3>
        {h && (
          <div className="harness-resumo">
            <div className="stat"><small>Chamadas ao Jev</small><strong>{h.chamadasJev}</strong></div>
            <div className="stat"><small>Tempo do Jev</small><strong>{fmtMs(h.latenciaJevMs)}</strong></div>
            <div className="stat"><small>Custo do Jev</small><strong>{fmtUsd(h.custoJevUsd)}</strong></div>
            <div className="stat"><small>Tempo total</small><strong>{fmtMs(h.latenciaTotalMs)}</strong></div>
            <div className="stat" style={{ gridColumn: "1 / -1" }}><small>Modelo da leitura</small><strong style={{ fontSize: 12 }}>{h.modelo}</strong></div>
          </div>
        )}
        {ESTACOES.map((e) => {
          const itens = mensagem.decisoes!.filter((d) => d.estacao === e.id);
          if (!itens.length) return null;
          return (
            <section className="estacao" key={e.id}>
              <h4><i /> {e.nome} <span>· {e.quem}</span></h4>
              {itens.map((d, i) => (
                <div className={"decisao" + (d.baixaConfianca ? " baixa" : "") + (d.exemplo ? " exemplo" : "")} key={d.chave + i}>
                  <div className="cab"><span>{d.rotulo}</span><strong>{d.valor}</strong></div>
                  {d.probabilidade !== null && <div className="barra"><i style={{ width: `${Math.round(d.probabilidade * 100)}%` }} /></div>}
                  {(d.probabilidade !== null || d.confianca !== null || d.baixaConfianca || d.exemplo) && (
                    <div className="rodape">
                      <span>{d.probabilidade !== null ? `probabilidade ${fmtPct(d.probabilidade)}` : ""}</span>
                      <span>{d.baixaConfianca ? "baixa confiança" : d.confianca !== null ? `confiança ${fmtPct(d.confianca)}` : ""}{d.exemplo ? " · exemplo" : ""}</span>
                    </div>
                  )}
                </div>
              ))}
            </section>
          );
        })}
        {h?.avisos.length ? <div className="avisos-harness">{h.avisos.map((a, i) => <div key={i}>{a}</div>)}</div> : null}
      </section>
    </>
  );
}


/** O formulário fica num filho com `key`: ao trocar de resposta (ou recalcular) ele nasce zerado, sem efeito. */
function PremissasUsadas({ mensagem, onRecalcular, onLivro }: { mensagem: Mensagem; onRecalcular: Recalcular; onLivro: () => void }) {
  const fpa = mensagem.fpa!;
  const [ajustes, setAjustes] = useState<Partial<Record<ChavePremissa, string>>>({});
  const [salvar, setSalvar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const mudou = Object.values(ajustes).some((v) => v !== undefined && v !== "");
  async function recalcular() {
    setBusy(true);
    setErro("");
    try {
      await onRecalcular(mensagem.id, Object.fromEntries(Object.entries(ajustes).filter(([, v]) => v)), salvar);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="bloco">
      <h3>Premissas usadas · {fpa.produto}</h3><p className="muted small">Ajuste os valores para testar outra hipótese. A origem de cada premissa aparece logo abaixo.</p>
      <div className="premissas usadas">
        {fpa.premissas.map((p) => (
          <label key={p.chave} className={"premissa " + p.origem} title={p.detalhe}>
            <span className="rotulo">{ROTULO_PREMISSA[p.chave]}</span>
            <input inputMode="decimal" value={ajustes[p.chave] ?? ""} placeholder={formatarPremissa(p.chave, p.valor)} disabled={busy || !!mensagem.exemplo} onChange={(e) => setAjustes({ ...ajustes, [p.chave]: e.target.value })} aria-label={`${ROTULO_PREMISSA[p.chave]}${UNIDADE_PREMISSA[p.chave] === "moeda" ? " em reais" : UNIDADE_PREMISSA[p.chave] === "percentual" ? " em percentual" : ""}`} />
            <span className={"chip " + (p.origem === "base" ? "neutral" : p.origem === "informada" ? "ok" : "warn")}>{p.origem === "base" ? "da base" : p.origem === "informada" ? "informada" : "sugerida"}</span>
          </label>
        ))}
      </div>
      <ErrorBox error={erro} />
      {mensagem.exemplo ? (
        <small className="muted">Na demonstração as premissas são as da base. Conecte a IA para ajustar e recalcular.</small>
      ) : (
        <div className="acoes-recalculo">
          <button className="primary pequeno" disabled={busy || !mudou} onClick={() => void recalcular()}>
            {busy ? <span className="spinner" /> : <Icon name="refresh" size={14} />} {salvar ? "Salvar ajustes e recalcular" : "Recalcular este cenário"}
          </button>
          <fieldset className="assumption-scope"><legend>Onde usar os ajustes?</legend><label className="marcar"><input type="radio" name="alcance-premissas" checked={!salvar} disabled={busy} onChange={() => setSalvar(false)} /> Só neste cenário</label><label className="marcar"><input type="radio" name="alcance-premissas" checked={salvar} disabled={busy} onChange={() => setSalvar(true)} /> Salvar no livro de premissas</label><p>{salvar ? `Os valores alterados passam a ser o padrão de ${fpa.produto} nas próximas análises, em qualquer conversa. Você pode restaurar os valores da base no livro.` : "O livro e as próximas análises continuam com os valores atuais."}</p><button className="text-button" disabled={busy} onClick={onLivro}><Icon name="book" size={14} /> Abrir livro de premissas</button></fieldset>
          <small className="muted">Só o motor roda de novo: sem custo e sem chamada ao modelo.</small>
        </div>
      )}
    </section>
  );
}

"use client";
// A conversa de abertura: você conta do seu negócio, a IA pergunta o resto e devolve um rascunho
// do preenchimento inteiro. Nada é gravado até você olhar os números e aplicar.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CampoNumero } from "./campos";
import { Aviso, Loading, Topbar, lerErro, useStatus } from "./ui";
import { moeda, percentual } from "@/lib/formato";
import { NAVEGACAO } from "@/lib/navegacao";
import { ROTULO_BALDE, ROTULO_CAPACIDADE, ROTULO_REGIME, ROTULO_TIPO } from "@/lib/rotulos";
import type { Fala } from "@/lib/conversa";
import type { Fonte } from "@/lib/busca";
import { semMarcacao } from "@/lib/leitura-ia";
import type { Proposta } from "@/lib/proposta";

type Modo = "abertura" | "assistente";

/** O que a tela diz em cada modo. Quem já tem itens não quer preencher de novo, quer perguntar. */
const TEXTOS: Record<Modo, { titulo: string; apoio: string; abertura: string; atalhos: string[]; convite: string }> = {
  abertura: {
    titulo: "Vamos começar pelo seu negócio",
    apoio: "Conte como você trabalha. No fim eu deixo um rascunho preenchido, você confere e muda o que estiver errado. Nada é salvo antes disso.",
    abertura: "Me conta do seu negócio: o que você vende e como. Pode escrever do seu jeito — eu pergunto o resto e no fim deixo tudo preenchido para você conferir.",
    atalhos: ["Tenho uma padaria e vendo no balcão e por aplicativo", "Faço design e cobro por projeto", "Conserto celulares, cobro peça e mão de obra"],
    convite: "Tenho uma padaria pequena, vendo no balcão e também pelo aplicativo…",
  },
  assistente: {
    titulo: "Pergunte sobre os seus preços",
    apoio: "Eu consulto os seus itens de verdade para responder. Os números são os mesmos que você vê nas telas.",
    abertura: "Pode perguntar. Eu olho os seus itens, os seus canais e os seus custos antes de responder.",
    atalhos: ["Qual item está me dando prejuízo?", "Quanto posso descontar no marketplace?", "Se os insumos subirem 20%, o que sai do alvo?", "Como está o meu mix?"],
    convite: "Qual item está com a pior margem?",
  },
};

export function Conversa() {
  const { status, erro: erroStatus } = useStatus();
  const router = useRouter();

  const [modo, setModo] = useState<Modo | null>(null);
  const [falas, setFalas] = useState<Fala[]>([]);
  const [fontes, setFontes] = useState<Fonte[]>([]);
  const [rascunho, setRascunho] = useState("");
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [proposta, setProposta] = useState<Proposta | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // O modo decide o que a tela diz antes da primeira pergunta: quem já tem itens cai no
    // assistente, quem não tem cai no preenchimento.
    fetch("/api/ia/conversa")
      .then((r) => (r.ok ? r.json() : { modo: "abertura" }))
      .then((d) => {
        const escolhido: Modo = d.modo === "assistente" ? "assistente" : "abertura";
        setModo(escolhido);
        setFalas([{ de: "assistente", texto: TEXTOS[escolhido].abertura }]);
      })
      .catch(() => {
        setModo("abertura");
        setFalas([{ de: "assistente", texto: TEXTOS.abertura.abertura }]);
      });
  }, []);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [falas.length, proposta]);

  async function enviar(texto: string) {
    const limpo = texto.trim();
    if (!limpo || pensando) return;
    const proximas: Fala[] = [...falas, { de: "pessoa", texto: limpo }];
    setFalas(proximas);
    setRascunho("");
    setPensando(true);
    setErro(null);
    try {
      const r = await fetch("/api/ia/conversa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ falas: proximas, modo }) });
      if (!r.ok) throw r;
      const dados = await r.json();
      setFalas([...proximas, { de: "assistente", texto: dados.resposta }]);
      setFontes(dados.fontes ?? []);
      if (dados.proposta) setProposta(dados.proposta);
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    } finally {
      setPensando(false);
    }
  }

  async function aplicar() {
    if (!proposta) return;
    setAplicando(true);
    setErro(null);
    try {
      const r = await fetch("/api/proposta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposta }) });
      if (!r.ok) throw r;
      const { primeiroItemId } = await r.json();
      router.push(primeiroItemId ? `/item/${primeiroItemId}` : "/");
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
      setAplicando(false);
    }
  }

  const textos = TEXTOS[modo ?? "abertura"];

  return (
    <>
      <Topbar marca="P" nome="Precificador" area="Financeiro" status={status} erro={erroStatus} usuario={status?.usuario} navegacao={NAVEGACAO} />

      <main className="max-w-[860px] mx-auto px-8 pt-6 pb-16 max-md:px-4 max-md:pt-4">
        <h1 className="titulo-painel">{textos.titulo}</h1>
        <p className="apoio mt-1 mb-6">{textos.apoio}</p>

        <div className="flex flex-col gap-4">
          {falas.map((fala, i) => (
            <div key={i} className={fala.de === "pessoa" ? "flex justify-end" : ""}>
              <div className={`max-w-[85%] px-4 py-3 rounded-card text-[15px] leading-[1.55] whitespace-pre-line ${fala.de === "pessoa" ? "bg-accent text-white" : "bg-surface border border-line"}`}>
                {semMarcacao(fala.texto)}
              </div>
            </div>
          ))}

          {/* O que veio da internet fica com a fonte à vista: é número público, e quem confere
              precisa poder abrir de onde saiu. */}
          {fontes.length > 0 && !pensando && (
            <div className="max-w-[85%] text-[12.5px] text-muted">
              <span>Consultei na internet: </span>
              {fontes.map((f, i) => (
                <span key={f.url}>
                  {i > 0 && " · "}
                  <a className="btn-link text-[12.5px]" href={f.url} target="_blank" rel="noreferrer noopener">
                    {f.titulo}
                  </a>
                </span>
              ))}
            </div>
          )}

          {pensando && (
            <div className="max-w-[85%]">
              <Loading texto="Pensando" />
            </div>
          )}
        </div>

        {erro && (
          <div className="mt-4">
            <Aviso tom="danger">{erro}</Aviso>
          </div>
        )}

        {proposta && <Rascunho proposta={proposta} onMudar={setProposta} onAplicar={aplicar} aplicando={aplicando} />}

        {!proposta && (
          <form
            className="mt-6 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              enviar(rascunho);
            }}
          >
            <textarea
              className="input min-h-24"
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value)}
              placeholder={textos.convite}
              aria-label="Sua mensagem"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  enviar(rascunho);
                }
              }}
            />
            <div className="flex items-center gap-3 flex-wrap">
              <button type="submit" className="btn-primary !w-auto" disabled={pensando || !rascunho.trim()}>
                Enviar
              </button>
              <Link className="btn-link" href="/">
                {modo === "assistente" ? "Voltar aos itens" : "Prefiro preencher na mão"}
              </Link>
            </div>
          </form>
        )}

        {!proposta && falas.length === 1 && (
          <div className="mt-5">
            <p className="apoio mb-2">Ou comece por um destes:</p>
            <div className="flex flex-wrap gap-2">
              {textos.atalhos.map((a) => (
                <button key={a} type="button" className="chip-neutral cursor-pointer hover:brightness-95" onClick={() => enviar(a)} disabled={pensando}>
                  {a}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={fimRef} />
      </main>
    </>
  );
}

/** O rascunho, com os números à mostra e editáveis antes de virar dado de verdade. */
function Rascunho({ proposta, onMudar, onAplicar, aplicando }: { proposta: Proposta; onMudar: (p: Proposta) => void; onAplicar: () => void; aplicando: boolean }) {
  const { negocio, fixos, canais, itens } = proposta;
  const totalFixo = fixos.reduce((s, f) => s + f.valorMensal, 0);

  return (
    <div className="reveal card p-5 mt-6">
      <h2 className="section-title">Rascunho do seu negócio</h2>
      <p className="apoio mb-4">Confira os números. Nada aqui é preço: são as entradas que o app usa para calcular os preços depois.</p>

      <div className="flex flex-col gap-5">
        <section>
          <h3 className="text-[13px] font-bold text-ink mb-2">{negocio.nome || "Seu negócio"}</h3>
          <ul className="apoio flex flex-col gap-0.5">
            <li>Regime: {ROTULO_REGIME[negocio.regime]}</li>
            <li>Capacidade medida em: {ROTULO_CAPACIDADE[negocio.modoCapacidade].toLowerCase()}</li>
            {negocio.volumeMensalUnidades > 0 && <li>{negocio.volumeMensalUnidades} unidades por mês</li>}
            {negocio.horasProdutivasMes > 0 && <li>{negocio.horasProdutivasMes} horas produtivas por mês</li>}
            <li>Quer tirar {moeda(negocio.proLaboreMensal)} por mês</li>
          </ul>
          <div className="mt-3 max-w-[220px]">
            <label htmlFor="margem-rascunho" className="text-[13px] font-semibold text-ink">
              Margem-alvo
            </label>
            <div className="mt-1.5">
              <CampoNumero
                id="margem-rascunho"
                unidade="%"
                valor={negocio.margemAlvoPadraoPct * 100}
                onValor={(n) => onMudar({ ...proposta, negocio: { ...negocio, margemAlvoPadraoPct: Math.min(1, Math.max(0, n / 100)) } })}
              />
            </div>
          </div>
        </section>

        {fixos.length > 0 && (
          <section>
            <h3 className="text-[13px] font-bold text-ink mb-2">
              Custos do mês · {moeda(totalFixo)}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {fixos.map((f, i) => (
                <li key={i} className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] flex-1 min-w-[120px]">{f.nome}</span>
                  <span className="apoio">{ROTULO_BALDE[f.balde].toLowerCase()}</span>
                  <div className="w-[130px]">
                    <CampoNumero
                      className="!py-1.5"
                      unidade="R$"
                      unidadeAntes
                      valor={f.valorMensal}
                      rotuloAcessivel={`Valor de ${f.nome}`}
                      onValor={(n) => onMudar({ ...proposta, fixos: fixos.map((x, j) => (j === i ? { ...x, valorMensal: n } : x)) })}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-link text-muted hover:text-danger"
                    aria-label={`Tirar ${f.nome} do rascunho`}
                    onClick={() => onMudar({ ...proposta, fixos: fixos.filter((_, j) => j !== i) })}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {canais.length > 0 && (
          <section>
            <h3 className="text-[13px] font-bold text-ink mb-2">Onde você vende</h3>
            <ul className="apoio flex flex-col gap-0.5">
              {canais.map((c, i) => (
                <li key={i}>
                  {c.nome} · {percentual(c.taxaPct)}
                  {c.taxaFixa > 0 && ` mais ${moeda(c.taxaFixa)} por venda`}
                  {c.padrao && " · principal"}
                </li>
              ))}
            </ul>
          </section>
        )}

        {itens.length > 0 && (
          <section>
            <h3 className="text-[13px] font-bold text-ink mb-2">
              {itens.length} {itens.length === 1 ? "item" : "itens"} para começar
            </h3>
            <ul className="flex flex-col gap-3">
              {itens.map((item, i) => (
                <li key={i} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <span className="text-[14px] font-semibold text-ink">{item.nome}</span>
                    <span className="apoio">
                      {ROTULO_TIPO[item.tipo].toLowerCase()}
                      {item.tempoMinutos > 0 && ` · ${item.tempoMinutos} min`}
                      {item.perdaPct > 0 && ` · ${percentual(item.perdaPct)} de perda`}
                    </span>
                  </div>
                  {item.insumos.length > 0 && (
                    <ul className="apoio mt-1 flex flex-col gap-0.5">
                      {item.insumos.map((l, j) => (
                        <li key={j}>
                          {l.nome}: usa {l.qtdUsada} {l.unidadeUso}, compra {l.qtdCompra} {l.unidadeCompra} por {moeda(l.custoCompra)}
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    className="btn-link text-[13px] text-muted hover:text-danger mt-1"
                    onClick={() => onMudar({ ...proposta, itens: itens.filter((_, j) => j !== i) })}
                  >
                    tirar do rascunho
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="flex items-center gap-4 flex-wrap mt-6">
        <button type="button" className="btn-primary !w-auto" onClick={onAplicar} disabled={aplicando}>
          {aplicando ? "Aplicando…" : "Usar este rascunho"}
        </button>
        <Link className="btn-link" href="/">
          Descartar
        </Link>
      </div>
      <p className="apoio mt-2">Depois de aplicar, tudo continua editável nas telas de Negócio e de cada item.</p>
    </div>
  );
}

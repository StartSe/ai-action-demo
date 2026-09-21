"use client";
// O painel de resultado da Bancada: corredor, três números, cascata, equilíbrio, abas de canal e a
// leitura da IA. Tudo recalculado no navegador a cada tecla — nenhuma requisição, exceto o bloco de
// IA, que é explicitamente acionado.
import { useState } from "react";
import { Cascata } from "./Cascata";
import { Corredor } from "./Corredor";
import { CampoNumero, Estampa, PorQue } from "./campos";
import { Aviso, lerErro } from "./ui";
import { moeda, numero, percentual } from "@/lib/formato";
import { EXPLICACAO_ESTADO } from "@/lib/rotulos";
import { impostoPct, precificarAutomatico, type CanalVenda, type Cenario, type Item, type LinhaCustoFixo, type LinhaInsumo, type Negocio } from "@/lib/precificacao";
import type { LeituraCorredor } from "@/lib/types";

function Numero({ rotulo, valor, tom, porque }: { rotulo: string; valor: string; tom?: "bom" | "ruim"; porque: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-bold text-muted uppercase tracking-[0.04em]">{rotulo}</div>
      <div className={`cifra-media ${tom === "ruim" ? "text-danger" : tom === "bom" ? "text-ok" : "text-ink"}`}>{valor}</div>
      <PorQue>{porque}</PorQue>
    </div>
  );
}

export function PainelPreco({
  negocio,
  custosFixos,
  item,
  insumos,
  canais,
  canalAtivo,
  onCanal,
  precosEscolhidos,
  onPreco,
  onAutomatico,
}: {
  negocio: Negocio;
  custosFixos: LinhaCustoFixo[];
  item: Item;
  insumos: LinhaInsumo[];
  canais: CanalVenda[];
  canalAtivo: CanalVenda;
  onCanal: (id: string) => void;
  precosEscolhidos: Record<string, number>;
  onPreco: (canalId: string, preco: number) => void;
  onAutomatico: (canalId: string) => void;
}) {
  const [leitura, setLeitura] = useState<LeituraCorredor | null>(null);
  const [lendo, setLendo] = useState(false);
  const [erroIA, setErroIA] = useState<string | null>(null);
  const [aberta, setAberta] = useState(false);

  const cenario = (canal: CanalVenda): Cenario => ({ negocio, custosFixos, item, insumos, canal });
  // Enquanto ninguém escolheu um preço neste canal, ele é recalculado aqui a cada tecla: preencher
  // a ficha move o preço junto, com imposto, taxa do canal e perda já dentro da conta.
  const { corredor, derivados, cascata, automatico } = precificarAutomatico(cenario(canalAtivo), precosEscolhidos[canalAtivo.id]);
  const preco = derivados.preco;
  const impostoDoRegime = impostoPct(negocio, item.tipo);
  const taxaDoCanal = Math.max(0, corredor.taxaTotalPct - impostoDoRegime);

  const capacidade = item.tipo === "produto" ? negocio.volumeMensalUnidades : negocio.horasProdutivasMes > 0 ? (negocio.horasProdutivasMes * 60) / Math.max(1, item.tempoMinutos) : 0;

  async function pedirLeitura() {
    setLendo(true);
    setErroIA(null);
    setAberta(true);
    try {
      const r = await fetch("/api/ia/corredor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: item.id, canalId: canalAtivo.id, preco }) });
      if (!r.ok) throw r;
      const dados = await r.json();
      setLeitura(dados.leitura);
    } catch (e) {
      setErroIA((await lerErro(e)).mensagem);
    } finally {
      setLendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Abas de canal: mesmo item, um preço por canal, cada aba com a sua margem. */}
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1" role="tablist" aria-label="Canais de venda">
        {canais.map((canal) => {
          const resultado = precificarAutomatico(cenario(canal), precosEscolhidos[canal.id]);
          const ativo = canal.id === canalAtivo.id;
          return (
            <button
              key={canal.id}
              type="button"
              role="tab"
              aria-selected={ativo}
              data-estado={resultado.derivados.estado}
              onClick={() => onCanal(canal.id)}
              className={`shrink-0 px-3 py-2 rounded-field border text-left transition-colors cursor-pointer ${ativo ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-bg"}`}
            >
              <span className="block text-[13px] font-semibold text-ink">{canal.nome}</span>
              <span className="cifra block text-[12px]" style={{ color: "var(--cor-estado)" }}>
                {percentual(resultado.derivados.margemLiquidaPct)}
              </span>
            </button>
          );
        })}
      </div>

      <div>
        <Corredor corredor={corredor} preco={preco} onPreco={(p) => onPreco(canalAtivo.id, p)} />

        <div className="flex flex-wrap items-center gap-3 mt-2">
          <CampoNumero grande className="!w-[190px]" unidade="R$" unidadeAntes valor={preco} onValor={(p) => onPreco(canalAtivo.id, p)} rotuloAcessivel="Preço escolhido" />
          <Estampa estado={derivados.estado} />
        </div>

        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {automatico ? (
            <span className="text-[13px] text-accent-ink font-semibold">Preço automático, seguindo a margem-alvo de {percentual(corredor.margemAlvoPct)}</span>
          ) : (
            <>
              <span className="text-[13px] text-ink-2 font-semibold">Preço escolhido por você</span>
              <button type="button" className="btn-link text-[13px]" onClick={() => onAutomatico(canalAtivo.id)}>
                voltar ao automático
              </button>
            </>
          )}
        </div>

        <p className="apoio mt-1">{EXPLICACAO_ESTADO[derivados.estado]}</p>

        {corredor.custo.total > 0 && Number.isFinite(derivados.markup) && (
          <div className="mt-3">
            <span className="text-[14px] text-ink">
              Markup de <strong className="cifra">{numero(derivados.markup, 2)}×</strong> sobre o custo de <span className="cifra">{moeda(corredor.custo.total)}</span>
            </span>
            <PorQue rotulo="como o preço automático é encontrado">
              <div>
                O preço não é o custo mais a margem por cima: imposto, taxa do canal e a sua margem saem todos <strong>do preço</strong>, então a conta divide em vez de multiplicar.
              </div>
              <div className="mt-2">
                {moeda(corredor.custo.total)} de custo {corredor.taxaFixaCanal > 0 ? `+ ${moeda(corredor.taxaFixaCanal)} por transação ` : ""}÷ (1 − {percentual(impostoDoRegime)} de imposto − {percentual(taxaDoCanal)} de taxa do canal −{" "}
                {percentual(corredor.margemAlvoPct)} de margem) = {corredor.pisoMargemAlvo === null ? "não cabe" : moeda(corredor.pisoMargemAlvo)}
              </div>
              <div className="mt-2">
                No preço de agora, {moeda(preco)} ÷ {moeda(corredor.custo.total)} = {numero(derivados.markup, 2)}× o custo.
              </div>
            </PorQue>
          </div>
        )}

        {/* Um item sem custo informado tem os dois pisos em zero: tudo parece saudável, o desconto
            máximo dá 100% e o equilíbrio dá zero unidade. Os números estão certos e não servem
            para nada — melhor dizer isso do que deixar a pessoa confiar neles. */}
        {corredor.custo.total <= 0 && (
          <Aviso tom="warn">
            Este item ainda não tem custo. Enquanto ele for zero, qualquer preço aparece como saudável. Preencha a ficha de insumos ou o custo de material.
          </Aviso>
        )}

        {corredor.impossivel && (
          <Aviso tom="warn">
            Imposto e taxa do canal já levam {percentual(corredor.taxaTotalPct)} do preço, então a margem-alvo de {percentual(corredor.margemAlvoPct)} não cabe. O máximo que sobra neste canal é{" "}
            {percentual(corredor.impossivel.margemMaximaPct)}.
          </Aviso>
        )}

        {corredor.mercado && corredor.mercado.max < corredor.custo.total && (
          <Aviso tom="danger">
            O mercado cobra menos do que este item custa para você ({moeda(corredor.mercado.max)} contra {moeda(corredor.custo.total)} de custo). Acompanhar esse preço é vender no prejuízo.
          </Aviso>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 max-sm:grid-cols-1 max-sm:gap-3">
        <Numero
          rotulo="Margem real"
          valor={percentual(derivados.margemLiquidaPct)}
          tom={derivados.lucro < 0 ? "ruim" : derivados.estado === "saudavel" ? "bom" : undefined}
          porque={
            <>
              {moeda(derivados.lucro)} de lucro ÷ {moeda(derivados.preco)} de preço = {percentual(derivados.margemLiquidaPct)}
            </>
          }
        />
        <Numero
          rotulo="Lucro por unidade"
          valor={moeda(derivados.lucro)}
          tom={derivados.lucro < 0 ? "ruim" : undefined}
          porque={
            <>
              {moeda(derivados.preco)} − {moeda(derivados.taxas)} de imposto e taxa {derivados.taxaFixa > 0 ? `− ${moeda(derivados.taxaFixa)} por transação ` : ""}− {moeda(corredor.custo.total)} de custo ={" "}
              {moeda(derivados.lucro)}
            </>
          }
        />
        <Numero
          rotulo="Desconto máximo"
          valor={percentual(derivados.descontoMaximoPct)}
          porque={
            <>
              ({moeda(derivados.preco)} − {moeda(corredor.pisoPrejuizo)} de lucro zero) ÷ {moeda(derivados.preco)} = {percentual(derivados.descontoMaximoPct)}. Abaixo disso, a venda passa a tirar dinheiro do
              caixa.
            </>
          }
        />
      </div>

      <Cascata cascata={cascata} />

      <section>
        <h3 className="section-title">Quanto precisa vender</h3>
        {derivados.pontoEquilibrio === null ? (
          <p className="text-[14px] text-danger">A esse preço, nenhum volume paga os custos fixos deste balde.</p>
        ) : (
          <>
            <p className="text-[15px] text-ink">
              A {moeda(derivados.preco)}, você precisa vender <strong className="cifra">{numero(Math.ceil(derivados.pontoEquilibrio))}</strong>{" "}
              {item.tipo === "produto" ? "unidades" : "atendimentos"} por mês para fechar no azul.
            </p>
            {capacidade > 0 && (
              <p className={`apoio mt-1 ${derivados.pontoEquilibrio > capacidade ? "!text-danger font-semibold" : ""}`}>
                {derivados.pontoEquilibrio > capacidade
                  ? `Isso é mais do que a capacidade que você declarou (${numero(Math.floor(capacidade))} por mês). Neste preço a conta não fecha nem vendendo tudo.`
                  : `Sua capacidade declarada é de ${numero(Math.floor(capacidade))} por mês, então cabe.`}
              </p>
            )}
            <PorQue>
              {moeda(corredor.fixosDoBalde)} de custo fixo do balde ÷ {moeda(derivados.margemContribuicao)} de margem de contribuição por unidade ={" "}
              {numero(Math.ceil(derivados.pontoEquilibrio))} por mês
            </PorQue>
          </>
        )}
      </section>

      <section>
        <button type="button" className="btn-link" onClick={() => (leitura ? setAberta(!aberta) : pedirLeitura())} aria-expanded={aberta}>
          {leitura && aberta ? "Esconder a leitura" : "O que esse corredor está dizendo?"}
        </button>
        <p className="apoio mt-1">A inteligência artificial lê os números acima e escreve o que eles significam. Ela não calcula nada: todos os valores desta tela saem da sua ficha.</p>
        {aberta && (
          <div className="mt-3">
            {lendo && <p className="apoio">Lendo os números…</p>}
            {erroIA && <Aviso tom="danger">{erroIA}</Aviso>}
            {leitura && !lendo && (
              <div className="reveal p-4 rounded-card bg-accent-soft">
                <p className="text-[14px] text-ink leading-[1.6]">{leitura.resumo}</p>
                {leitura.acoes.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {leitura.acoes.map((a, i) => (
                      <li key={i} className="text-[13px] text-ink-2">
                        {a}
                      </li>
                    ))}
                  </ul>
                )}
                {leitura.risco && <p className="mt-3 text-[13px] font-semibold text-accent-ink">{leitura.risco}</p>}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

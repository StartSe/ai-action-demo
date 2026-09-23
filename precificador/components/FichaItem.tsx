"use client";
// A ficha do item: uma tabela editável, não uma pilha de cartões brancos.
//
// Toda edição sobe pelo `onMudar` do componente pai, que recalcula na hora e salva com atraso.
// Nada aqui faz requisição, exceto o bloco de IA e a criação do link de coleta.
import { useState } from "react";
import { Campo, CampoNumero, CampoPercentual, PorQue } from "./campos";
import { Aviso, lerErro, MaisDetalhes } from "./ui";
import { moeda, percentual, quantidade } from "@/lib/formato";
import { ROTULO_TIPO } from "@/lib/rotulos";
import { comporCusto, custoDaLinha, UNIDADES, type ComposicaoCusto, type Item, type LinhaCustoFixo, type LinhaInsumo, type Negocio, type Unidade } from "@/lib/precificacao";
import type { CustosEsquecidos } from "@/lib/types";

/**
 * Linha nova nasce com a unidade avulsa (o que menos surpreende quem cadastra serviço) e com um id
 * gerado aqui, não pelo servidor.
 *
 * O id vir do cliente é o que deixa a linha sobreviver enquanto ela ainda não tem nome: a gravação
 * é adiada e só persiste linha nomeada, então a resposta nunca traz a linha em branco de volta. Com
 * o id no cliente, a tela não depende da resposta para saber quem é quem.
 */
function linhaNova(itemId: string): LinhaInsumo {
  return { id: crypto.randomUUID(), itemId, nome: "", qtdUsada: 1, unidadeUso: "un", qtdCompra: 1, custoCompra: 0, unidadeCompra: "un" };
}

type Passo = { pronto: boolean; texto: string };

/**
 * O que ainda falta para o preço fazer sentido, em ordem de importância.
 *
 * Existe porque o preço aqui é automático: sem esta lista, a pessoa não tem como saber por que o
 * número do lado ainda está estranho. Cada passo some assim que é cumprido.
 */
function Guia({ passos }: { passos: Passo[] }) {
  const faltando = passos.filter((p) => !p.pronto);
  if (faltando.length === 0) return null;

  return (
    <div className="card p-4 bg-accent-soft border-accent-soft">
      <p className="text-[13px] font-bold text-accent-ink mb-2">
        {faltando.length === 1 ? "Falta um passo para o preço fechar" : `Faltam ${faltando.length} passos para o preço fechar`}
      </p>
      <ul className="flex flex-col gap-1">
        {faltando.map((p) => (
          <li key={p.texto} className="text-[13px] text-ink-2 flex items-start gap-2">
            <span aria-hidden="true" className="text-accent mt-[1px]">○</span>
            <span>{p.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SeletorUnidade({ valor, onValor, rotulo }: { valor: Unidade; onValor: (u: Unidade) => void; rotulo: string }) {
  return (
    <select className="input !w-auto !px-2 !py-1.5 text-[13px]" value={valor} onChange={(e) => onValor(e.target.value as Unidade)} aria-label={rotulo}>
      {UNIDADES.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
    </select>
  );
}

function BarraComposicao({ custo }: { custo: ComposicaoCusto }) {
  // Sem linhas de insumo, o material é o valor digitado à mão — que também precisa aparecer aqui,
  // senão a barra afirma que o custo fixo é o que mais pesa num item cujo material custa 80 reais.
  const material = custo.linhas.length
    ? custo.linhas.filter((l) => l.valor > 0).map((l) => ({ nome: l.nome, valor: l.valor }))
    : custo.insumos > 0
      ? [{ nome: "Material", valor: custo.insumos }]
      : [];

  const partes = [
    ...material,
    ...(custo.maoDeObra > 0 ? [{ nome: "Seu tempo", valor: custo.maoDeObra }] : []),
    ...(custo.perda > 0 ? [{ nome: "Perda", valor: custo.perda }] : []),
    ...(custo.rateioFixo > 0 ? [{ nome: "Custo fixo", valor: custo.rateioFixo }] : []),
  ];
  const total = partes.reduce((s, p) => s + p.valor, 0);
  if (total <= 0) return null;
  const maior = partes.reduce((a, b) => (b.valor > a.valor ? b : a), partes[0]);

  return (
    <div className="mt-4">
      <div className="flex h-2.5 rounded-full overflow-hidden border border-line" role="img" aria-label={partes.map((p) => `${p.nome}: ${moeda(p.valor)}`).join(", ")}>
        {partes.map((p, i) => (
          <div key={`${p.nome}-${i}`} style={{ width: `${(p.valor / total) * 100}%`, background: i % 2 === 0 ? "var(--color-accent)" : "var(--color-accent-2)" }} title={`${p.nome}: ${moeda(p.valor)}`} />
        ))}
      </div>
      <p className="apoio mt-2">
        O que mais pesa é <strong className="text-ink">{maior.nome}</strong>, com {moeda(maior.valor)} de {moeda(total)}.
      </p>
    </div>
  );
}

export function FichaItem({
  negocio,
  custosFixos,
  item,
  insumos,
  onItem,
  onInsumos,
}: {
  negocio: Negocio;
  custosFixos: LinhaCustoFixo[];
  item: Item;
  insumos: LinhaInsumo[];
  onItem: (mudanca: Partial<Item>) => void;
  onInsumos: (linhas: LinhaInsumo[]) => void;
}) {
  const [custos, setCustos] = useState<CustosEsquecidos | null>(null);
  const [carregandoCustos, setCarregandoCustos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [linkColeta, setLinkColeta] = useState<string | null>(null);

  const composicao = comporCusto({ negocio, custosFixos, item, insumos });

  const passos: Passo[] = [
    { pronto: Boolean(item.nome.trim()) && item.nome !== "Item novo", texto: "Dê um nome ao item" },
    { pronto: composicao.direto > 0, texto: "Informe o que entra em cada unidade, por linha de insumo ou como um custo só" },
    { pronto: item.tipo === "produto" ? negocio.volumeMensalUnidades > 0 : negocio.horasProdutivasMes > 0, texto: "Declare sua capacidade do mês em Negócio, senão o custo fixo não é rateado" },
    { pronto: negocio.horasProdutivasMes > 0 && negocio.proLaboreMensal > 0, texto: "Informe suas horas e quanto quer tirar por mês, em Negócio, para o seu tempo entrar no preço" },
    { pronto: item.precosConcorrentes.length > 0, texto: "Cadastre ao menos um preço de concorrente para ver a faixa de mercado" },
  ];

  function trocarLinha(id: string, mudanca: Partial<LinhaInsumo>) {
    onInsumos(insumos.map((l) => (l.id === id ? { ...l, ...mudanca } : l)));
  }

  async function perguntarCustos() {
    setCarregandoCustos(true);
    setErro(null);
    try {
      const r = await fetch("/api/ia/custos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: item.id }) });
      if (!r.ok) throw r;
      const dados = await r.json();
      setCustos(dados.custos);
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    } finally {
      setCarregandoCustos(false);
    }
  }

  async function gerarLinkColeta() {
    setErro(null);
    try {
      const r = await fetch(`/api/itens/${item.id}/coleta`, { method: "POST" });
      if (!r.ok) throw r;
      const dados = await r.json();
      setLinkColeta(dados.endereco);
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Guia passos={passos} />

      <div className="card p-5">
        <div className="flex flex-col gap-4">
          <Campo rotulo="Nome do item" para="nome-item">
            <input id="nome-item" className="input" value={item.nome} onChange={(e) => onItem({ nome: e.target.value })} placeholder="Pão de forma artesanal" />
          </Campo>
          <Campo rotulo="Tipo" para="tipo-item" ajuda="Produto rateia o custo fixo por unidade; serviço, por hora.">
            <select id="tipo-item" className="input" value={item.tipo} onChange={(e) => onItem({ tipo: e.target.value as Item["tipo"] })}>
              <option value="produto">{ROTULO_TIPO.produto}</option>
              <option value="servico">{ROTULO_TIPO.servico}</option>
            </select>
          </Campo>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="section-title !mb-0">O que entra em cada unidade</h2>
          <span className="cifra text-[13px] text-muted">{moeda(composicao.direto)} de custo direto</span>
        </div>

        {insumos.length === 0 ? (
          <div className="flex flex-col gap-4">
            <p className="apoio">
              A lista de insumos é opcional. Se você já sabe quanto cada unidade custa em material, digite o valor e siga; dá para montar a receita depois.
            </p>
            <Campo rotulo="Custo de material por unidade" para="custo-manual">
              <CampoNumero id="custo-manual" unidade="R$" unidadeAntes valor={item.custoDiretoManual} onValor={(n) => onItem({ custoDiretoManual: n })} placeholder="0,00" />
            </Campo>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="ficha min-w-[560px]">
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th>Usa</th>
                  <th>Compra</th>
                  <th>Por</th>
                  <th className="text-right">Custo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {insumos.map((linha) => {
                  const calculada = custoDaLinha(linha);
                  return (
                    <tr key={linha.id}>
                      <td className="min-w-[130px]">
                        <input className="input !py-1.5 text-[14px]" value={linha.nome} onChange={(e) => trocarLinha(linha.id, { nome: e.target.value })} placeholder="Farinha" aria-label="Nome do insumo" />
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <CampoNumero className="!py-1.5 w-[86px]" unidade="" valor={linha.qtdUsada} onValor={(n) => trocarLinha(linha.id, { qtdUsada: n })} casas={3} rotuloAcessivel="Quantidade usada" />
                          <SeletorUnidade valor={linha.unidadeUso} onValor={(u) => trocarLinha(linha.id, { unidadeUso: u })} rotulo="Unidade de uso" />
                        </div>
                      </td>
                      <td>
                        <CampoNumero className="!py-1.5 w-[104px]" unidade="R$" unidadeAntes valor={linha.custoCompra} onValor={(n) => trocarLinha(linha.id, { custoCompra: n })} rotuloAcessivel="Preço de compra" />
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <CampoNumero className="!py-1.5 w-[80px]" unidade="" valor={linha.qtdCompra} onValor={(n) => trocarLinha(linha.id, { qtdCompra: n })} casas={3} rotuloAcessivel="Quantidade comprada" />
                          <SeletorUnidade valor={linha.unidadeCompra} onValor={(u) => trocarLinha(linha.id, { unidadeCompra: u })} rotulo="Unidade de compra" />
                        </div>
                      </td>
                      <td className="text-right">
                        <span className="cifra font-semibold">{moeda(calculada.valor)}</span>
                        {calculada.aviso && <span className="block text-[11px] text-danger leading-tight mt-0.5">{calculada.aviso}</span>}
                      </td>
                      <td className="w-8">
                        <button type="button" className="btn-link text-muted hover:text-danger" onClick={() => onInsumos(insumos.filter((l) => l.id !== linha.id))} aria-label={`Remover ${linha.nome || "insumo"}`}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap gap-3 mt-4">
          <button type="button" className="btn-ghost" onClick={() => onInsumos([...insumos, linhaNova(item.id)])}>
            Adicionar insumo
          </button>
          <button type="button" className="btn-ghost" onClick={perguntarCustos} disabled={carregandoCustos}>
            {carregandoCustos ? "Pensando…" : "O que pode estar faltando?"}
          </button>
        </div>
        <p className="apoio mt-2">A inteligência artificial só faz perguntas sobre custos comuns deste tipo de item. Quem calcula o preço é o app.</p>

        <BarraComposicao custo={composicao} />

        {insumos.length > 0 && (
          <PorQue rotulo="como a conta de cada linha é feita">
            {insumos.slice(0, 3).map((l) => {
              const c = custoDaLinha(l);
              return (
                <div key={l.id}>
                  {l.nome || "Insumo"}: {quantidade(l.qtdUsada, l.unidadeUso)} de uma compra de {quantidade(l.qtdCompra, l.unidadeCompra)} por {moeda(l.custoCompra)} = {moeda(c.valor)}
                </div>
              );
            })}
          </PorQue>
        )}

        {custos && (
          <div className="reveal mt-4 p-4 rounded-card bg-accent-soft">
            <p className="text-[14px] font-semibold text-accent-ink mb-2">{custos.abertura}</p>
            <p className="apoio mb-2">Nenhum valor abaixo é um palpite de preço: são só perguntas para você responder na ficha.</p>
            <ul className="flex flex-col gap-2">
              {custos.perguntas.map((p, i) => (
                <li key={i} className="text-[13px]">
                  <strong className="text-ink">{p.pergunta}</strong> <span className="text-ink-2">{p.porque}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="section-title">Tempo, perda e margem</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Campo rotulo="Tempo de execução" para="tempo" ajuda="Por unidade, em minutos.">
            <CampoNumero id="tempo" unidade="min" casas={0} valor={item.tempoMinutos} onValor={(n) => onItem({ tempoMinutos: n })} />
          </Campo>
          <Campo rotulo="Perda" para="perda" ajuda="O que se perde no processo.">
            <CampoPercentual id="perda" valor={item.perdaPct} onValor={(f) => onItem({ perdaPct: f })} />
          </Campo>
          <Campo rotulo="Margem-alvo" para="margem" ajuda={`Vazio usa a do negócio: ${percentual(negocio.margemAlvoPadraoPct)}.`}>
            <CampoPercentual id="margem" valor={item.margemAlvoPct} onValor={(f) => onItem({ margemAlvoPct: f > 0 ? f : undefined })} />
          </Campo>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="section-title">O que o mercado cobra</h2>
        {item.precosConcorrentes.length === 0 ? (
          <p className="apoio mb-3">Sem nenhum preço de concorrente, a faixa de mercado não aparece na régua.</p>
        ) : (
          <ul className="flex flex-wrap gap-2 mb-3">
            {item.precosConcorrentes.map((p, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="chip-neutral cursor-pointer hover:brightness-95"
                  onClick={() => onItem({ precosConcorrentes: item.precosConcorrentes.filter((_, j) => j !== i) })}
                  aria-label={`Remover o preço ${moeda(p)}`}
                >
                  {moeda(p)} ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <NovoPrecoConcorrente onAdicionar={(p) => onItem({ precosConcorrentes: [...item.precosConcorrentes, p] })} />
          <button type="button" className="btn-ghost" onClick={gerarLinkColeta}>
            Pedir por link
          </button>
        </div>
        {linkColeta && (
          <div className="mt-3">
            <p className="apoio mb-1">Mande este link para alguém do time preencher. Vale uma resposta, por quinze dias.</p>
            <code className="block text-[12px] p-2 rounded-field bg-surface-2 border border-line break-all">{linkColeta}</code>
          </div>
        )}

        <MaisDetalhes titulo="Teto de valor">
          <p className="apoio mb-3">
            Duas perguntas definem o teto: o que o cliente pagaria hoje sem você, e quanto vale o que você entrega a mais. O teto não é calculado — é você quem declara.
          </p>
          <Campo rotulo="Teto de valor" para="teto" ajuda="Acima disso o cliente costuma procurar outra opção.">
            <CampoNumero id="teto" unidade="R$" unidadeAntes valor={item.precoValorTeto} onValor={(n) => onItem({ precoValorTeto: n > 0 ? n : undefined })} placeholder="0,00" />
          </Campo>
        </MaisDetalhes>
      </div>

      {erro && <Aviso tom="danger">{erro}</Aviso>}
    </div>
  );
}

function NovoPrecoConcorrente({ onAdicionar }: { onAdicionar: (preco: number) => void }) {
  const [valor, setValor] = useState(0);
  return (
    <div className="flex items-end gap-2">
      <Campo rotulo="Preço de um concorrente" para="novo-concorrente">
        <CampoNumero id="novo-concorrente" unidade="R$" unidadeAntes valor={valor || undefined} onValor={setValor} placeholder="0,00" />
      </Campo>
      <button
        type="button"
        className="btn-ghost shrink-0"
        disabled={valor <= 0}
        onClick={() => {
          onAdicionar(valor);
          setValor(0);
        }}
      >
        Adicionar
      </button>
    </div>
  );
}

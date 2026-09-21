"use client";
// A tela que se configura uma vez: custos fixos, capacidade, regime e canais de venda.
// Tudo o que está aqui alimenta o rateio e a alíquota de todo item da carteira.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Campo, CampoNumero, CampoPercentual, PorQue } from "./campos";
import { Aviso, Loading, Topbar, lerErro, useStatus } from "./ui";
import { moeda, numero, percentual } from "@/lib/formato";
import { NAVEGACAO } from "@/lib/navegacao";
import { ANEXOS_SIMPLES, ROTULO_BALDE, ROTULO_CAPACIDADE, ROTULO_REGIME } from "@/lib/rotulos";
import { custoHora, fixosPorBalde, type Balde, type CanalVenda, type LinhaCustoFixo, type ModoCapacidade, type Negocio as DadosNegocio, type Regime } from "@/lib/precificacao";

type Estado = { negocio: DadosNegocio; custosFixos: LinhaCustoFixo[]; canais: CanalVenda[] };

const BALDES: Balde[] = ["produto", "servico", "ambos"];
const MODOS: ModoCapacidade[] = ["unidades", "horas", "ambos"];
const REGIMES: Regime[] = ["mei", "simples", "presumido"];

/** O DAS do MEI em setembro de 2026 para comércio e indústria. Ponto de partida, editável. */
const DAS_MEI = 81;

function chaveNova() {
  return `nova-${Math.random().toString(36).slice(2, 9)}`;
}

export function Negocio() {
  const { status, erro: erroStatus } = useStatus();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    fetch("/api/negocio")
      .then(async (r) => {
        if (!r.ok) throw r;
        const dados = await r.json();
        if (dados.negocio) {
          setEstado(dados);
        } else {
          // Sem negócio ainda: o PUT cria com os canais semente e devolve o que desenhar.
          const criado = await fetch("/api/negocio", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
          if (!criado.ok) throw criado;
          setEstado(await criado.json());
        }
      })
      .catch(async (e) => setErro((await lerErro(e)).mensagem));
  }, []);

  async function salvar() {
    if (!estado) return;
    setSalvando(true);
    setErro(null);
    setSalvo(false);
    try {
      const r = await fetch("/api/negocio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          negocio: estado.negocio,
          custosFixos: estado.custosFixos.map((l) => ({ ...l, id: l.id.startsWith("nova-") ? undefined : l.id })),
          canais: estado.canais.map((c) => ({ ...c, id: c.id.startsWith("nova-") ? undefined : c.id })),
        }),
      });
      if (!r.ok) throw r;
      setEstado(await r.json());
      setSalvo(true);
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    } finally {
      setSalvando(false);
    }
  }

  if (!estado) {
    return (
      <>
        <Topbar marca="P" nome="Precificador" area="Financeiro" status={status} erro={erroStatus} navegacao={NAVEGACAO} />
        <main className="max-w-[860px] mx-auto px-8 py-10 max-md:px-4">{erro ? <Aviso tom="danger">{erro}</Aviso> : <Loading texto="Abrindo o negócio" />}</main>
      </>
    );
  }

  const { negocio, custosFixos, canais } = estado;
  const mudarNegocio = (m: Partial<DadosNegocio>) => setEstado({ ...estado, negocio: { ...negocio, ...m } });
  const fixos = fixosPorBalde(negocio, custosFixos);
  const hora = custoHora(negocio, custosFixos);
  const semVolume = negocio.modoCapacidade !== "horas" && negocio.volumeMensalUnidades <= 0;
  const semHoras = negocio.horasProdutivasMes <= 0;

  return (
    <>
      <Topbar marca="P" nome="Precificador" area="Financeiro" status={status} erro={erroStatus} usuario={status?.usuario} navegacao={NAVEGACAO} />

      <main className="max-w-[860px] mx-auto px-8 pt-6 pb-16 max-md:px-4 max-md:pt-4">
        <h1 className="titulo-painel">Seu negócio</h1>
        <p className="apoio mt-1 mb-2">Preencha uma vez. É daqui que sai o custo fixo e o imposto de todo item.</p>
        <p className="mb-6">
          <Link className="btn-link" href="/comecar">
            Prefere me contar por escrito? Eu preencho para você
          </Link>
        </p>

        {erro && <Aviso tom="danger">{erro}</Aviso>}

        <div className="flex flex-col gap-6">
          <section className="card p-5">
            <h2 className="section-title">Custos fixos do mês</h2>
            <p className="apoio mb-4">O que você paga todo mês mesmo sem vender nada. Inclua o que sai da conta, não o que entra na receita.</p>

            <div className="flex flex-col gap-2">
              {custosFixos.map((linha) => (
                <div key={linha.id} className="flex items-center gap-2 max-sm:flex-wrap">
                  <input
                    className="input flex-1 min-w-[140px] !py-2"
                    value={linha.nome}
                    placeholder="Aluguel"
                    aria-label="Nome do custo fixo"
                    onChange={(e) => setEstado({ ...estado, custosFixos: custosFixos.map((l) => (l.id === linha.id ? { ...l, nome: e.target.value } : l)) })}
                  />
                  <CampoNumero
                    className="!py-2 w-[130px]"
                    unidade="R$"
                    unidadeAntes
                    valor={linha.valorMensal}
                    rotuloAcessivel="Valor mensal"
                    onValor={(n) => setEstado({ ...estado, custosFixos: custosFixos.map((l) => (l.id === linha.id ? { ...l, valorMensal: n } : l)) })}
                  />
                  <select
                    className="input !w-auto !py-2 text-[13px]"
                    value={linha.balde}
                    aria-label="Onde este custo é absorvido"
                    onChange={(e) => setEstado({ ...estado, custosFixos: custosFixos.map((l) => (l.id === linha.id ? { ...l, balde: e.target.value as Balde } : l)) })}
                  >
                    {BALDES.map((b) => (
                      <option key={b} value={b}>
                        {ROTULO_BALDE[b]}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn-link text-muted hover:text-danger shrink-0" onClick={() => setEstado({ ...estado, custosFixos: custosFixos.filter((l) => l.id !== linha.id) })} aria-label={`Remover ${linha.nome || "custo"}`}>
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 mt-4">
              <button type="button" className="btn-ghost" onClick={() => setEstado({ ...estado, custosFixos: [...custosFixos, { id: chaveNova(), negocioId: negocio.id, nome: "", valorMensal: 0, balde: "ambos" }] })}>
                Adicionar custo fixo
              </button>
              <span className="cifra self-center text-[13px] text-muted">
                {moeda(fixos.total)} por mês · {moeda(fixos.produto)} em produtos, {moeda(fixos.servico)} em serviços
              </span>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="section-title">Quanto você consegue produzir</h2>
            <div className="flex flex-col gap-4">
              <Campo rotulo="Você mede sua capacidade em" para="modo">
                <select id="modo" className="input" value={negocio.modoCapacidade} onChange={(e) => mudarNegocio({ modoCapacidade: e.target.value as ModoCapacidade })}>
                  {MODOS.map((m) => (
                    <option key={m} value={m}>
                      {ROTULO_CAPACIDADE[m]}
                    </option>
                  ))}
                </select>
              </Campo>

              {/* As horas aparecem em qualquer modo, e não só em "horas": é delas que sai o custo da
                  sua hora, que todo item com tempo de execução usa — inclusive um produto. O modo
                  de capacidade decide quem rateia o custo FIXO, não quem paga a mão de obra. */}
              <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
                {negocio.modoCapacidade !== "horas" && (
                  <Campo rotulo="Unidades por mês" para="volume" ajuda="Quantas peças você vende num mês normal.">
                    <CampoNumero id="volume" unidade="un" casas={0} valor={negocio.volumeMensalUnidades} onValor={(n) => mudarNegocio({ volumeMensalUnidades: n })} />
                  </Campo>
                )}
                <Campo rotulo="Horas produtivas por mês" para="horas" ajuda="Só as horas que viram trabalho cobrado. É daqui que sai o custo da sua hora.">
                  <CampoNumero id="horas" unidade="h" casas={0} valor={negocio.horasProdutivasMes} onValor={(n) => mudarNegocio({ horasProdutivasMes: n })} />
                </Campo>
              </div>

              {negocio.modoCapacidade === "ambos" && (
                <Campo rotulo="Do que é dos dois, quanto vai para produtos" para="proporcao" ajuda="O resto é absorvido pelos serviços.">
                  <CampoPercentual id="proporcao" valor={negocio.proporcaoProdutoPct} onValor={(f) => mudarNegocio({ proporcaoProdutoPct: f })} />
                </Campo>
              )}

              {semVolume && <Aviso tom="warn">Sem as unidades por mês, o custo fixo não é rateado e todo produto parece mais barato do que é.</Aviso>}
              {semHoras && <Aviso tom="warn">Sem as horas produtivas, sua hora custa zero e o tempo de execução dos itens não entra no preço.</Aviso>}

              <Campo rotulo="Quanto você quer tirar por mês" para="prolabore" ajuda="Entra como custo fixo, não como sobra: é o seu salário.">
                <CampoNumero id="prolabore" unidade="R$" unidadeAntes casas={0} valor={negocio.proLaboreMensal} onValor={(n) => mudarNegocio({ proLaboreMensal: n })} />
              </Campo>

              {hora.total > 0 && (
                <div>
                  <p className="text-[15px] text-ink">
                    Sua hora custa <strong className="cifra">{moeda(hora.total)}</strong>.
                  </p>
                  <PorQue>
                    ({moeda(fixos.servico)} de custo fixo de serviço + {moeda(negocio.proLaboreMensal)} de pró-labore) ÷ {numero(negocio.horasProdutivasMes)} horas = {moeda(hora.total)} por hora
                  </PorQue>
                </div>
              )}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="section-title">Como você paga imposto</h2>
            <div className="flex flex-col gap-4">
              <Campo rotulo="Regime" para="regime">
                <select id="regime" className="input" value={negocio.regime} onChange={(e) => mudarNegocio({ regime: e.target.value as Regime })}>
                  {REGIMES.map((r) => (
                    <option key={r} value={r}>
                      {ROTULO_REGIME[r]}
                    </option>
                  ))}
                </select>
              </Campo>

              {negocio.regime === "mei" && (
                <>
                  <Aviso tom="ok">
                    O MEI não paga percentual sobre o faturamento: paga o DAS, um valor fixo por mês. Ele entra como uma linha de custo fixo, não como alíquota.
                  </Aviso>
                  {!custosFixos.some((l) => /das/i.test(l.nome)) && (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setEstado({ ...estado, custosFixos: [...custosFixos, { id: chaveNova(), negocioId: negocio.id, nome: "DAS do MEI", valorMensal: DAS_MEI, balde: "ambos" }] })}
                    >
                      Adicionar o DAS como custo fixo
                    </button>
                  )}
                </>
              )}

              {negocio.regime === "simples" && (
                <>
                  <Campo rotulo="Anexo" para="anexo" ajuda="A alíquota efetiva sobe com o faturamento dos últimos doze meses.">
                    <select
                      id="anexo"
                      className="input"
                      defaultValue=""
                      onChange={(e) => {
                        const anexo = ANEXOS_SIMPLES.find((a) => a.valor === e.target.value);
                        if (anexo) mudarNegocio({ impostoProdutoPct: anexo.aliquota, impostoServicoPct: anexo.aliquota });
                      }}
                    >
                      <option value="">Escolha para sugerir a alíquota</option>
                      {ANEXOS_SIMPLES.map((a) => (
                        <option key={a.valor} value={a.valor}>
                          {a.rotulo} — {percentual(a.aliquota)}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
                    <Campo rotulo="Alíquota efetiva em produtos" para="imposto-produto">
                      <CampoPercentual id="imposto-produto" valor={negocio.impostoProdutoPct} onValor={(f) => mudarNegocio({ impostoProdutoPct: f })} />
                    </Campo>
                    <Campo rotulo="Alíquota efetiva em serviços" para="imposto-servico">
                      <CampoPercentual id="imposto-servico" valor={negocio.impostoServicoPct} onValor={(f) => mudarNegocio({ impostoServicoPct: f })} />
                    </Campo>
                  </div>
                  <Aviso tom="warn">Confirme a alíquota com o seu contador antes de fechar preço: a sugestão é a da primeira faixa.</Aviso>
                </>
              )}

              {negocio.regime === "presumido" && (
                <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
                  <Campo rotulo="Soma dos impostos em produtos" para="imposto-produto" ajuda="PIS, COFINS, IRPJ, CSLL e ICMS somados.">
                    <CampoPercentual id="imposto-produto" valor={negocio.impostoProdutoPct} onValor={(f) => mudarNegocio({ impostoProdutoPct: f })} />
                  </Campo>
                  <Campo rotulo="Soma dos impostos em serviços" para="imposto-servico" ajuda="PIS, COFINS, IRPJ, CSLL e ISS somados.">
                    <CampoPercentual id="imposto-servico" valor={negocio.impostoServicoPct} onValor={(f) => mudarNegocio({ impostoServicoPct: f })} />
                  </Campo>
                </div>
              )}

              <Campo rotulo="Margem-alvo padrão" para="margem-padrao" ajuda="Cada item pode ter a sua; esta vale para os que não têm.">
                <CampoPercentual id="margem-padrao" valor={negocio.margemAlvoPadraoPct} onValor={(f) => mudarNegocio({ margemAlvoPadraoPct: f })} />
              </Campo>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="section-title">Onde você vende</h2>
            <p className="apoio mb-4">Cada canal come uma fatia diferente do preço. O canal marcado abre primeiro na bancada.</p>

            <div className="flex flex-col gap-2">
              {canais.map((canal) => (
                <div key={canal.id} className="flex items-center gap-2 max-sm:flex-wrap">
                  <input
                    className="input flex-1 min-w-[120px] !py-2"
                    value={canal.nome}
                    placeholder="Loja"
                    aria-label="Nome do canal"
                    onChange={(e) => setEstado({ ...estado, canais: canais.map((c) => (c.id === canal.id ? { ...c, nome: e.target.value } : c)) })}
                  />
                  <CampoNumero
                    className="!py-2 w-[100px]"
                    unidade="%"
                    valor={canal.taxaPct * 100}
                    rotuloAcessivel="Taxa em percentual"
                    onValor={(n) => setEstado({ ...estado, canais: canais.map((c) => (c.id === canal.id ? { ...c, taxaPct: n / 100 } : c)) })}
                  />
                  <CampoNumero
                    className="!py-2 w-[110px]"
                    unidade="R$"
                    unidadeAntes
                    valor={canal.taxaFixa}
                    rotuloAcessivel="Taxa fixa por transação"
                    onValor={(n) => setEstado({ ...estado, canais: canais.map((c) => (c.id === canal.id ? { ...c, taxaFixa: n } : c)) })}
                  />
                  <label className="flex items-center gap-1.5 text-[13px] shrink-0 cursor-pointer">
                    <input type="radio" name="canal-padrao" checked={canal.padrao} onChange={() => setEstado({ ...estado, canais: canais.map((c) => ({ ...c, padrao: c.id === canal.id })) })} />
                    principal
                  </label>
                  <button type="button" className="btn-link text-muted hover:text-danger shrink-0" onClick={() => setEstado({ ...estado, canais: canais.filter((c) => c.id !== canal.id) })} aria-label={`Remover ${canal.nome || "canal"}`}>
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn-ghost mt-4"
              onClick={() => setEstado({ ...estado, canais: [...canais, { id: chaveNova(), negocioId: negocio.id, nome: "", taxaPct: 0, taxaFixa: 0, padrao: false }] })}
            >
              Adicionar canal
            </button>
          </section>

          <div className="flex items-center gap-4 flex-wrap">
            <button type="button" className="btn-primary !w-auto" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar o negócio"}
            </button>
            {salvo && <span className="text-[13px] text-ok font-semibold">Salvo. Os preços da carteira já refletem isso.</span>}
            <Link className="btn-link" href="/">
              Ver os itens
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

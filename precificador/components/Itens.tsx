"use client";
// A carteira: todos os itens no canal padrão, pior margem primeiro quando você pede.
// É a tela que responde "estou tendo prejuízo em algum item e não sei em qual".
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CampoPercentual, Estampa } from "./campos";
import { Aviso, DataTable, Empty, Loading, Topbar, lerErro, useConfirmacao, useStatus, type Coluna } from "./ui";
import { moeda, percentual } from "@/lib/formato";
import { navegacaoComVermelho } from "@/lib/navegacao";
import { ROTULO_ESTADO } from "@/lib/rotulos";
import type { AlvoSimulacao, Carteira, ItemAfetado, LinhaCarteira } from "@/lib/carteira";
import type { DiagnosticoMix } from "@/lib/types";

type Dados = Carteira & { configurado: boolean; temExemplos: boolean };
type Exemplo = { id: string; rotulo: string; descricao: string };
type Ordem = "cadastro" | "pior-margem";

const COLUNAS: Coluna<LinhaCarteira>[] = [
  { chave: "nome", titulo: "Item", papel: "titulo", render: (l) => l.item.nome },
  { chave: "canal", titulo: "Canal", papel: "detalhe", render: (l) => l.canal.nome },
  { chave: "preco", titulo: "Preço", papel: "resumo", render: (l) => <span className="cifra font-semibold">{moeda(l.preco)}</span> },
  { chave: "custo", titulo: "Custo", papel: "detalhe", render: (l) => <span className="cifra">{moeda(l.custo.total)}</span> },
  {
    chave: "margem",
    titulo: "Margem real",
    papel: "resumo",
    render: (l) => (
      <span className="cifra font-semibold" style={{ color: l.estado === "prejuizo" ? "var(--estado-prejuizo)" : undefined }}>
        {percentual(l.derivados.margemLiquidaPct)}
      </span>
    ),
  },
  { chave: "alvo", titulo: "Alvo", papel: "detalhe", render: (l) => <span className="cifra">{percentual(l.margemAlvoPct)}</span> },
  { chave: "participacao", titulo: "Participação", papel: "detalhe", render: (l) => <span className="cifra">{percentual(l.participacao, 0)}</span> },
  { chave: "estado", titulo: "Situação", papel: "chip", render: (l) => <Estampa estado={l.estado} /> },
];

export function Itens() {
  const { status, erro: erroStatus } = useStatus();
  const router = useRouter();
  const { confirmar, Dialogo } = useConfirmacao();

  const [dados, setDados] = useState<Dados | null>(null);
  const [exemplos, setExemplos] = useState<Exemplo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ordem, setOrdem] = useState<Ordem>("cadastro");
  const [soVermelho, setSoVermelho] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoMix | null>(null);
  const [diagnosticando, setDiagnosticando] = useState(false);
  const [simulando, setSimulando] = useState(false);
  const [alvoSimulacao, setAlvoSimulacao] = useState<AlvoSimulacao>("custo-fixo");
  const [aumento, setAumento] = useState(0.2);
  const [afetados, setAfetados] = useState<ItemAfetado[] | null>(null);

  useEffect(() => {
    Promise.all([fetch("/api/itens"), fetch("/api/exemplos")])
      .then(async ([rItens, rExemplos]) => {
        if (!rItens.ok) throw rItens;
        setDados(await rItens.json());
        if (rExemplos.ok) setExemplos((await rExemplos.json()).exemplos);
      })
      .catch(async (e) => setErro((await lerErro(e)).mensagem));
  }, []);

  async function recarregar() {
    const r = await fetch("/api/itens");
    if (r.ok) setDados(await r.json());
  }

  async function carregarExemplo(id: string) {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch("/api/exemplos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!r.ok) throw r;
      await recarregar();
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    } finally {
      setOcupado(false);
    }
  }

  async function apagarExemplos() {
    if (!(await confirmar("Apagar todos os itens de exemplo? O negócio e os canais ficam como estão.", { confirmarRotulo: "Apagar os exemplos" }))) return;
    await fetch("/api/exemplos", { method: "DELETE" });
    await recarregar();
  }

  async function criarItem() {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch("/api/itens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: "Item novo", tipo: "produto" }) });
      if (!r.ok) throw r;
      const { item } = await r.json();
      router.push(`/item/${item.id}`);
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
      setOcupado(false);
    }
  }

  async function pedirDiagnostico() {
    setDiagnosticando(true);
    setErro(null);
    try {
      const r = await fetch("/api/ia/mix", { method: "POST" });
      if (!r.ok) throw r;
      setDiagnostico((await r.json()).diagnostico);
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    } finally {
      setDiagnosticando(false);
    }
  }

  async function rodarSimulacao() {
    setErro(null);
    setAfetados(null);
    try {
      const r = await fetch("/api/simular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aumentoPct: aumento, alvo: alvoSimulacao }) });
      if (!r.ok) throw r;
      setAfetados((await r.json()).afetados);
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    }
  }

  if (!dados) {
    return (
      <>
        <Topbar marca="P" nome="Precificador" area="Financeiro" status={status} erro={erroStatus} />
        <main className="max-w-[1100px] mx-auto px-8 py-10 max-md:px-4">{erro ? <Aviso tom="danger">{erro}</Aviso> : <Loading texto="Abrindo seus itens" />}</main>
      </>
    );
  }

  const visiveis = [...dados.linhas]
    .filter((l) => !soVermelho || l.estado === "prejuizo" || l.estado === "abaixo-do-alvo")
    .sort((a, b) => (ordem === "pior-margem" ? a.derivados.margemLiquidaPct - b.derivados.margemLiquidaPct : 0));

  return (
    <>
      <Topbar marca="P" nome="Precificador" area="Financeiro" status={status} erro={erroStatus} usuario={status?.usuario} navegacao={navegacaoComVermelho(dados.noVermelho)} />
      {Dialogo}

      <main className="max-w-[1100px] mx-auto px-8 pt-6 pb-16 max-md:px-4 max-md:pt-4">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="titulo-painel">Seus itens</h1>
            <p className="apoio mt-1">
              {dados.linhas.length === 0
                ? "Nada cadastrado ainda."
                : dados.noVermelho > 0
                  ? `${dados.noVermelho} ${dados.noVermelho === 1 ? "item está" : "itens estão"} no vermelho e ${dados.abaixoDoAlvo} abaixo do alvo.`
                  : dados.abaixoDoAlvo > 0
                    ? `Nenhum no vermelho; ${dados.abaixoDoAlvo} abaixo da margem-alvo.`
                    : "Todos dentro da margem-alvo."}
            </p>
          </div>
          {dados.linhas.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              {/* Com itens cadastrados, a mesma tela abre no modo assistente: ele consulta a
                  carteira pelas ferramentas do app em vez de propor um preenchimento novo. */}
              <Link className="btn-ghost" href="/comecar">
                Perguntar ao assistente
              </Link>
              <button type="button" className="btn-primary !w-auto" onClick={criarItem} disabled={ocupado}>
                Novo item
              </button>
            </div>
          )}
        </div>

        {erro && <Aviso tom="danger">{erro}</Aviso>}

        {dados.linhas.length === 0 ? (
          <Empty
            titulo="Conte do seu negócio e eu preencho"
            descricao="Em vez de encarar formulário, converse: eu pergunto como você trabalha e devolvo um rascunho com seus custos, seus canais e seus primeiros itens, para você conferir e mudar."
          >
            <div className="flex justify-center mt-4">
              <Link className="btn-primary !w-auto" href="/comecar">
                Conversar e preencher
              </Link>
            </div>

            <p className="apoio text-center mt-6 mb-2">Ou comece por um exemplo pronto e edite depois:</p>
            <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
              {exemplos.map((e) => (
                <button key={e.id} type="button" className="card p-4 text-left cursor-pointer hover:border-accent transition-colors" onClick={() => carregarExemplo(e.id)} disabled={ocupado}>
                  <span className="block text-[15px] font-bold text-ink">{e.rotulo}</span>
                  <span className="block apoio mt-1">{e.descricao}</span>
                </button>
              ))}
            </div>

            <div className="text-center mt-5">
              <button type="button" className="btn-link" onClick={criarItem} disabled={ocupado}>
                Criar um item do zero
              </button>
            </div>
          </Empty>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <button type="button" className="btn-ghost" onClick={() => setOrdem(ordem === "pior-margem" ? "cadastro" : "pior-margem")} aria-pressed={ordem === "pior-margem"}>
                {ordem === "pior-margem" ? "Ordem de cadastro" : "Pior margem primeiro"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setSoVermelho(!soVermelho)} aria-pressed={soVermelho}>
                {soVermelho ? "Mostrar todos" : "Só os fora do alvo"}
              </button>
              <button type="button" className="btn-ghost" onClick={pedirDiagnostico} disabled={diagnosticando}>
                {diagnosticando ? "Lendo a carteira…" : "Diagnosticar o mix"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setSimulando(!simulando)} aria-expanded={simulando}>
                {simulando ? "Fechar a simulação" : "E se o custo subir?"}
              </button>
              <div className="flex-1" />
              <a className="btn-link text-[13px]" href="/api/exportar?formato=csv">
                Baixar planilha
              </a>
              <a className="btn-link text-[13px]" href="/api/exportar">
                Baixar os dados
              </a>
              {dados.temExemplos && (
                <button type="button" className="btn-link text-[13px] text-muted hover:text-danger" onClick={apagarExemplos}>
                  Apagar os exemplos
                </button>
              )}
            </div>

            {simulando && (
              <div className="card p-5 mb-6">
                <h2 className="section-title">E se o custo subir?</h2>
                <p className="apoio mb-4">Mantém os preços como estão e mostra quem cai abaixo da margem-alvo. Não altera nada.</p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="alvo-simulacao" className="text-[13px] font-semibold text-ink">
                      O que sobe
                    </label>
                    <select id="alvo-simulacao" className="input !w-auto" value={alvoSimulacao} onChange={(e) => setAlvoSimulacao(e.target.value as AlvoSimulacao)}>
                      <option value="custo-fixo">O custo fixo do mês</option>
                      <option value="insumo">O preço dos insumos</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="aumento" className="text-[13px] font-semibold text-ink">
                      Quanto sobe
                    </label>
                    <CampoPercentual id="aumento" valor={aumento} onValor={setAumento} />
                  </div>
                  <button type="button" className="btn-ghost shrink-0" onClick={rodarSimulacao} disabled={aumento <= 0}>
                    Ver quem sai do alvo
                  </button>
                </div>

                {afetados && <ResultadoSimulacao afetados={afetados} />}
              </div>
            )}

            {diagnostico && (
              <div className="reveal card p-5 mb-6">
                <h2 className="section-title">O que a carteira está dizendo</h2>
                <p className="text-[15px] leading-[1.6] text-ink">{diagnostico.resumo}</p>
                {diagnostico.prioridades.length > 0 && (
                  <ul className="mt-4 flex flex-col gap-3">
                    {diagnostico.prioridades.map((p, i) => (
                      <li key={i}>
                        <strong className="text-[14px] text-ink">{p.item}</strong>
                        <p className="text-[13px] text-ink-2">{p.observacao}</p>
                        <p className="text-[13px] text-accent-ink font-semibold">{p.acao}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {diagnostico.ponto_forte && <p className="apoio mt-4">{diagnostico.ponto_forte}</p>}
              </div>
            )}

            {visiveis.length === 0 ? (
              <p className="apoio">Nenhum item fora do alvo. {ROTULO_ESTADO.saudavel} em todos.</p>
            ) : (
              <DataTable colunas={COLUNAS} linhas={visiveis} link={(l) => `/item/${l.item.id}`} />
            )}
          </>
        )}
      </main>
    </>
  );
}

/**
 * O que a simulação mostra. Quem **saiu do alvo** vem primeiro e é o que a frase de cima conta —
 * os demais mudaram de margem mas continuam onde estavam, e essa diferença é o ponto da tela.
 */
function ResultadoSimulacao({ afetados }: { afetados: ItemAfetado[] }) {
  const sairam = afetados.filter((a) => a.estadoDepois !== a.estadoAntes);
  const soMargem = afetados.filter((a) => a.estadoDepois === a.estadoAntes);

  if (afetados.length === 0) {
    return <p className="reveal mt-4 text-[14px] text-ok font-semibold">Nenhum item muda de margem com esse aumento.</p>;
  }

  return (
    <div className="reveal mt-4">
      <p className="text-[14px] font-semibold mb-2">
        {sairam.length === 0
          ? "Nenhum item muda de situação, mas a margem cai nos que estão abaixo."
          : `${sairam.length} ${sairam.length === 1 ? "item sai" : "itens saem"} da situação de hoje.`}
      </p>

      {sairam.length > 0 && <LinhasSimuladas linhas={sairam} />}

      {soMargem.length > 0 && (
        <details className="porque mt-3">
          <summary>
            ver {soMargem.length} {soMargem.length === 1 ? "item que só perde margem" : "itens que só perdem margem"}
          </summary>
          <div className="mt-2">
            <LinhasSimuladas linhas={soMargem} />
          </div>
        </details>
      )}
    </div>
  );
}

function LinhasSimuladas({ linhas }: { linhas: ItemAfetado[] }) {
  return (
    <ul className="flex flex-col">
      {linhas.map((a) => (
        <li key={a.item.id} className="flex items-center justify-between gap-3 flex-wrap py-2 border-b border-line last:border-b-0">
          <span className="text-[14px] font-semibold text-ink">{a.item.nome}</span>
          <span className="text-[13px] text-ink-2">
            <span className="cifra">{percentual(a.margemAntes)}</span> passa a <span className="cifra font-semibold">{percentual(a.margemDepois)}</span>
          </span>
          <Estampa estado={a.estadoDepois} />
        </li>
      ))}
    </ul>
  );
}

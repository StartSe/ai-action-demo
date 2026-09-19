"use client";
// Relatórios (US-026): o processo por vaga e por período, para mostrar à liderança se a triagem por
// IA está funcionando.
//
// Nasceu na US-001 como destino do cabeçalho com um estado vazio; o título e o texto de apoio são os
// mesmos de lá, de propósito. Continua sendo o único lugar de onde se chega ao Histórico — que saiu
// da navegação naquela história e passou a se chamar "Relatórios anteriores".
//
// Nenhuma chamada de IA nasce aqui: todos os números são soma sobre o que já está gravado
// (`lib/relatorios.ts`), como no Início. O desenho está em `components/ConteudoRelatorio.tsx`, que é
// o mesmo componente da impressão e do relatório salvo.
import Link from "next/link";
import { useEffect, useState } from "react";
import { AvisoExemplo } from "@/components/AvisoExemplo";
import { ConteudoRelatorio } from "@/components/ConteudoRelatorio";
import { Aviso, CopyButton, Empty, ErrorBox, Topbar, lerErro, useStatus, type ErroLido } from "@/components/ui";
import { relatorioParaTexto } from "@/lib/relatorio-texto";
import type { Relatorio } from "@/lib/relatorios";

const PERIODOS: { valor: string; rotulo: string }[] = [
  { valor: "7", rotulo: "Últimos 7 dias" },
  { valor: "30", rotulo: "Últimos 30 dias" },
  { valor: "90", rotulo: "Últimos 90 dias" },
  { valor: "personalizado", rotulo: "Escolher as datas" },
];

/** "2026-09-18", no fuso de quem está olhando: é o formato que o campo de data usa e o mesmo que a
 * rota espera de volta. */
function comoTexto(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function IconeRelatorios() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 52h44" />
      <path d="M18 52V34M31 52V18M44 52V26" />
    </svg>
  );
}

export default function Page() {
  const { status, erro } = useStatus();

  const [resultado, setResultado] = useState<{ consulta: string; dados: Relatorio } | null>(null);
  const [falhaConsulta, setFalhaConsulta] = useState<{ consulta: string; erro: ErroLido } | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [vagas, setVagas] = useState<{ id: string; cargo: string }[]>([]);
  const [vagaId, setVagaId] = useState("");
  const [periodo, setPeriodo] = useState("30");
  const [de, setDe] = useState(() => comoTexto(new Date(Date.now() - 30 * 86_400_000)));
  const [ate, setAte] = useState(() => comoTexto(new Date()));
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);
  const [salvando, setSalvando] = useState(false);
  // O aviso de "guardado" carrega o recorte em que ele foi guardado: trocar a vaga ou o período o
  // faz sumir sozinho, sem um `setState` dentro do efeito de leitura (que a regra
  // `react-hooks/set-state-in-effect` acusa) — e sem prometer que o relatório NOVO já está salvo.
  const [salvo, setSalvo] = useState<{ id: string; consulta: string } | null>(null);

  // Os mesmos parâmetros servem à leitura da tela, à planilha e à impressão: um só lugar decide o
  // recorte (`periodoDoPedido`, lib/relatorios.ts), e as três saídas mostram sempre a mesma coisa.
  const busca = new URLSearchParams();
  if (vagaId) busca.set("vagaId", vagaId);
  if (periodo === "personalizado") {
    busca.set("de", de);
    busca.set("ate", ate);
  } else {
    busca.set("dias", periodo);
  }
  const consulta = busca.toString();
  const relatorio = resultado?.consulta === consulta ? resultado.dados : null;
  const erroConsulta = falhaConsulta?.consulta === consulta ? falhaConsulta.erro : null;

  // A leitura vai em corrente, e não `await`: a regra `react-hooks/set-state-in-effect` acusa
  // qualquer função que mexa em estado chamada no corpo de um efeito, mesmo assíncrona.
  useEffect(() => {
    let ativo = true;
    const controller = new AbortController();
    fetch(`/api/relatorios?${consulta}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo: Relatorio) => {
        if (ativo) { setResultado({ consulta, dados: corpo }); setFalhaConsulta(null); }
      })
      .catch(async (e) => {
        if (!ativo) return;
        const erro = await lerErro(e);
        if (ativo) setFalhaConsulta({ consulta, erro });
      });
    return () => { ativo = false; controller.abort(); };
  }, [consulta, tentativa]);

  useEffect(() => {
    fetch("/api/vagas")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo) => setVagas(corpo.itens.map((v: { id: string; cargo: string }) => ({ id: v.id, cargo: v.cargo }))))
      .catch(() => setVagas([]));
  }, []);

  async function salvar() {
    if (!relatorio) return;
    setSalvando(true);
    setErroTela(null);
    try {
      const corpo: Record<string, string> = {};
      busca.forEach((valor, chave) => (corpo[chave] = valor));
      const r = await fetch("/api/relatorios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!r.ok) throw r;
      const { id } = (await r.json()) as { id: string };
      setSalvo({ id, consulta });
    } catch (e) {
      setErroTela(await lerErro(e));
    } finally {
      setSalvando(false);
    }
  }

  const vazio = relatorio !== null && relatorio.totalGeral === 0;

  return (
    <>
      <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[1100px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <div className="flex items-start justify-between gap-5 flex-wrap mb-7">
          <div>
            <h1 className="titulo-painel mb-1.5">Relatórios</h1>
            <p className="apoio">Acompanhe a evolução das entrevistas e os resultados de cada etapa.</p>
          </div>
          {relatorio && !vazio && <div className="flex items-center gap-2 ml-auto no-print">
            <a className="btn-primary !w-auto" href={`/api/relatorios/exportar?${consulta}`} download>
              <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></svg>
              Baixar relatório
            </a>
            <details className="relative">
              <summary className="btn-ghost !p-3 list-none [&::-webkit-details-marker]:hidden" aria-label="Mais opções do relatório" title="Mais opções">
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
              </summary>
              <div className="absolute right-0 top-full z-20 mt-2 card p-3 w-64 flex flex-col gap-2 shadow-lg">
                <a className="btn-ghost" href={`/imprimir/relatorio?${consulta}`} target="_blank" rel="noreferrer">Imprimir / salvar PDF</a>
                <CopyButton texto={() => relatorioParaTexto(relatorio)} />
                <button type="button" className="btn-ghost" onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando..." : "Salvar no histórico"}</button>
              </div>
            </details>
          </div>}
        </div>

        {erroTela && <div className="mb-5"><ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao} /></div>}

            <div className="flex items-end gap-3 mb-5 flex-wrap no-print">
              <div className="flex flex-col gap-1.5 min-w-[220px]">
                <label htmlFor="filtro-vaga" className="text-[13px] font-semibold">Vaga</label>
                <select id="filtro-vaga" className="input" value={vagaId} onChange={(e) => setVagaId(e.target.value)}>
                  <option value="">Todas as vagas</option>
                  {vagas.map((v) => (
                    <option key={v.id} value={v.id}>{v.cargo}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 min-w-[180px]">
                <label htmlFor="filtro-periodo" className="text-[13px] font-semibold">Período</label>
                <select id="filtro-periodo" className="input" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
                  {PERIODOS.map((p) => (
                    <option key={p.valor} value={p.valor}>{p.rotulo}</option>
                  ))}
                </select>
              </div>
              {periodo === "personalizado" && (
                <>
                  <div className="flex flex-col gap-1.5 min-w-[150px]">
                    <label htmlFor="filtro-de" className="text-[13px] font-semibold">De</label>
                    <input id="filtro-de" type="date" className="input" value={de} max={ate} onChange={(e) => setDe(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5 min-w-[150px]">
                    <label htmlFor="filtro-ate" className="text-[13px] font-semibold">Até</label>
                    <input id="filtro-ate" type="date" className="input" value={ate} min={de} onChange={(e) => setAte(e.target.value)} />
                  </div>
                </>
              )}
            </div>


        {erroConsulta ? (
          <div className="card p-5"><ErrorBox mensagem={erroConsulta.mensagem} acao={erroConsulta.acao} /><button className="btn-ghost mt-3" onClick={() => { setFalhaConsulta(null); setTentativa((n) => n + 1); }}>Tentar novamente</button></div>
        ) : relatorio === null ? (
          <p role="status" className="text-muted text-sm">Atualizando métricas deste período...</p>
        ) : vazio ? (
          <Empty
            ilustracao={<IconeRelatorios />}
            titulo="Nada para medir ainda"
            descricao="Assim que você convidar o primeiro candidato, este é o lugar de acompanhar quantos responderam, em quanto tempo e o que saiu de cada conversa."
            acaoSecundaria={{ rotulo: "Escolher vaga e gerar convite", url: "/vagas" }}
          />
        ) : (
          <>



            {salvo?.consulta === consulta && (
              <div className="mb-5 no-print">
                <Aviso tom="ok" acao={{ rotulo: "Abrir", url: `/r/${salvo.id}` }}>
                  Relatório guardado. Ele fica em Relatórios anteriores com os números deste período, para você comparar depois.
                </Aviso>
              </div>
            )}

            {relatorio.exemplo && (
              <AvisoExemplo>
                Os números abaixo são de entrevistas de exemplo, para você ver a tela cheia; eles somem quando você cadastrar os seus.
              </AvisoExemplo>
            )}

            <ConteudoRelatorio relatorio={relatorio} />
          </>
        )}

        <p className="text-muted text-[13px] mt-6 no-print">
          Tudo o que você já gerou continua em <Link href="/historico" className="btn-link">Relatórios anteriores</Link>.
        </p>
      </main>
    </>
  );
}

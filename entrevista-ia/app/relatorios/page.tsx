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

  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
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

  // A leitura vai em corrente, e não `await`: a regra `react-hooks/set-state-in-effect` acusa
  // qualquer função que mexa em estado chamada no corpo de um efeito, mesmo assíncrona.
  useEffect(() => {
    fetch(`/api/relatorios?${consulta}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo: Relatorio) => setRelatorio(corpo))
      .catch(async (e) => setErroTela(await lerErro(e)));
  }, [consulta]);

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
        <h1 className="titulo-painel mb-1.5">Relatórios</h1>
        <p className="apoio mb-6">Quantos convites viram entrevista e quanto tempo isso leva.</p>

        {erroTela && <div className="mb-5"><ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao} /></div>}

        {relatorio === null ? (
          <p className="text-muted text-sm">Carregando...</p>
        ) : vazio ? (
          <Empty
            ilustracao={<IconeRelatorios />}
            titulo="Nada para medir ainda"
            descricao="Assim que você convidar o primeiro candidato, este é o lugar de acompanhar quantos responderam, em quanto tempo e o que saiu de cada conversa."
            acaoSecundaria={{ rotulo: "Abrir os relatórios anteriores", url: "/historico" }}
          />
        ) : (
          <>
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

            <div className="flex items-center gap-2.5 mb-5 flex-wrap no-print max-md:[&>*]:flex-1">
              <a className="btn-ghost" href={`/api/relatorios/exportar?${consulta}`} download>Exportar planilha</a>
              <a className="btn-ghost" href={`/imprimir/relatorio?${consulta}`} target="_blank" rel="noreferrer">Imprimir</a>
              <CopyButton texto={() => relatorioParaTexto(relatorio)} />
              <button type="button" className="btn-ghost" onClick={() => void salvar()} disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar este relatório"}
              </button>
            </div>

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

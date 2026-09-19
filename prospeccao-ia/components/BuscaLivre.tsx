"use client";
// Campo único "O que você quer encontrar?" (US-038), na tela de Início: a frase (ou um dos quatro
// exemplos) vira modo + critérios já preenchidos para o produto e o ICP escolhidos (o padrão, quando só
// há um de cada — os seletores só aparecem quando existe mais de uma opção). O resultado nunca dispara
// a busca sozinho: aparece para confirmação em uma linha, com "Ajustar critérios" antes de executar.
//
// Os quatro exemplos NUNCA chamam a IA: `usarExemplo` resolve modo + critérios com um mapeamento fixo
// no próprio cliente (`EXEMPLOS`), reaproveitando `criteriosIniciais` (o mesmo padrão do passo 4 do
// assistente) — é o que os faz funcionar mesmo sem IA conectada. Só o texto livre chama
// `POST /api/prospeccoes/interpretar` (lib/interpretacao.ts), e só quando a IA está conectada; sem ela,
// a tela avisa antes de tentar.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso, lerErro, useStatus } from "@/components/ui";
import { criteriosIniciais, type CriteriosBusca } from "@/components/CriteriosProspeccao";
import { ROTULO_ACAO_MODO } from "@/lib/rotulos";
import type { ICP, Jornada, ModoProspeccao, Produto } from "@/lib/types";

type ProdutoComICPs = Produto & { icps: ICP[] };
type Resultado = { modo: ModoProspeccao; criterios: CriteriosBusca; resumo: string };

type ExemploBusca = { texto: string; modo: ModoProspeccao; camposFixos?: Partial<CriteriosBusca> };

const MODOS_POR_JORNADA: Record<Jornada, ModoProspeccao[]> = {
  b2b: ["empresas", "pessoas", "empresa_unica", "oportunidades"],
  b2c: ["pessoas", "oportunidades"],
};

// Sem equivalente do modo em B2C (empresas/empresa_unica pressupõem uma empresa como unidade), cai em
// "pessoas" — o único conceito que faz sentido nas duas jornadas além de "oportunidades".
function modoDisponivel(modo: ModoProspeccao, jornada: Jornada): ModoProspeccao {
  return MODOS_POR_JORNADA[jornada].includes(modo) ? modo : "pessoas";
}

const EXEMPLOS: ExemploBusca[] = [
  { texto: "Quem devo procurar dentro da <empresa> para vender <produto>?", modo: "empresa_unica" },
  { texto: "Empresas parecidas com meus melhores clientes", modo: "empresas" },
  { texto: "Pessoas com o cargo certo para o meu produto", modo: "pessoas" },
  { texto: "Empresas com sinal recente de que é hora de comprar", modo: "oportunidades", camposFixos: { somenteRecentes: true } },
];

// Mesma frase usada por lib/interpretacao.ts (duplicada de propósito: aquele arquivo é server-only e
// este é "use client" — ver a nota do Codebase Patterns sobre esse tipo de fronteira).
function fraseModo(modo: ModoProspeccao, criterios: CriteriosBusca, jornada: Jornada): string {
  switch (modo) {
    case "empresas":
      return `empresas${criterios.segmento ? ` de ${criterios.segmento}` : ""}${criterios.localizacao ? ` em ${criterios.localizacao}` : ""}`;
    case "pessoas":
      return jornada === "b2b"
        ? `pessoas${criterios.cargo ? ` no cargo de ${criterios.cargo}` : ""}${criterios.localizacao ? ` em ${criterios.localizacao}` : ""}`
        : `pessoas${criterios.ocupacao ? ` que atuam como ${criterios.ocupacao}` : ""}${criterios.localizacao ? ` em ${criterios.localizacao}` : ""}`;
    case "empresa_unica":
      return `a empresa ${criterios.empresaNome}`;
    case "oportunidades":
      return `oportunidades${criterios.recorte ? ` em ${criterios.recorte}` : ""}`;
  }
}

function linkAssistente(produtoId: string, icpId: string, modo: ModoProspeccao, criterios: CriteriosBusca): string {
  const params = new URLSearchParams({ produtoId, icpId, modo, passo: "4", criterios: JSON.stringify(criterios) });
  return `/prospeccoes/nova?${params}`;
}

export function BuscaLivre() {
  const { status } = useStatus();
  const router = useRouter();
  const [produtos, setProdutos] = useState<ProdutoComICPs[] | null>(null);
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [icpId, setIcpId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [interpretando, setInterpretando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    fetch("/api/produtos")
      .then((r) => r.json())
      .then((r) => setProdutos(r.itens))
      .catch(() => setProdutos([]));
  }, []);

  const produtoSelecionado = produtos?.find((p) => p.id === produtoId) ?? produtos?.[0] ?? null;
  const icpsDoProduto = produtoSelecionado?.icps ?? [];
  const padraoIcp = icpsDoProduto.length > 0 ? icpsDoProduto.reduce((a, b) => (a.criadoEm <= b.criadoEm ? a : b)) : null;
  const icpEfetivo = icpsDoProduto.find((i) => i.id === icpId) ?? padraoIcp;

  if (produtos === null || produtos.length === 0 || !produtoSelecionado || !icpEfetivo) return null;

  function irParaResultado(modo: ModoProspeccao, criterios: CriteriosBusca, resumo: string | null) {
    if (!resumo) {
      router.push(linkAssistente(produtoSelecionado!.id, icpEfetivo!.id, modo, criterios));
      return;
    }
    setResultado({ modo, criterios, resumo });
  }

  function usarExemplo(exemplo: ExemploBusca) {
    setErro(null);
    setResultado(null);
    const modo = modoDisponivel(exemplo.modo, icpEfetivo!.jornada);
    const criterios: CriteriosBusca = { ...criteriosIniciais(icpEfetivo!, modo, icpEfetivo!.jornada), ...exemplo.camposFixos };
    if (modo === "empresa_unica" && !criterios.empresaNome.trim()) {
      irParaResultado(modo, criterios, null);
      return;
    }
    irParaResultado(modo, criterios, `Vou procurar ${fraseModo(modo, criterios, icpEfetivo!.jornada)}, usando o perfil ${icpEfetivo!.nome}.`);
  }

  async function interpretar() {
    const t = texto.trim();
    if (!t || interpretando) return;
    setErro(null);
    setResultado(null);
    if (!status?.ai) {
      setErro("Para interpretar sua frase, é preciso conectar a IA. Use um dos exemplos abaixo ou o passo a passo.");
      return;
    }
    setInterpretando(true);
    try {
      const r = await fetch("/api/prospeccoes/interpretar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: t, produtoId: produtoSelecionado!.id, icpId: icpEfetivo!.id }),
      });
      if (!r.ok) {
        const lido = await lerErro(r);
        setErro(lido.mensagem);
        return;
      }
      const dados: { modo: ModoProspeccao | null; criterios: CriteriosBusca; resumo: string | null } = await r.json();
      if (!dados.modo) {
        router.push(`/prospeccoes/nova?produtoId=${produtoSelecionado!.id}&icpId=${icpEfetivo!.id}&passo=3`);
        return;
      }
      irParaResultado(dados.modo, dados.criterios, dados.resumo);
    } catch (e) {
      const lido = await lerErro(e);
      setErro(lido.mensagem);
    } finally {
      setInterpretando(false);
    }
  }

  async function buscar() {
    if (!resultado || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/prospeccoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId: produtoSelecionado!.id, icpId: icpEfetivo!.id, modo: resultado.modo, criterios: resultado.criterios }),
      });
      if (!r.ok) {
        const lido = await lerErro(r);
        setErro(lido.mensagem);
        setEnviando(false);
        return;
      }
      const prospeccao: { id: string } = await r.json();
      router.push(`/prospeccoes/${prospeccao.id}`);
    } catch (e) {
      const lido = await lerErro(e);
      setErro(lido.mensagem);
      setEnviando(false);
    }
  }

  return (
    <section className="card p-6 mb-8">
      <h2 className="text-[15px] font-bold mb-1">O que você quer encontrar?</h2>
      <p className="text-[13px] text-muted mb-3">Descreva em uma frase; a busca sai pronta com o perfil {icpEfetivo.nome}.</p>

      {(produtos.length > 1 || icpsDoProduto.length > 1) && (
        <div className="flex flex-wrap gap-2 mb-3">
          {produtos.length > 1 && (
            <select className="input !w-auto" value={produtoSelecionado.id} onChange={(e) => { setProdutoId(e.target.value); setIcpId(null); }}>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          )}
          {icpsDoProduto.length > 1 && (
            <select className="input !w-auto" value={icpEfetivo.id} onChange={(e) => setIcpId(e.target.value)}>
              {icpsDoProduto.map((i) => (
                <option key={i.id} value={i.id}>{i.nome}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="flex gap-2 max-md:flex-col">
        <textarea
          className="input min-h-[52px] resize-y flex-1"
          placeholder="Ex.: Empresas de logística no Sul que abriram vaga de operações"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <button type="button" className="btn-primary !w-auto max-md:!w-full" disabled={!texto.trim() || interpretando} onClick={interpretar}>
          {interpretando ? "Entendendo..." : "Buscar"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {EXEMPLOS.map((exemplo) => (
          <button
            key={exemplo.texto}
            type="button"
            className="text-left text-[12.5px] px-3 py-2 rounded-[10px] border border-line bg-bg hover:bg-accent-soft transition-colors cursor-pointer"
            onClick={() => usarExemplo(exemplo)}
          >
            {exemplo.texto}
          </button>
        ))}
      </div>

      {erro && (
        <div className="mt-3">
          <Aviso tom="warn">{erro}</Aviso>
        </div>
      )}

      {resultado && (
        <div className="card bg-bg p-4 mt-3 flex flex-col gap-3">
          <p className="text-[14px] font-medium mb-0">{resultado.resumo}</p>
          <div className="flex gap-4 flex-wrap items-center">
            <button type="button" className="btn-primary !w-auto" disabled={enviando} onClick={buscar}>
              {enviando ? "Buscando..." : ROTULO_ACAO_MODO[resultado.modo]}
            </button>
            <button
              type="button"
              className="btn-link text-[13px]"
              onClick={() => router.push(linkAssistente(produtoSelecionado.id, icpEfetivo.id, resultado.modo, resultado.criterios))}
            >
              Ajustar critérios
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

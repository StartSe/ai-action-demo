// Painel da equipe (US-017): agrega as conversas já analisadas e salvas no histórico, sem chamar IA
// nenhuma (é sempre recalculado a partir de dados que a suíte já tem). Reaproveitado pela rota HTTP
// (app/api/painel-equipe/route.ts) e pela ferramenta MCP painel_equipe (lib/ferramentas.ts).
import { aiEnabled, meta, type Meta } from "./ai";
import { listarPorTipo, salvar } from "./historico";
import { listar as listarParticipantes } from "./participantes";
import { obter as obterCenario } from "./cenarios";
import type { Analise, Conversa, DadosPainel, PainelEquipe, VendedorPainel } from "./types";

const DIA_MS = 24 * 60 * 60 * 1000;
const LIMIAR_TENDENCIA = 0.3;

function media(notas: number[]): number {
  if (notas.length === 0) return 0;
  return Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10;
}

function normalizar(s: string): string {
  return s.trim().toLowerCase();
}

function tendenciaDe(atual: number | null, anterior: number | null): "subindo" | "estavel" | "caindo" {
  if (atual === null || anterior === null) return "estavel";
  const diff = atual - anterior;
  if (diff > LIMIAR_TENDENCIA) return "subindo";
  if (diff < -LIMIAR_TENDENCIA) return "caindo";
  return "estavel";
}

/** Monta o painel a partir do histórico de conversas já salvo; nunca chama IA. */
export function montarPainelEquipe(dias = 30): PainelEquipe {
  const agora = Date.now();
  const inicioJanela = agora - dias * DIA_MS;
  const inicioJanelaAnterior = agora - 2 * dias * DIA_MS;

  const registros = listarPorTipo<Conversa, Analise>("conversa", 1000);

  const daJanela = registros.filter((r) => new Date(r.criadoEm).getTime() >= inicioJanela);
  const daJanelaAnterior = registros.filter((r) => {
    const t = new Date(r.criadoEm).getTime();
    return t >= inicioJanelaAnterior && t < inicioJanela;
  });

  const notaMedia = media(daJanela.map((r) => r.saida.nota));
  const notaMediaAnterior = daJanelaAnterior.length > 0 ? media(daJanelaAnterior.map((r) => r.saida.nota)) : null;

  // Critérios mais fracos da equipe: média por nome de critério (normalizado), só na janela atual.
  const criteriosMapa = new Map<string, { nome: string; notas: number[] }>();
  for (const r of daJanela) {
    for (const c of r.saida.criterios) {
      const chave = normalizar(c.nome);
      const atual = criteriosMapa.get(chave) || { nome: c.nome, notas: [] };
      atual.notas.push(c.nota);
      criteriosMapa.set(chave, atual);
    }
  }
  const criteriosFracos = Array.from(criteriosMapa.values())
    .map((c) => ({ nome: c.nome, notaMedia: media(c.notas) }))
    .sort((a, b) => a.notaMedia - b.notaMedia);

  // Por vendedor: só entram vendedores cadastrados com ao menos 1 conversa na janela atual.
  const vendedores: VendedorPainel[] = [];
  for (const v of listarParticipantes(500)) {
    const doVendedorJanela = daJanela.filter((r) => r.entrada.vendedorId === v.id);
    if (doVendedorJanela.length === 0) continue;
    const doVendedorAnterior = daJanelaAnterior.filter((r) => r.entrada.vendedorId === v.id);

    const criteriosVendedor = new Map<string, number[]>();
    for (const r of doVendedorJanela) {
      for (const c of r.saida.criterios) {
        const chave = normalizar(c.nome);
        const notas = criteriosVendedor.get(chave) || [];
        notas.push(c.nota);
        criteriosVendedor.set(chave, notas);
      }
    }
    let criterioMaisFraco = "-";
    let piorMedia = Infinity;
    for (const [chave, notas] of criteriosVendedor) {
      const m = media(notas);
      if (m < piorMedia) {
        piorMedia = m;
        const original = doVendedorJanela.flatMap((r) => r.saida.criterios).find((c) => normalizar(c.nome) === chave);
        criterioMaisFraco = original?.nome || chave;
      }
    }

    const ordenadas = [...doVendedorJanela].sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
    const notaMediaVendedor = media(doVendedorJanela.map((r) => r.saida.nota));
    const notaMediaVendedorAnterior = doVendedorAnterior.length > 0 ? media(doVendedorAnterior.map((r) => r.saida.nota)) : null;

    vendedores.push({
      vendedorId: v.id,
      nome: v.nome,
      conversas: doVendedorJanela.length,
      notaMedia: notaMediaVendedor,
      tendencia: tendenciaDe(notaMediaVendedor, notaMediaVendedorAnterior),
      variacao: notaMediaVendedorAnterior === null ? null : Math.round((notaMediaVendedor - notaMediaVendedorAnterior) * 10) / 10,
      criterioMaisFraco,
      ultimaConversa: ordenadas[0]?.criadoEm || null,
      conversasRecentes: ordenadas.slice(0, 20).map((r) => ({
        resultadoId: r.id,
        titulo: r.titulo,
        cenario: r.entrada.cenarioId ? obterCenario(r.entrada.cenarioId)?.titulo : undefined,
        nota: r.saida.nota,
        criadoEm: r.criadoEm,
      })),
    });
  }
  vendedores.sort((a, b) => b.notaMedia - a.notaMedia);

  return { dias, notaMedia, notaMediaAnterior, vendedores, criteriosFracos };
}

/** Gera o painel e salva no histórico (tipo "painel"); recalculado a cada clique em "Ver o painel da equipe". */
export function gerarPainelEquipe(dias = 30): { painel: PainelEquipe; meta: Meta; id: string; titulo: string } {
  const painel = montarPainelEquipe(dias);
  const titulo = `Painel da equipe — últimos ${dias} dias`;
  const metaGerada = meta({ demo: !aiEnabled(), insumo: "conversas analisadas da equipe" });
  const dados: DadosPainel = { dias };
  const id = salvar({ tipo: "painel", titulo, entrada: dados, saida: painel, meta: metaGerada });
  return { painel, meta: metaGerada, id, titulo };
}

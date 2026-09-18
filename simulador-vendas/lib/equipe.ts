// A tela de Equipe (US-026): todo mundo que já treinou, mais quem o gestor cadastrou à mão.
//
// Duas coisas diferentes contam como "atividade" de uma pessoa e as duas aparecem aqui:
//   - **treino**: uma sessão de uma simulação (o vendedor abriu o link e conversou com o cliente
//     simulado), avaliada por `lib/avaliacao.ts`;
//   - **conversa real**: uma transcrição de uma conversa que aconteceu com um cliente de verdade,
//     colada ou enviada pelo gestor e analisada por `lib/analise.ts` (D11 do PRD).
//
// A nota média da pessoa soma as duas, porque as duas são a média dos critérios na mesma escala de 0 a
// 10 e a pergunta da tela é sobre a **pessoa**, não sobre um treino. É por isso que ela pode divergir
// da nota da mesma pessoa no painel de um treino (`lib/painel-simulacao.ts`), que é por definição só
// daquele link — a mesma distinção já registrada na US-025 entre "número do participante" e "número
// do treino".
//
// Cálculo puro sobre o que já está gravado: nenhuma chamada de IA nasce nesta tela.
import { listarPorTipo } from "./historico";
import { listar as listarParticipantes, obter as obterParticipante } from "./participantes";
import { persona, rotulo } from "./personas";
import { resumoPorParticipante, sessoesComNotaDe, treinosPorParticipante } from "./sessoes";
import { obter as obterSimulacao } from "./simulacoes";
import type { Analise, Conversa } from "./types";

/** Uma linha da lista de Equipe. */
export type PessoaDaEquipe = {
  id: string;
  nome: string;
  email: string;
  /** Como a pessoa entrou na lista: pelo link do treino, pelo cadastro do gestor ou por Google/Microsoft. */
  origem: string;
  /** Conversas de treino que aconteceram (sem as que ficaram em preparação ou abandonadas). */
  sessoes: number;
  /** Conversas reais analisadas e ligadas a esta pessoa. */
  conversasReais: number;
  /** Quantos treinos diferentes ela já fez. */
  treinos: number;
  /** Treinos + conversas reais que já têm nota. */
  avaliadas: number;
  /** Média das avaliadas, em 0–10; `null` enquanto não houver nenhuma. */
  notaMedia: number | null;
  /** O carimbo mais recente entre treinos e conversas reais; `null` para quem nunca treinou. */
  ultimaAtividade: string | null;
};

/** Um item da linha do tempo do detalhe: um treino ou uma conversa real, no mesmo formato. */
export type ItemDaLinhaDoTempo = {
  tipo: "treino" | "real";
  quando: string;
  titulo: string;
  detalhe: string;
  nota: number | null;
  /** O resultado salvo, quando existe: é o `/r/<id>` que o gestor abre. */
  resultadoId: string | null;
};

type ConversaReal = { id: string; titulo: string; vendedorId?: string; nota: number | null; criadoEm: string };

/**
 * As conversas reais já analisadas, uma vez para a tela toda.
 *
 * A ligação com a pessoa é o `vendedorId` gravado na entrada da análise (`lib/analise.ts`), que é o id
 * do participante desde a US-002 — a migração manteve o mesmo id ao copiar a tabela antiga, então toda
 * análise salva antes dela continua apontando para a pessoa certa.
 */
function conversasReais(limite = 1000): ConversaReal[] {
  return listarPorTipo<Conversa, Analise>("conversa", limite).map((r) => ({
    id: r.id,
    titulo: r.titulo,
    vendedorId: r.entrada?.vendedorId,
    nota: typeof r.saida?.nota === "number" && Number.isFinite(r.saida.nota) ? r.saida.nota : null,
    criadoEm: r.criadoEm,
  }));
}

function maisRecente(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a.localeCompare(b) >= 0 ? a : b;
}

/**
 * A lista de Equipe, de quem está mais ativo para quem nunca treinou.
 *
 * Quem o gestor cadastrou e ainda não treinou fica na lista de propósito: é dela que sai o "Convidar",
 * e uma pessoa sem sessão nenhuma é justamente com quem ele precisa falar.
 */
export function montarEquipe(): PessoaDaEquipe[] {
  const resumo = resumoPorParticipante();
  const treinos = treinosPorParticipante();

  const reaisPorPessoa = new Map<string, { total: number; soma: number; comNota: number; ultima: string | null }>();
  for (const c of conversasReais()) {
    if (!c.vendedorId) continue;
    const atual = reaisPorPessoa.get(c.vendedorId) ?? { total: 0, soma: 0, comNota: 0, ultima: null };
    atual.total += 1;
    if (c.nota !== null) {
      atual.soma += c.nota;
      atual.comNota += 1;
    }
    atual.ultima = maisRecente(atual.ultima, c.criadoEm);
    reaisPorPessoa.set(c.vendedorId, atual);
  }

  const pessoas = listarParticipantes(500).map<PessoaDaEquipe>((p) => {
    const doTreino = resumo[p.id] ?? { sessoes: 0, ultima: null, nota: null, avaliadas: 0 };
    const reais = reaisPorPessoa.get(p.id) ?? { total: 0, soma: 0, comNota: 0, ultima: null };
    const avaliadas = doTreino.avaliadas + reais.comNota;
    const soma = (doTreino.nota ?? 0) * doTreino.avaliadas + reais.soma;

    return {
      id: p.id,
      nome: p.nome.trim() || "Sem nome",
      email: p.email ?? "",
      origem: p.origem,
      sessoes: doTreino.sessoes,
      conversasReais: reais.total,
      treinos: treinos[p.id] ?? 0,
      avaliadas,
      notaMedia: avaliadas > 0 ? Math.round((soma / avaliadas) * 10) / 10 : null,
      ultimaAtividade: maisRecente(doTreino.ultima, reais.ultima),
    };
  });

  return pessoas.sort(
    (a, b) => (b.ultimaAtividade ?? "").localeCompare(a.ultimaAtividade ?? "") || a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** Emoji + nome do tipo de cliente; id que saiu do catálogo vira um rótulo genérico em vez de sumir. */
function rotuloDaPersona(id: string): string {
  const p = persona(id);
  return p ? rotulo(p) : "Cliente";
}

/**
 * A linha do tempo de uma pessoa: treinos e conversas reais na mesma lista, do mais recente para o
 * mais antigo.
 *
 * Uma lista só, e não duas seções lado a lado, porque a pergunta que ela responde é cronológica ("o
 * que aconteceu com esta pessoa desde que ela entrou?"): duas listas obrigariam o gestor a intercalar
 * as datas de cabeça.
 */
export function linhaDoTempoDe(participanteId: string): ItemDaLinhaDoTempo[] {
  const nomesDeTreino = new Map<string, string>();
  const itens: ItemDaLinhaDoTempo[] = [];

  for (const s of sessoesComNotaDe(participanteId)) {
    if (!nomesDeTreino.has(s.simulacaoCodigo)) {
      nomesDeTreino.set(s.simulacaoCodigo, obterSimulacao(s.simulacaoCodigo)?.nome || "Treino apagado");
    }
    itens.push({
      tipo: "treino",
      quando: s.encerradaEm ?? s.criadoEm,
      titulo: nomesDeTreino.get(s.simulacaoCodigo) as string,
      detalhe: rotuloDaPersona(s.personaId),
      nota: s.nota,
      resultadoId: s.resultadoId ?? null,
    });
  }

  for (const c of conversasReais()) {
    if (c.vendedorId !== participanteId) continue;
    itens.push({
      tipo: "real",
      quando: c.criadoEm,
      titulo: c.titulo || "Conversa analisada",
      // O cenário, quando existe, já está no título gravado pela análise ("Conversa de Ana ·
      // Renovação em risco"): repeti-lo aqui escreveria o mesmo nome duas vezes na mesma linha.
      detalhe: "Conversa com cliente real",
      nota: c.nota,
      resultadoId: c.id,
    });
  }

  return itens.sort((a, b) => b.quando.localeCompare(a.quando));
}

/** A pessoa e a linha do tempo dela, para o detalhe; `null` quando o id não existe mais. */
export function detalheDaPessoa(participanteId: string): { pessoa: PessoaDaEquipe; linhaDoTempo: ItemDaLinhaDoTempo[] } | null {
  if (!obterParticipante(participanteId)) return null;
  const pessoa = montarEquipe().find((p) => p.id === participanteId);
  if (!pessoa) return null;
  return { pessoa, linhaDoTempo: linhaDoTempoDe(participanteId) };
}

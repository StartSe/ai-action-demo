// Casca de compatibilidade por cima de lib/participantes.ts (US-002).
//
// "Vendedor" e "participante" viraram a mesma coisa quando o app passou a receber gente que abre um
// link sem nunca ter sido cadastrada. A tabela `vendedores` **não é mais lida**: a migração copiou
// cada linha dela para `participantes` mantendo o mesmo id (então todo `Conversa.vendedorId` já
// gravado no histórico continua apontando para a pessoa certa) e a tabela antiga ficou onde estava,
// sem DROP — a suíte nunca apaga dado de banco existente.
//
// Este arquivo existe para que as telas e rotas anteriores (app/page.tsx, /api/vendedores,
// lib/analise.ts, lib/painel-equipe.ts, lib/crm.ts, lib/envio-analise.ts, lib/rotinas-do-app.ts,
// app/simular/[token]) continuem funcionando sem alteração enquanto o PRD avança. A US-026, que
// reescreve a tela de Equipe em cima de participantes, é quem apaga esta casca.
import { criar as criarParticipante, listar as listarParticipantes, obter as obterParticipante, apagar as apagarParticipante } from "./participantes";
import type { Participante } from "./participantes";
import type { Vendedor } from "./types";

function participanteParaVendedor(p: Participante): Vendedor {
  return { id: p.id, nome: p.nome, email: p.email, equipe: p.equipe, criadoEm: p.criadoEm };
}

export function criar({ nome, email, equipe }: { nome: string; email?: string; equipe?: string }): Vendedor {
  return participanteParaVendedor(criarParticipante({ nome, email, equipe, origem: "cadastro" }));
}

export function listar(limite = 100): Vendedor[] {
  return listarParticipantes(limite).map(participanteParaVendedor);
}

export function obter(id: string): Vendedor | null {
  const p = obterParticipante(id);
  return p ? participanteParaVendedor(p) : null;
}

export function apagar(id: string): void {
  apagarParticipante(id);
}

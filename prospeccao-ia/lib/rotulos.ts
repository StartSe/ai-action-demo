// Rótulos de valores guardados no banco, num Record completo (nunca um ternário na tela):
// somar um valor ao union vira erro de compilação aqui em vez de um rótulo faltando na tela.
import type { DirecaoRegeneracao, Evidencia, EstrategiaAbordagem, Fit, Jornada, ModoProspeccao, MotivoDescarte, Papel, StatusLead } from "./types";

// Ordem fixa de progressão de um lead (US-030, antes só local a app/api/leads/[id]/abordagem/route.ts):
// nunca ande para trás nessa ordem ao promover automaticamente. Reaproveitada pelas abas do funil
// (US-035, components/ProspeccaoAndamento.tsx) — "descartado" fica de fora (indexOf -1), então nenhuma
// aba de progresso mínimo o inclui.
export const ORDEM_STATUS_LEAD: StatusLead[] = ["novo", "pesquisado", "qualificado", "selecionado", "abordado", "respondeu"];

export const ROTULO_JORNADA: Record<Jornada, string> = {
  b2b: "Empresas e decisores",
  b2c: "Pessoas/consumidores",
};

export const DESCRICAO_JORNADA: Record<Jornada, string> = {
  b2b: "Encontre empresas que combinam com seu perfil e as pessoas que decidem por elas.",
  b2c: "Encontre pessoas físicas por localização, interesses e sinais públicos.",
};

// Passo 3 do assistente (US-011): que tipo de busca fazer. Nem todo modo existe nas duas jornadas
// (empresas/empresa_unica são só B2B) — MODOS_POR_JORNADA é quem decide quais cartões aparecem.
export const MODOS_POR_JORNADA: Record<Jornada, ModoProspeccao[]> = {
  b2b: ["empresas", "pessoas", "empresa_unica", "oportunidades"],
  b2c: ["pessoas", "oportunidades"],
};

export const ROTULO_MODO: Record<ModoProspeccao, string> = {
  empresas: "Encontrar empresas",
  pessoas: "Encontrar pessoas",
  empresa_unica: "Explorar uma empresa",
  oportunidades: "Encontrar oportunidades",
};

export const DESCRICAO_MODO: Record<Jornada, Partial<Record<ModoProspeccao, string>>> = {
  b2b: {
    empresas: "Empresas que combinam com o perfil ideal, com evidências item a item.",
    pessoas: "Pessoas com o cargo certo dentro das empresas que combinam com o perfil.",
    empresa_unica: "Uma empresa específica: quem decide lá dentro e por onde entrar.",
    oportunidades: "Empresas e pessoas com um sinal recente de que este é o momento certo.",
  },
  b2c: {
    pessoas: "Pessoas que combinam com o perfil ideal, por localização e interesses.",
    oportunidades: "Pessoas com um sinal recente de que este é o momento certo para elas.",
  },
};

// Quantidade alvo do modo "Encontrar empresas" (US-017): mesmo array usado pelo `<select>` do passo 4
// (components/CriteriosProspeccao.tsx) e pela validação do pipeline (lib/execucao-prospeccao.ts) — somar
// um valor aqui exige somar nos dois lugares.
export const QUANTIDADES_EMPRESAS = [10, 25, 50] as const;

// Passo 4 do assistente (US-012): o botão primário diz o que a busca vai fazer, em vez de "Continuar".
export const ROTULO_ACAO_MODO: Record<ModoProspeccao, string> = {
  empresas: "Buscar empresas",
  pessoas: "Buscar pessoas",
  empresa_unica: "Explorar empresa",
  oportunidades: "Buscar oportunidades",
};

// Papel de cada pessoa no processo de decisão (US-018, primeira aparição, ver inferirPapel em
// lib/qualificacao.ts). "desconhecido" não tem rótulo: nenhum chip aparece na tela.
export const ROTULO_PAPEL: Record<Papel, string | null> = {
  decisor: "Decisor provável",
  influenciador: "Influenciador",
  champion: "Champion potencial",
  desconhecido: null,
};

// Aderência ao ICP (US-017/024): rótulo do chip em sentence case ("Alta aderência", prd.json > regras)
// — `Chip nivel={fit}` decide a cor (.chip-alta|media|baixa); este Record decide o texto, nunca o nível
// sozinho (que sem children mostraria só "Alta"/"Média"/"Baixa", ver components/ui.tsx:Chip).
export const ROTULO_FIT: Record<Fit, string> = {
  alta: "Alta aderência",
  media: "Média aderência",
  baixa: "Baixa aderência",
};

// Resultado de uma evidência item a item (US-024): rótulo e nível do chip por critério avaliado.
// "negativo" (vermelho, mesma classe de "alta"/perigo — ver app/globals.css) marca um critério que a
// página/perfil contradisse de verdade; "cinza" é reservado a "não foi possível verificar".
export const ROTULO_RESULTADO_EVIDENCIA: Record<Evidencia["resultado"], string> = {
  atende: "Atende",
  nao_atende: "Não atende",
  nao_verificavel: "Não foi possível verificar",
};

export const NIVEL_CHIP_EVIDENCIA: Record<Evidencia["resultado"], string> = {
  atende: "positivo",
  nao_atende: "negativo",
  nao_verificavel: "cinza",
};

// Status de um lead na lista (US-021, jornada B2C: coluna "Status" da lista "Pessoa | Fit | Sinal |
// Contexto | Status" — mostrado só ali por ora, os outros modos ainda não desenham essa coluna).
export const ROTULO_STATUS_LEAD: Record<StatusLead, string> = {
  novo: "Novo",
  pesquisado: "Pesquisado",
  qualificado: "Qualificado",
  selecionado: "Selecionado",
  abordado: "Abordado",
  respondeu: "Respondeu",
  descartado: "Descartado",
};

// Itens da estratégia de uma abordagem (US-029), um por linha, rótulo à esquerda.
export const ROTULO_CAMPO_ESTRATEGIA: Record<keyof EstrategiaAbordagem, string> = {
  objetivo: "Objetivo",
  gancho: "Gancho",
  dorProvavel: "Dor provável",
  tom: "Tom",
  cta: "CTA",
};

// Menu "Regenerar" (US-031): rótulo e ordem de exibição de cada direção. "outro_sinal" abre uma segunda
// lista (os sinais do próprio lead) em vez de regenerar direto — ver components/AbordagemLead.tsx.
export const ROTULO_DIRECAO_REGENERACAO: Record<DirecaoRegeneracao, string> = {
  mais_curto: "Mais curto",
  mais_executivo: "Mais executivo",
  mais_consultivo: "Mais consultivo",
  sem_pitch: "Sem pitch",
  outro_sinal: "Usar outro sinal",
  outra_abordagem: "Outra abordagem",
};

export const ORDEM_DIRECOES_REGENERACAO: DirecaoRegeneracao[] = [
  "mais_curto", "mais_executivo", "mais_consultivo", "sem_pitch", "outro_sinal", "outra_abordagem",
];

// Motivo do descarte (US-034): lista curta pedida junto com "Descartar", mostrada depois na ficha.
export const ROTULO_MOTIVO_DESCARTE: Record<MotivoDescarte, string> = {
  fora_do_perfil: "Fora do perfil",
  sem_sinal: "Sem sinal de interesse",
  ja_e_cliente: "Já é cliente",
  outro: "Outro motivo",
};

export const ORDEM_MOTIVOS_DESCARTE: MotivoDescarte[] = ["fora_do_perfil", "sem_sinal", "ja_e_cliente", "outro"];

function textoCriterio(criterios: Record<string, unknown>, chave: string): string {
  const v = criterios[chave];
  return typeof v === "string" ? v.trim() : "";
}

/** Recorte da busca (US-035): um resumo curto do que foi pedido no passo 4 (components/CriteriosProspeccao.tsx),
 * lido direto de `Prospeccao.criterios` (nunca tipado ali — `Record<string, unknown>`). Cada modo lê os
 * campos que o próprio passo 4 preenche para ele; "pessoas" decide entre B2B (tem `cargo`) e B2C (tem
 * `ocupacao`) pelo que existe, já que a jornada não é persistida na prospecção (ver nota de US-010). */
export function recorteProspeccao(modo: ModoProspeccao, criterios: Record<string, unknown>): string {
  const c = (chave: string) => textoCriterio(criterios, chave);
  switch (modo) {
    case "empresas":
      return [c("segmento"), c("localizacao")].filter(Boolean).join(" ");
    case "pessoas":
      return c("cargo")
        ? [c("cargo"), c("localizacao")].filter(Boolean).join(" ")
        : [c("ocupacao"), c("localizacao")].filter(Boolean).join(" ");
    case "empresa_unica":
      return c("empresaNome");
    case "oportunidades":
      return c("recorte");
  }
}

/** Nome de uma prospecção (US-035, prd.json: "nome (produto + recorte, ex.: 'Indústrias SP — DecisionOS')")
 * — a entidade não tem campo `nome` próprio (mesmo caso já documentado para `icp.nome` no progress.txt). */
export function nomeProspeccao(produtoNome: string, modo: ModoProspeccao, criterios: Record<string, unknown>): string {
  const recorte = recorteProspeccao(modo, criterios);
  return recorte ? `${recorte} — ${produtoNome}` : produtoNome;
}

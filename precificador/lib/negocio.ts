// O negócio: regime, capacidade, pró-labore e as linhas de custo fixo. Server-only (chega em
// node:sqlite por lib/banco.ts). Client Components importam os tipos e as contas de
// lib/precificacao, nunca este arquivo.
//
// Uma instância do app é um negócio só. `obterNegocio()` devolve o primeiro; `salvarNegocio()` cria
// na primeira vez e atualiza depois. Não há tela de "escolher negócio" porque não há dois.
import { agora, banco, gerarId } from "./banco";
import { canaisSemente } from "./canais";
import type { Balde, LinhaCustoFixo, ModoCapacidade, Negocio, Regime } from "./precificacao";

type LinhaNegocio = {
  id: string;
  nome: string;
  regime: string;
  imposto_produto_pct: number;
  imposto_servico_pct: number;
  modo_capacidade: string;
  volume_mensal_unidades: number;
  horas_produtivas_mes: number;
  pro_labore_mensal: number;
  margem_alvo_padrao_pct: number;
  proporcao_produto_pct: number;
  criado_em: string;
};

const REGIMES: Regime[] = ["mei", "simples", "presumido"];
const MODOS: ModoCapacidade[] = ["unidades", "horas", "ambos"];
const BALDES: Balde[] = ["produto", "servico", "ambos"];

function paraNegocio(l: LinhaNegocio): Negocio {
  return {
    id: l.id,
    nome: l.nome,
    regime: (REGIMES.includes(l.regime as Regime) ? l.regime : "simples") as Regime,
    impostoProdutoPct: l.imposto_produto_pct,
    impostoServicoPct: l.imposto_servico_pct,
    modoCapacidade: (MODOS.includes(l.modo_capacidade as ModoCapacidade) ? l.modo_capacidade : "unidades") as ModoCapacidade,
    volumeMensalUnidades: l.volume_mensal_unidades,
    horasProdutivasMes: l.horas_produtivas_mes,
    proLaboreMensal: l.pro_labore_mensal,
    margemAlvoPadraoPct: l.margem_alvo_padrao_pct,
    proporcaoProdutoPct: l.proporcao_produto_pct,
    criadoEm: l.criado_em,
  };
}

export function obterNegocio(): Negocio | null {
  const linha = banco().prepare("SELECT * FROM negocios ORDER BY criado_em LIMIT 1").get() as LinhaNegocio | undefined;
  return linha ? paraNegocio(linha) : null;
}

export type DadosNegocio = Omit<Negocio, "id" | "criadoEm">;

/** Valores de um negócio recém-criado: nada preenchido, margem-alvo em 20%. */
export function negocioEmBranco(): DadosNegocio {
  return {
    nome: "",
    regime: "simples",
    impostoProdutoPct: 0.06,
    impostoServicoPct: 0.06,
    modoCapacidade: "unidades",
    volumeMensalUnidades: 0,
    horasProdutivasMes: 0,
    proLaboreMensal: 0,
    margemAlvoPadraoPct: 0.2,
    proporcaoProdutoPct: 0.5,
  };
}

function fracao(valor: unknown, padrao = 0): number {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : padrao;
}

function positivo(valor: unknown, padrao = 0): number {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : padrao;
}

/** Cria o negócio na primeira chamada (com os canais semente) e atualiza nas seguintes. */
export function salvarNegocio(dados: Partial<DadosNegocio>): Negocio {
  const atual = obterNegocio();
  const base = atual ?? { ...negocioEmBranco(), id: gerarId(), criadoEm: agora() };
  const novo: Negocio = {
    ...base,
    nome: typeof dados.nome === "string" ? dados.nome.trim().slice(0, 120) : base.nome,
    regime: REGIMES.includes(dados.regime as Regime) ? (dados.regime as Regime) : base.regime,
    impostoProdutoPct: dados.impostoProdutoPct === undefined ? base.impostoProdutoPct : fracao(dados.impostoProdutoPct),
    impostoServicoPct: dados.impostoServicoPct === undefined ? base.impostoServicoPct : fracao(dados.impostoServicoPct),
    modoCapacidade: MODOS.includes(dados.modoCapacidade as ModoCapacidade) ? (dados.modoCapacidade as ModoCapacidade) : base.modoCapacidade,
    volumeMensalUnidades: dados.volumeMensalUnidades === undefined ? base.volumeMensalUnidades : positivo(dados.volumeMensalUnidades),
    horasProdutivasMes: dados.horasProdutivasMes === undefined ? base.horasProdutivasMes : positivo(dados.horasProdutivasMes),
    proLaboreMensal: dados.proLaboreMensal === undefined ? base.proLaboreMensal : positivo(dados.proLaboreMensal),
    margemAlvoPadraoPct: dados.margemAlvoPadraoPct === undefined ? base.margemAlvoPadraoPct : fracao(dados.margemAlvoPadraoPct),
    proporcaoProdutoPct: dados.proporcaoProdutoPct === undefined ? base.proporcaoProdutoPct : fracao(dados.proporcaoProdutoPct, 0.5),
  };

  const d = banco();
  if (atual) {
    d.prepare(
      `UPDATE negocios SET nome = ?, regime = ?, imposto_produto_pct = ?, imposto_servico_pct = ?,
       modo_capacidade = ?, volume_mensal_unidades = ?, horas_produtivas_mes = ?, pro_labore_mensal = ?,
       margem_alvo_padrao_pct = ?, proporcao_produto_pct = ? WHERE id = ?`
    ).run(
      novo.nome, novo.regime, novo.impostoProdutoPct, novo.impostoServicoPct, novo.modoCapacidade,
      novo.volumeMensalUnidades, novo.horasProdutivasMes, novo.proLaboreMensal, novo.margemAlvoPadraoPct,
      novo.proporcaoProdutoPct, novo.id
    );
    return novo;
  }

  d.prepare(
    `INSERT INTO negocios (id, nome, regime, imposto_produto_pct, imposto_servico_pct, modo_capacidade,
     volume_mensal_unidades, horas_produtivas_mes, pro_labore_mensal, margem_alvo_padrao_pct,
     proporcao_produto_pct, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    novo.id, novo.nome, novo.regime, novo.impostoProdutoPct, novo.impostoServicoPct, novo.modoCapacidade,
    novo.volumeMensalUnidades, novo.horasProdutivasMes, novo.proLaboreMensal, novo.margemAlvoPadraoPct,
    novo.proporcaoProdutoPct, novo.criadoEm
  );
  canaisSemente(novo.id);
  return novo;
}

/** Negócio existente ou um recém-criado. Toda tela que precisa de um id chama isto. */
export function garantirNegocio(): Negocio {
  return obterNegocio() ?? salvarNegocio({});
}

type LinhaFixo = { id: string; negocio_id: string; nome: string; valor_mensal: number; balde: string; ordem: number };

export function listarCustosFixos(negocioId: string): LinhaCustoFixo[] {
  const linhas = banco().prepare("SELECT * FROM linhas_custo_fixo WHERE negocio_id = ? ORDER BY ordem, nome").all(negocioId) as LinhaFixo[];
  return linhas.map((l) => ({
    id: l.id,
    negocioId: l.negocio_id,
    nome: l.nome,
    valorMensal: l.valor_mensal,
    balde: (BALDES.includes(l.balde as Balde) ? l.balde : "ambos") as Balde,
  }));
}

export type DadosCustoFixo = { id?: string; nome: string; valorMensal: number; balde: Balde };

/**
 * Substitui a lista inteira de custos fixos, preservando os ids enviados.
 * A tela edita linha a linha e salva tudo de uma vez; linha sem id nasce, id ausente da lista é
 * apagado. Preservar o id importa porque o "recalcular tudo" compara antes e depois.
 */
export function definirCustosFixos(negocioId: string, linhas: DadosCustoFixo[]): LinhaCustoFixo[] {
  const d = banco();
  const validas = linhas.filter((l) => String(l.nome || "").trim());
  const manter = new Set(validas.map((l) => l.id).filter(Boolean) as string[]);
  const existentes = listarCustosFixos(negocioId);
  for (const antiga of existentes) {
    if (!manter.has(antiga.id)) d.prepare("DELETE FROM linhas_custo_fixo WHERE id = ?").run(antiga.id);
  }
  validas.forEach((l, ordem) => {
    const nome = String(l.nome).trim().slice(0, 120);
    const valor = positivo(l.valorMensal);
    const balde = BALDES.includes(l.balde) ? l.balde : "ambos";
    if (l.id && manter.has(l.id)) {
      d.prepare("UPDATE linhas_custo_fixo SET nome = ?, valor_mensal = ?, balde = ?, ordem = ? WHERE id = ?").run(nome, valor, balde, ordem, l.id);
    } else {
      d.prepare("INSERT INTO linhas_custo_fixo (id, negocio_id, nome, valor_mensal, balde, ordem) VALUES (?, ?, ?, ?, ?, ?)").run(gerarId(), negocioId, nome, valor, balde, ordem);
    }
  });
  return listarCustosFixos(negocioId);
}

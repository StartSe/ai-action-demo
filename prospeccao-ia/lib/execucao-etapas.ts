import type { Jornada, ModoProspeccao } from "./types";

// Referências iniciais de duração, não medições históricas nem promessa de prazo.
// A tela compara esses intervalos com os horários reais persistidos pelo servidor.
export const ETAPAS_PROSPECCAO = [
  { chave: "entendendo_produto", rotulo: "Entendendo seu produto", descricao: "Lendo a proposta de valor, o perfil ideal e os critérios desta busca.", estimativa: [1, 5] },
  { chave: "procurando_empresas", rotulo: "Encontrando empresas", descricao: "Pesquisando empresas e verificando as informações disponíveis nas fontes conectadas.", estimativa: [30, 180] },
  { chave: "analisando_sinais", rotulo: "Analisando sinais públicos", descricao: "Conferindo os sinais de interesse nas empresas encontradas, com origem e data quando disponíveis.", estimativa: [30, 180] },
  { chave: "encontrando_pessoas", rotulo: "Encontrando pessoas-chave", descricao: "Buscando perfis compatíveis, conferindo cargos e reunindo as informações públicas disponíveis.", estimativa: [60, 300] },
  { chave: "qualificando", rotulo: "Qualificando oportunidades", descricao: "Comparando as evidências com os critérios e organizando quem merece sua atenção primeiro.", estimativa: [1, 10] },
] as const;

export type ChaveEtapaProspeccao = (typeof ETAPAS_PROSPECCAO)[number]["chave"];

export function etapasDaProspeccao(modo: ModoProspeccao, jornada: Jornada) {
  return ETAPAS_PROSPECCAO.filter(e => {
    if (e.chave === "procurando_empresas" || e.chave === "analisando_sinais") return modo !== "pessoas" && jornada === "b2b";
    if (e.chave === "encontrando_pessoas") return modo !== "empresas";
    return true;
  });
}

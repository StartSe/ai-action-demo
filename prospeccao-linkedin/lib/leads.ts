// Busca de leads e ciclo de vida da campanha, compartilhados entre app/api/leads/route.ts e lib/ferramentas.ts (MCP).
// Nesta versão a busca ainda não consulta o LinkedIn: devolve a lista fictícia de lib/demo.ts rotulada como "demo".
// O Prospect Halo (busca real e envio) entra na próxima versão, mantendo a mesma assinatura de buscarLeads.
import { aiEnabled, meta, type Meta } from "./ai";
import { esperar, leadsDemo, separar } from "./demo";
import { atualizarSaida, obter, salvar } from "./historico";
import { getConfig } from "./store";
import { SINAIS_INTENCAO, TONS, type Campanha, type Perfil, type SinalIntencao, type Tom } from "./types";

/** Erro de entrada do usuário: as rotas respondem 400 (em vez de 500) quando o pegam. */
export class ErroDePedido extends Error {}
/** Campanha (resultado do histórico) inexistente ou de outro tipo: as rotas respondem 404. */
export class CampanhaNaoEncontrada extends Error {}

export const TIPO_HISTORICO = "prospeccao";
export const INSUMO = "seu perfil de cliente ideal";

const VALORES_SINAL = new Set<string>(SINAIS_INTENCAO.map((s) => s.valor));
const VALORES_TOM = new Set<string>(TONS.map((t) => t.valor));

/** Valida e normaliza o corpo recebido (rota HTTP ou MCP) num Perfil completo. Lança ErroDePedido. */
export function validarPerfil(bruto: unknown): Perfil {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const cargos = String(b.cargos || "").trim();
  const setores = String(b.setores || "").trim();
  const proposta = String(b.proposta || "").trim();
  if (!cargos || !setores || !proposta) {
    throw new ErroDePedido("Preencha os cargos, os setores e a sua proposta em uma frase.");
  }
  const sinaisBrutos = Array.isArray(b.sinais) ? b.sinais : typeof b.sinais === "string" ? separar(b.sinais) : [];
  const sinais = sinaisBrutos.map((s) => String(s).trim()).filter((s) => VALORES_SINAL.has(s)) as SinalIntencao[];
  if (sinais.length !== sinaisBrutos.length) {
    throw new ErroDePedido(`Sinais de intenção válidos: ${SINAIS_INTENCAO.map((s) => s.valor).join(", ")}.`);
  }
  const remetenteBruto = (b.remetente && typeof b.remetente === "object" ? b.remetente : {}) as Record<string, unknown>;
  const remetente = {
    nome: String(remetenteBruto.nome ?? b.remetenteNome ?? "").trim().slice(0, 120),
    empresa: String(remetenteBruto.empresa ?? b.remetenteEmpresa ?? "").trim().slice(0, 120),
  };
  const tomBruto = String(b.tom || "consultivo").trim().toLowerCase();
  const tom = (VALORES_TOM.has(tomBruto) ? tomBruto : "consultivo") as Tom;
  return { cargos: cargos.slice(0, 300), setores: setores.slice(0, 300), sinais, proposta: proposta.slice(0, 600), remetente, tom };
}

/** Completa nome/empresa do remetente com o que ficou lembrado do último uso, quando o pedido não trouxe. */
export function completarRemetente(perfil: Perfil): Perfil {
  return {
    ...perfil,
    remetente: {
      nome: perfil.remetente.nome || getConfig("REMETENTE_NOME") || "",
      empresa: perfil.remetente.empresa || getConfig("REMETENTE_EMPRESA") || "",
    },
  };
}

export function nomeCampanha(perfil: Perfil) {
  const cargos = separar(perfil.cargos);
  const setores = separar(perfil.setores);
  const c = cargos.slice(0, 2).join(", ") + (cargos.length > 2 ? "..." : "");
  const s = setores.slice(0, 2).join(", ") + (setores.length > 2 ? "..." : "");
  return `Prospecção: ${c} em ${s}`;
}

/** Busca os leads que combinam com o perfil e salva a campanha (estado "rascunho") no histórico. */
export async function buscarLeads(perfil: Perfil): Promise<{ campanha: Campanha; meta: Meta }> {
  // Os leads são sempre fictícios nesta versão; a meta reflete se as sequências sairão da IA ou do exemplo.
  await esperar(900);
  const leads = leadsDemo(perfil).sort((a, b) => b.pontuacao - a.pontuacao);
  const metaGerada = meta({ demo: !aiEnabled(), insumo: INSUMO });
  const nome = nomeCampanha(perfil);
  const id = salvar({ tipo: TIPO_HISTORICO, titulo: nome, entrada: perfil, saida: { id: "", nome, leads, sequencias: [], estado: "rascunho" }, meta: metaGerada });
  const campanha: Campanha = { id, nome, leads, sequencias: [], estado: "rascunho" };
  atualizarSaida(id, campanha);
  return { campanha, meta: metaGerada };
}

/** Lê uma campanha salva (com o perfil que a gerou). Lança CampanhaNaoEncontrada. */
export function obterCampanha(id: string): { campanha: Campanha; perfil: Perfil; meta: Meta } {
  const registro = obter<Perfil, Campanha, Meta>(id);
  if (!registro || registro.tipo !== TIPO_HISTORICO) throw new CampanhaNaoEncontrada("Campanha não encontrada.");
  return { campanha: { ...registro.saida, id }, perfil: registro.entrada, meta: registro.meta };
}

export function salvarCampanha(campanha: Campanha) {
  atualizarSaida(campanha.id, campanha);
}

// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho.
import { listar as listarHistorico } from "./historico";
import { completarRemetente, ErroDePedido, salvarCampanha, salvarNovaCampanha, TIPO_HISTORICO, validarPerfil } from "./leads";
import { buscarLeadsNovos } from "./leads-vistos";
import { registrarExecutor, type Rotina } from "./rotinas";
import { escreverSequencia, MAXIMO_POR_CHAMADA } from "./sequencias";
import { LEADS_POR_SEMANA, type Perfil, type Sequencia } from "./types";
import { separar } from "./demo";

/** Tipos de rotina disponíveis neste app, para o cartão de /setup listar num seletor. */
export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [
  { tipo: "leads-semanais", rotulo: "Leads novos toda semana" },
  { tipo: "resumo-prospeccao-linkedin", rotulo: "Resumo das prospecções geradas" },
];

function tituloLeadsNovos(perfil: Pick<Perfil, "cargos" | "setores">) {
  const cargos = separar(perfil.cargos).slice(0, 2).join(", ");
  const setores = separar(perfil.setores).slice(0, 2).join(", ");
  return cargos && setores ? `Leads novos: ${cargos} em ${setores}` : "Leads novos toda semana";
}

/**
 * Leads novos toda semana: busca pelo perfil salvo em `parametros` (botão "Receber leads novos toda semana" no resultado),
 * exclui quem já foi entregue para esse perfil (lib/leads-vistos.ts), escreve a sequência de cada lead e entrega a lista
 * com o link do resultado. Nunca envia mensagem nenhuma: a pessoa revisa e copia (ou aprova o envio) pelo link.
 */
registrarExecutor("leads-semanais", async (rotina: Rotina) => {
  const bruto = (rotina.parametros && typeof rotina.parametros === "object" ? rotina.parametros : {}) as Record<string, unknown>;
  let perfil: Perfil;
  try {
    perfil = completarRemetente(validarPerfil(bruto));
  } catch (err) {
    if (!(err instanceof ErroDePedido)) throw err;
    return { titulo: "Leads novos toda semana", texto: "Esta rotina precisa do perfil de cliente ideal: crie-a pelo botão 'Receber leads novos toda semana', na tela de resultado de uma busca de leads." };
  }
  const titulo = tituloLeadsNovos(perfil);
  const pedida = Number(bruto.quantidade);
  const quantidade = Number.isInteger(pedida) && pedida > 0 ? Math.min(pedida, MAXIMO_POR_CHAMADA) : LEADS_POR_SEMANA;

  const leads = await buscarLeadsNovos(perfil, quantidade);
  if (leads.length === 0) {
    return { titulo, texto: "Nenhum lead novo esta semana para esse perfil: todos os encontrados já foram entregues antes. Amplie os cargos ou os setores para alcançar gente nova." };
  }

  const { campanha } = salvarNovaCampanha(perfil, leads, titulo);
  // Uma sequência por lead, uma chamada por vez (mesmo espírito de escreverParaCampanha: não sobrecarregar a IA).
  const sequencias: Sequencia[] = [];
  for (const lead of leads) sequencias.push((await escreverSequencia(lead, perfil)).sequencia);
  salvarCampanha({ ...campanha, sequencias, estado: "pronta" });

  const demo = leads.some((l) => l.origem === "demo");
  const plural = leads.length > 1;
  const texto = [
    `${leads.length} lead${plural ? "s" : ""} novo${plural ? "s" : ""} para ${perfil.cargos} em ${perfil.setores}, com a sequência de mensagens pronta para cada um: ${leads.map((l) => l.nome).join(", ")}.`,
    demo ? "Os leads são fictícios: o Prospect Halo não está conectado, então a lista mostra o formato da entrega." : "",
    "Nada foi enviado: revise e copie as mensagens pelo link do resultado.",
  ].filter(Boolean).join(" ");
  return { titulo, texto, resultadoId: campanha.id };
});

registrarExecutor("resumo-prospeccao-linkedin", async (rotina: Rotina) => {
  const desde = rotina.ultimaExecucao ? new Date(rotina.ultimaExecucao) : new Date(0);
  const recentes = listarHistorico(50).filter((r) => r.tipo === TIPO_HISTORICO && new Date(r.criadoEm) > desde);
  const titulo = "Resumo da Prospecção no LinkedIn";
  if (recentes.length === 0) return { titulo, texto: "Nenhuma prospecção nova foi gerada desde a última rotina.", enviar: false };
  const plural = recentes.length > 1;
  const texto = `${recentes.length} prospecç${plural ? "ões" : "ão"} gerada${plural ? "s" : ""} desde a última rotina: ${recentes.map((r) => r.titulo).join("; ")}.`;
  return { titulo, texto, resultadoId: recentes[0].id };
});

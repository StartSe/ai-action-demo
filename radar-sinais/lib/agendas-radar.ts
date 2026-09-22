import { aiEnabled } from "./ai";
import { listarRadares } from "./radares";
import { criar, listar, pausar } from "./rotinas";
import { FUSO_PADRAO, HORARIOS_PADRAO, TIPO_MONITORAMENTO, type Monitoramento } from "./monitoramento";

/** Também roda no servidor ao conectar IA: não depende de uma aba aberta. Pausas são preservadas. */
export async function sincronizarAgendas() {
  if (!(await aiEnabled())) return;
  const agendas = listar<Monitoramento>();
  for (const radar of listarRadares()) {
    const existente = agendas.find(r => r.tipo === TIPO_MONITORAMENTO && r.parametros.radarId === radar.id);
    const temas = radar.pesquisa.termos.filter(t => t.ativo).map(t => t.termo);
    if (radar.pesquisa.acompanhamento === false) { if (existente?.ativa) pausar(existente.id, false); continue; }
    if (existente || !temas.length) continue;
    criar({ tipo: TIPO_MONITORAMENTO, frequencia: "diaria", hora: HORARIOS_PADRAO[0], canal: "interno", parametros: { radarId: radar.id, temas, setor: radar.pesquisa.setor, periodoDias: radar.pesquisa.periodoDias, horarios: HORARIOS_PADRAO, fuso: FUSO_PADRAO } });
  }
}

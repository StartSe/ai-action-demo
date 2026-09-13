// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho, chamando registrarExecutor (ver pdi-time/lib/rotinas-do-app.ts).
import { escreverAbordagem } from "./abordagem";
import { salvar } from "./historico";
import { buscarLeadsNovos } from "./leads-vistos";
import { registrarExecutor, type Rotina } from "./rotinas";
import type { Abordagem, DadosBusca } from "./types";

export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [{ tipo: "leads-semanais", rotulo: "Leads novos toda semana" }];

registrarExecutor("leads-semanais", async (rotina: Rotina) => {
  const dados = rotina.parametros as Partial<DadosBusca>;
  const titulo = dados?.cargo && dados?.segmento ? `Leads novos: ${dados.cargo} em ${dados.segmento}` : "Leads novos toda semana";

  if (!dados?.segmento || !dados?.cargo || !dados?.localizacao || !dados?.proposta) {
    return { titulo, texto: "Esta rotina precisa do perfil de busca: crie-a pelo botão 'Receber leads novos toda semana', na tela de resultado de uma busca de leads." };
  }

  const { fonte, leads, meta: metaGerada } = await buscarLeadsNovos(dados as DadosBusca);
  if (leads.length === 0) {
    return { titulo, texto: "Nenhum lead novo encontrado esta semana para esse perfil. Tente de novo na próxima semana ou ajuste o perfil buscado." };
  }

  // Escreve a abordagem de cada lead novo, um por vez (mesmo espírito de "escreverEmLote" em app/page.tsx: não sobrecarregar a IA/demo).
  const abordagens: Record<string, Abordagem> = {};
  for (const lead of leads) {
    const { abordagem } = await escreverAbordagem({
      lead,
      proposta: dados.proposta,
      segmento: dados.segmento,
      remetenteNome: dados.remetenteNome,
      remetenteEmpresa: dados.remetenteEmpresa,
    });
    abordagens[lead.id] = abordagem;
  }

  const texto = `${leads.length} lead${leads.length > 1 ? "s" : ""} novo${leads.length > 1 ? "s" : ""} para ${dados.cargo} em ${dados.segmento}, com abordagem pronta para cada um: ${leads.map((l) => l.nome).join(", ")}.`;
  const resultadoId = salvar({ tipo: "leads", titulo, entrada: dados, saida: { fonte, leads, abordagens }, meta: metaGerada });

  return { titulo, texto, resultadoId };
});

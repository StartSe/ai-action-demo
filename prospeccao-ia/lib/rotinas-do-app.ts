// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho, chamando registrarExecutor (ver pdi-time/lib/rotinas-do-app.ts).
import { escreverAbordagem } from "./abordagem";
import { executarPipeline } from "./execucao-prospeccao";
import { salvar } from "./historico";
import { buscarLeadsNovos } from "./leads-vistos";
import { ordenarLeadsPorPrioridade, sinalMaisRecente } from "./qualificacao";
import { registrarExecutor, type Rotina, type TipoRotina } from "./rotinas";
import { nomeProspeccao } from "./rotulos";
import { enderecoPublico } from "./setup-comum";
import { ultimaBusca } from "./ultima-busca";
import { atualizarLead, criarProspeccao, listarLeads, obterProduto, obterProspeccao } from "./workspace";
import type { Abordagem, DadosBusca } from "./types";

const SEM_PERFIL =
  "Esta rotina precisa do perfil de busca: faça uma busca de leads e use o botão “Receber leads novos toda semana”, na tela de resultado.";

/** Perfil completo o bastante para buscar e escrever (segmento, cargo, localização e proposta). */
function perfilCompleto(dados: Partial<DadosBusca> | null | undefined): dados is DadosBusca {
  return Boolean(dados?.segmento && dados?.cargo && dados?.localizacao && dados?.proposta);
}

/**
 * Perfil que a rotina vai usar: o salvo nos parâmetros (botão do resultado) ou, quando a rotina foi
 * criada pelo cartão genérico de /setup (sem parâmetros), o último perfil buscado neste app.
 */
export function perfilDaRotina(parametros: unknown): DadosBusca | null {
  const dados = (parametros && typeof parametros === "object" ? parametros : {}) as Partial<DadosBusca>;
  if (perfilCompleto(dados)) return dados;
  const ultimo = ultimaBusca();
  return perfilCompleto(ultimo) ? ultimo : null;
}

const SEM_PROSPECCAO = "Esta rotina precisa de uma prospecção salva: escolha uma na lista antes de criar.";

/** Parâmetro da rotina "Oportunidades novas" (US-040): a prospecção que serve de modelo (produto, ICP,
 * modo e critérios) para as execuções seguintes — nunca um formulário de busca à parte, como a rotina
 * antiga "leads-semanais" (modelo anterior, ainda de pé para as rotas `/api/leads`/`/api/abordagem`). */
function prospeccaoDaRotina(parametros: unknown): { prospeccaoId: string } | null {
  const p = (parametros && typeof parametros === "object" ? parametros : {}) as { prospeccaoId?: unknown };
  return typeof p.prospeccaoId === "string" && p.prospeccaoId && obterProspeccao(p.prospeccaoId) ? { prospeccaoId: p.prospeccaoId } : null;
}

/** Tipos de rotina deste app, para o cartão "Rotinas" de /setup listar num seletor. O `validar` recusa
 * criar "Leads novos toda semana" enquanto não houver perfil nenhum (nem nos parâmetros, nem de uma
 * busca anterior): sem ele a rotina falharia em silêncio no dia marcado. Mesma ideia para "Oportunidades
 * novas": sem uma prospecção salva escolhida, a rotina não teria o que repetir. */
export const TIPOS_ROTINA: TipoRotina[] = [
  {
    tipo: "leads-semanais",
    rotulo: "Leads novos toda semana",
    validar: (parametros) => (perfilDaRotina(parametros) ? undefined : SEM_PERFIL),
  },
  {
    tipo: "oportunidades-novas",
    rotulo: "Oportunidades novas de uma prospecção",
    validar: (parametros) => (prospeccaoDaRotina(parametros) ? undefined : SEM_PROSPECCAO),
  },
];

registrarExecutor("leads-semanais", async (rotina: Rotina) => {
  const dados = perfilDaRotina(rotina.parametros);
  if (!dados) return { titulo: "Leads novos toda semana", texto: SEM_PERFIL };

  const titulo = `Leads novos: ${dados.cargo} em ${dados.segmento}`;
  const bruto = (rotina.parametros && typeof rotina.parametros === "object" ? rotina.parametros : {}) as Partial<DadosBusca>;
  const quantidade = bruto.quantidade || dados.quantidade || "10";

  const { fonte, leads, meta: metaGerada } = await buscarLeadsNovos({ ...dados, quantidade });
  if (leads.length === 0) {
    return { titulo, texto: "Nenhum lead novo esta semana para esse perfil: todos os encontrados já foram entregues antes. Amplie o cargo, o segmento ou a região para alcançar gente nova." };
  }

  // Escreve a abordagem de cada lead novo, um por vez (mesmo espírito de "escreverEmLote" em app/page.tsx: não sobrecarregar a IA/demo).
  // Uma falha isolada não derruba a rotina: os que deram certo são entregues e o aviso diz quem ficou de fora.
  const abordagens: Record<string, Abordagem> = {};
  const semAbordagem: string[] = [];
  for (const lead of leads) {
    try {
      const { abordagem } = await escreverAbordagem({
        lead,
        proposta: dados.proposta,
        segmento: dados.segmento,
        remetenteNome: dados.remetenteNome,
        remetenteEmpresa: dados.remetenteEmpresa,
      });
      abordagens[lead.id] = abordagem;
    } catch (err) {
      semAbordagem.push(lead.nome);
      console.error("Rotina leads-semanais: falha ao escrever para", lead.nome, err);
    }
  }

  const plural = leads.length > 1;
  const resultadoId = salvar({ tipo: "leads", titulo, entrada: dados, saida: { fonte, leads, abordagens }, meta: metaGerada });
  const texto = [
    `${leads.length} lead${plural ? "s" : ""} novo${plural ? "s" : ""} para ${dados.cargo} em ${dados.segmento}, com abordagem pronta para cada um: ${leads.map((l) => l.nome).join(", ")}.`,
    semAbordagem.length > 0 ? `A abordagem de ${semAbordagem.join(", ")} não saiu: abra o resultado e clique em Escrever abordagem.` : "",
    fonte === "demo" ? "Os leads são fictícios: a busca de leads não está conectada, então a lista mostra o formato da entrega." : "",
  ].filter(Boolean).join(" ");

  return { titulo, texto, resultadoId };
});

/**
 * "Oportunidades novas" (US-040): roda a MESMA descoberta da prospecção escolhida (produto, ICP, modo e
 * critérios), criando uma prospecção-filha e aguardando o pipeline (`executarPipeline`, diferente de
 * `iniciarExecucao`, nunca aguardada pela rota HTTP) — o dedup do próprio pipeline (`chaveLead` contra
 * `leadsDoProduto`, lib/execucao-prospeccao.ts) já garante que só quem nunca apareceu antes no produto
 * entra na prospecção-filha, então "os novos" são, literalmente, os leads dela. Escopo desta rotina é só
 * PESSOAS: o modo "empresas" (sem etapa de pessoas) sempre volta 0 leads aqui, porque não existe hoje um
 * mecanismo de "empresa já vista" equivalente ao de leads — mesma fronteira já aceita para o modo
 * "empresas" em `criarContasFicticias`/dedup por domínio (só dentro de uma execução, nunca entre elas).
 */
registrarExecutor("oportunidades-novas", async (rotina: Rotina) => {
  const alvo = prospeccaoDaRotina(rotina.parametros);
  const tituloGenerico = "Oportunidades novas";
  if (!alvo) return { titulo: tituloGenerico, texto: SEM_PROSPECCAO, enviar: false };

  const original = obterProspeccao(alvo.prospeccaoId);
  const produto = original ? obterProduto(original.produtoId) : null;
  if (!original || !produto) {
    return { titulo: tituloGenerico, texto: "A prospecção escolhida para esta rotina não existe mais: escolha outra em Configurações.", enviar: false };
  }
  const nomeAlvo = nomeProspeccao(produto.nome, original.modo, original.criterios);
  const titulo = `Oportunidades novas: ${nomeAlvo}`;

  // Prospecção-filha com o MESMO produto/ICP/modo/critérios do original (mesma ideia de "Repetir
  // prospecção", US-014) — direto por lib/workspace.ts (não `criarProspeccaoValidada`, que já dispara
  // `iniciarExecucao` sem aguardar; aqui o próprio executor precisa aguardar o pipeline terminar).
  const nova = criarProspeccao({
    produtoId: original.produtoId,
    icpId: original.icpId,
    modo: original.modo,
    criterios: original.criterios,
    estado: "executando",
    etapa: null,
    erro: null,
  });
  await executarPipeline(nova.id);

  const encontrados = listarLeads(nova.id);
  if (encontrados.length === 0) {
    const concluida = obterProspeccao(nova.id);
    const motivo = concluida?.erro ? ` ${concluida.erro}` : "";
    return { titulo, texto: `Nenhuma oportunidade nova para ${nomeAlvo}: ninguém além de quem já tinha aparecido antes.${motivo}`, enviar: false };
  }

  // "Grava os novos com status Novo" (AC): o pipeline normal promove a "qualificado"/"pesquisado", mas
  // aqui ninguém ainda revisou — a rotina achou sozinha, enquanto o vendedor vendia.
  for (const lead of encontrados) atualizarLead(lead.id, { status: "novo" });

  const base = enderecoPublico();
  if (!base) console.error('Rotina "oportunidades-novas": endereço público desconhecido, links omitidos do aviso.');
  const melhores = ordenarLeadsPorPrioridade(encontrados).slice(0, 5);
  const linhas = melhores.map((lead) => {
    const sinal = sinalMaisRecente(lead.sinais);
    const partes = [lead.nome, lead.empresa, sinal ? sinal.descricao : "Sem sinal público"].filter(Boolean).join(" · ");
    return base ? `${partes} — ${base}/leads/${lead.id}` : partes;
  });

  const plural = encontrados.length > 1;
  const texto = [
    `${encontrados.length} oportunidade${plural ? "s" : ""} nova${plural ? "s" : ""} para ${nomeAlvo}. Os melhores por aderência:`,
    ...linhas,
  ].join("\n");

  return { titulo, texto };
});

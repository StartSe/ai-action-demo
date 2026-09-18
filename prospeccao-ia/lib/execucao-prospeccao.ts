// Pipeline de execução de uma prospecção (US-013), disparado em segundo plano por POST /api/prospeccoes:
// `iniciarExecucao` NUNCA é aguardada no caminho da resposta (a rota chama `void iniciarExecucao(id)`),
// mesmo espírito de `iniciarVideo`/`executarEnvio` em videos-campanha/lib/videos.ts — só que aqui as 5
// etapas são fixas (ETAPAS_PROSPECCAO), não estados de resposta de um provedor externo.
//
// Cada etapa grava `Prospeccao.etapa` = a chave da PRÓPRIA etapa logo no início dela (antes de fazer o
// trabalho), para o polling (GET /api/prospeccoes/[id]/andamento) mostrar "em andamento" na etapa certa
// mesmo que o processo morra no meio. Erro em qualquer etapa NUNCA perde o que as etapas anteriores já
// gravaram (elas já commitaram no banco antes do erro): a prospecção termina `estado: "pronta"` com
// `erro` preenchido, nunca `"falhou"` (esse estado é só para a recuperação na inicialização — processo
// reiniciado no meio, ver recuperarProspeccoesTravadas em lib/workspace.ts).
//
// Escopo desta história (fronteira exata para US-015/017-020/024-026 substituírem sem reler este
// arquivo inteiro): toda conta/lead nasce com fit:null, evidencias:[], sinais:[] — nenhuma qualificação
// de verdade acontece aqui. Leads nascem com papel:"desconhecido" (papel real é US-026) e
// status:"pesquisado" (só a etapa 5 promove para "qualificado", sem calcular fit). Sinais de intenção do
// ICP/critérios são lidos e filtrados na etapa 3, mas NUNCA persistidos como SinalProspeccao (exigiria
// origem real, que só a US-020 vai trazer) — "sinal sem fonte é descartado".
import { ETAPAS_PROSPECCAO } from "./execucao-etapas";
import { atualizarLead, atualizarProspeccao, criarConta, criarLead, leadsDoProduto, listarContas, listarLeads, obterICP, obterProduto, obterProspeccao } from "./workspace";
import type { ICP, Jornada, ModoProspeccao } from "./types";

const NOMES_EMPRESA = ["Nortis", "Aliança", "Vetor", "Cadence", "Plena", "Horizonte", "Mérito", "Élan", "Polar", "Cedro"];
const SUFIXOS_EMPRESA = ["Tecnologia", "Soluções", "Indústria", "Serviços", "Comércio", "Consultoria"];
const NOMES_PESSOA = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fábio", "Gabriela", "Heitor", "Isadora", "João", "Karina", "Leandro"];
const SOBRENOMES_PESSOA = ["Almeida", "Barros", "Costa", "Duarte", "Farias", "Gouveia", "Lopes", "Martins", "Nogueira", "Pereira", "Queiroz", "Ramos"];
const CARGOS_PESSOA = ["Gerente", "Diretor(a)", "Coordenador(a)", "Analista", "Head", "Especialista"];

function textoCriterio(criterios: Record<string, unknown>, chave: string): string {
  const v = criterios[chave];
  return typeof v === "string" ? v.trim() : "";
}

function nomeEmpresaFicticia(segmento: string, indice: number): string {
  const prefixo = NOMES_EMPRESA[indice % NOMES_EMPRESA.length];
  const primeiraPalavraSegmento = segmento.split(/\s+/)[0];
  const sufixo = primeiraPalavraSegmento || SUFIXOS_EMPRESA[indice % SUFIXOS_EMPRESA.length];
  return `${prefixo} ${sufixo}`;
}

function nomePessoaFicticia(indice: number): string {
  const nome = NOMES_PESSOA[indice % NOMES_PESSOA.length];
  const sobrenome = SOBRENOMES_PESSOA[(indice * 3 + 1) % SOBRENOMES_PESSOA.length];
  return `${nome} ${sobrenome}`;
}

/** Contas fazem sentido para o modo escolhido quando cada resultado (empresa ou pessoa) se vincula a uma
 * empresa: sempre em `empresas`/`empresa_unica`, e só em B2B para `pessoas`/`oportunidades` — em B2C
 * essas duas buscam pessoas físicas soltas, sem conta. */
function deveCriarContas(modo: ModoProspeccao, jornada: Jornada): boolean {
  if (modo === "empresas" || modo === "empresa_unica") return true;
  if (jornada !== "b2b") return false;
  return modo === "pessoas" || modo === "oportunidades";
}

/** Todo modo tem pessoas-chave, exceto "empresas" puro (só sobre as empresas em si). */
function deveCriarPessoas(modo: ModoProspeccao): boolean {
  return modo !== "empresas";
}

/** Etapa 2: cria as contas (empresas) compatíveis com os critérios recebidos — fit/evidências/sinais
 * vazios (qualificação real é US-024; sinal com origem real é US-020), demo sempre false (não confundir
 * com o exemplo semeado por "Ver uma prospecção de exemplo"). */
function etapaProcurarEmpresas(prospeccaoId: string, modo: ModoProspeccao, jornada: Jornada, criterios: Record<string, unknown>): void {
  if (!deveCriarContas(modo, jornada)) return;
  const base = { prospeccaoId, site: null, fit: null, evidencias: [], sinais: [], resumo: "", demo: false as const };
  if (modo === "empresa_unica") {
    const nome = textoCriterio(criterios, "empresaNome") || "Empresa sem nome informado";
    criarConta({ ...base, nome, setor: textoCriterio(criterios, "segmento") || null, porte: textoCriterio(criterios, "porte") || null, cidade: textoCriterio(criterios, "localizacao") || null });
    return;
  }
  const segmento = textoCriterio(criterios, "segmento") || textoCriterio(criterios, "recorte");
  const localizacao = textoCriterio(criterios, "localizacao");
  const porte = textoCriterio(criterios, "porte");
  for (let i = 0; i < 3; i++) {
    criarConta({ ...base, nome: nomeEmpresaFicticia(segmento, i), setor: segmento || null, porte: porte || null, cidade: localizacao || null });
  }
}

/** Etapa 3: trabalho real = ler e filtrar os sinais de intenção do ICP e dos critérios recebidos — só para
 * uso do pipeline; NUNCA persiste um SinalProspeccao aqui (exigiria origem real, que é da US-020). */
function analisarSinais(criterios: Record<string, unknown>, icp: ICP | null): string[] {
  const doCriterio = Array.isArray(criterios.sinais) ? criterios.sinais.filter((s): s is string => typeof s === "string") : [];
  const doICP = icp?.sinais ?? [];
  return Array.from(new Set([...doCriterio, ...doICP]));
}

/** Identidade de um lead para reconhecer "já visto" (US-014): LinkedIn quando existe (mais específico);
 * sem ele, nome + empresa normalizados (minúsculas, sem espaço nas pontas) — mesmo espírito de chavePerfil
 * em lib/leads-vistos.ts, só que pela identidade da PESSOA, não pelo perfil da busca. */
function chaveLead(nome: string, empresa: string | null, linkedin: string | null): string {
  if (linkedin && linkedin.trim()) return `linkedin:${linkedin.trim().toLowerCase()}`;
  return `nome:${nome.trim().toLowerCase()}|${String(empresa || "").trim().toLowerCase()}`;
}

/** Etapa 4: 2 pessoas por conta já criada (contaId vinculado), ou 6 pessoas soltas (contaId null) quando
 * não há conta (ex.: jornada B2C). papel "desconhecido" (papel real é US-026), status "pesquisado" (só a
 * etapa 5 promove), fit/evidências/sinais vazios, linkedin/fonte sem dado real ainda.
 * Não duplica um lead já encontrado antes para o mesmo produto (US-014, "Repetir prospecção"): como os
 * dados fictícios são determinísticos (mesmo índice → mesmo nome), repetir com os mesmos critérios tende
 * a reconhecer todo mundo como já visto — comportamento esperado da demonstração, não um bug. */
function etapaEncontrarPessoas(prospeccaoId: string, criterios: Record<string, unknown>, produtoId: string): void {
  const contas = listarContas(prospeccaoId);
  const cargoCriterio = textoCriterio(criterios, "cargo");
  const cidadeCriterio = textoCriterio(criterios, "localizacao");
  const jaVistos = new Set(leadsDoProduto(produtoId).map((l) => chaveLead(l.nome, l.empresa, l.linkedin)));
  let indice = 0;
  function criarPessoa(contaId: string | null, empresa: string | null) {
    const nome = nomePessoaFicticia(indice);
    const cargo = cargoCriterio || CARGOS_PESSOA[indice % CARGOS_PESSOA.length];
    indice++;
    const chave = chaveLead(nome, empresa, null);
    if (jaVistos.has(chave)) return;
    jaVistos.add(chave);
    criarLead({
      prospeccaoId, contaId, nome, cargo, empresa, cidade: cidadeCriterio || null, linkedin: null, fonte: null,
      papel: "desconhecido", fit: null, evidencias: [], sinais: [], hipotese: null,
      status: "pesquisado", noCRM: false, demo: false,
    });
  }
  if (contas.length > 0) {
    for (const conta of contas) {
      criarPessoa(conta.id, conta.nome);
      criarPessoa(conta.id, conta.nome);
    }
  } else {
    for (let i = 0; i < 6; i++) criarPessoa(null, null);
  }
}

/** Etapa 5: único efeito real desta história — promove os leads recém-criados de "pesquisado" para
 * "qualificado" (sem calcular fit/evidências, que é da US-024). */
function etapaQualificar(prospeccaoId: string): void {
  for (const lead of listarLeads(prospeccaoId)) {
    if (lead.status === "pesquisado") atualizarLead(lead.id, { status: "qualificado" });
  }
}

/** Dispara o pipeline em segundo plano; nunca aguardada pela rota que cria a prospecção. */
export function iniciarExecucao(prospeccaoId: string): void {
  void executarPipeline(prospeccaoId);
}

/** Estado gravado pelo momento em que a checagem ocorre (nunca cacheado): uma "Cancelar" (US-014) só tem
 * efeito de verdade quando chega ENTRE duas etapas — hoje o pipeline inteiro roda no mesmo tick (nenhuma
 * etapa faz I/O real, ver comentário de topo), então na prática a checagem quase nunca encontra
 * "cancelada" a tempo; ela existe para o momento em que a US-015 trouxer I/O de rede de verdade entre as
 * etapas, e é o que faz um cancelamento não reverter para "pronta"/apagar o que já foi encontrado. */
function foiCancelada(prospeccaoId: string): boolean {
  return obterProspeccao(prospeccaoId)?.estado === "cancelada";
}

async function executarPipeline(prospeccaoId: string): Promise<void> {
  let rotuloEtapaAtual: string = ETAPAS_PROSPECCAO[0].rotulo;
  try {
    const prospeccao = obterProspeccao(prospeccaoId);
    if (!prospeccao) return; // apagada entre o POST e o início da execução: nada a fazer

    // Etapa 1: entendendo o produto — trabalho real é a leitura, sem nenhuma escrita.
    if (foiCancelada(prospeccaoId)) return;
    rotuloEtapaAtual = ETAPAS_PROSPECCAO[0].rotulo;
    atualizarProspeccao(prospeccaoId, { etapa: ETAPAS_PROSPECCAO[0].chave });
    obterProduto(prospeccao.produtoId);
    const icp = obterICP(prospeccao.icpId);
    const jornada: Jornada = icp?.jornada ?? "b2b";

    // Etapa 2: procurando empresas compatíveis.
    if (foiCancelada(prospeccaoId)) return;
    rotuloEtapaAtual = ETAPAS_PROSPECCAO[1].rotulo;
    atualizarProspeccao(prospeccaoId, { etapa: ETAPAS_PROSPECCAO[1].chave });
    etapaProcurarEmpresas(prospeccaoId, prospeccao.modo, jornada, prospeccao.criterios);

    // Etapa 3: analisando sinais públicos (sem persistência, ver comentário de topo).
    if (foiCancelada(prospeccaoId)) return;
    rotuloEtapaAtual = ETAPAS_PROSPECCAO[2].rotulo;
    atualizarProspeccao(prospeccaoId, { etapa: ETAPAS_PROSPECCAO[2].chave });
    analisarSinais(prospeccao.criterios, icp);

    // Etapa 4: encontrando pessoas-chave (não roda em "empresas" puro).
    if (foiCancelada(prospeccaoId)) return;
    rotuloEtapaAtual = ETAPAS_PROSPECCAO[3].rotulo;
    atualizarProspeccao(prospeccaoId, { etapa: ETAPAS_PROSPECCAO[3].chave });
    if (deveCriarPessoas(prospeccao.modo)) etapaEncontrarPessoas(prospeccaoId, prospeccao.criterios, prospeccao.produtoId);

    // Etapa 5: qualificando oportunidades.
    if (foiCancelada(prospeccaoId)) return;
    rotuloEtapaAtual = ETAPAS_PROSPECCAO[4].rotulo;
    atualizarProspeccao(prospeccaoId, { etapa: ETAPAS_PROSPECCAO[4].chave });
    etapaQualificar(prospeccaoId);

    if (foiCancelada(prospeccaoId)) return;
    atualizarProspeccao(prospeccaoId, { estado: "pronta", erro: null, concluidoEm: new Date().toISOString() });
  } catch (err) {
    console.error("Falha ao executar a prospecção", prospeccaoId, err);
    if (foiCancelada(prospeccaoId)) return;
    atualizarProspeccao(prospeccaoId, {
      estado: "pronta",
      erro: `Não foi possível concluir a etapa "${rotuloEtapaAtual}"; os resultados encontrados até aqui foram mantidos.`,
      concluidoEm: new Date().toISOString(),
    });
  }
}

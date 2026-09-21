// Prospecção em cinco etapas, com dados persistidos a cada avanço e resultados parciais preservados.
// Descoberta combina as fontes conectadas; a qualificação exige evidência para cada critério.
// Empresa única mantém seleção explícita. Demonstração só ocorre sem fontes reais conectadas.
import { ETAPAS_PROSPECCAO, etapasDaProspeccao } from "./execucao-etapas";
import { consultasDaProspeccao } from "./pesquisa-registro";
import { buscarNaWeb, descobertaAtiva, ErroDescoberta, lerPagina, perfilDePessoa, TetoConsultasAtingido } from "./descoberta";
import type { ResultadoBuscaWeb } from "./descoberta";
import { data } from "./formato";
import { ErroProspectHalo, prospectHaloAtivo } from "./prospecthalo";
import { pesquisarPessoas } from "./pesquisa-pessoas";
import { avaliarCriterios, calcularFit, dominioDe, inferirPapel, resumoDaPagina, sinaisEncontrados, sinalAntigo } from "./qualificacao";
import { avaliarCriterioInterpretativo, gerarHipoteseDor } from "./qualificacao-ia";
import { QUANTIDADES_EMPRESAS } from "./rotulos";
import { termoSensivel } from "./sensivel";
import { atualizarConta, atualizarLead, atualizarProspeccao, criarConta, criarLead, criarProspeccao, leadsDoProduto, listarContas, listarLeads, obterICP, obterProduto, obterProspeccao } from "./workspace";
import type { Conta, Evidencia, ICP, Jornada, ModoProspeccao, Prospeccao, SinalProspeccao } from "./types";

const MODOS_PROSPECCAO_VALIDOS: ModoProspeccao[] = ["empresas", "pessoas", "empresa_unica", "oportunidades"];

const QUANTIDADE_EMPRESAS_PADRAO = 10;
// 5 páginas de 10 resultados orgânicos = até 50 candidatas, a maior quantidade alvo possível.
const TETO_PAGINAS_BUSCA = 5;

const NOMES_EMPRESA = ["Nortis", "Aliança", "Vetor", "Cadence", "Plena", "Horizonte", "Mérito", "Élan", "Polar", "Cedro"];
const SUFIXOS_EMPRESA = ["Tecnologia", "Soluções", "Indústria", "Serviços", "Comércio", "Consultoria"];
const NOMES_PESSOA = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fábio", "Gabriela", "Heitor", "Isadora", "João", "Karina", "Leandro"];
const SOBRENOMES_PESSOA = ["Almeida", "Barros", "Costa", "Duarte", "Farias", "Gouveia", "Lopes", "Martins", "Nogueira", "Pereira", "Queiroz", "Ramos"];
const CARGOS_PESSOA = ["Gerente", "Diretor(a)", "Coordenador(a)", "Analista", "Head", "Especialista"];

/** Um catch "isolado" (falha ao ler UMA candidata não derruba a etapa inteira) nunca deve engolir o
 * teto de consultas (US-023): ele precisa propagar até o try/catch mais externo (executarPipeline),
 * que é quem sabe marcar a prospecção "pronta" com o aviso de orçamento. */
function propagarTeto(err: unknown): void {
  if (err instanceof TetoConsultasAtingido) throw err;
}

function propagarFalhaBusca(erro: unknown): void {
  if (erro instanceof ErroDescoberta && erro.codigo === "sem_resultado") return;
  throw erro;
}


function textoCriterio(criterios: Record<string, unknown>, chave: string): string {
  const v = criterios[chave];
  return typeof v === "string" ? v.trim() : "";
}

/** Evidências de uma CONTA (US-024): os critérios objetivos de sempre (`avaliarCriterios`, determinístico)
 * mais "Outros critérios" — o texto livre do ICP (`criterios.outros`, B2B), interpretativo, avaliado por
 * IA (`lib/qualificacao-ia.ts`) só quando o ICP preencheu esse campo. Sem ele (a maioria dos ICPs hoje),
 * o comportamento é idêntico ao de antes desta história. */
async function avaliarComOutros(conteudo: string, criteriosObjetivos: { criterio: string; valor: string }[], icp: ICP | null): Promise<Evidencia[]> {
  const base = avaliarCriterios(conteudo, criteriosObjetivos);
  const outros = await avaliarCriterioInterpretativo(conteudo, "Outros critérios", icp?.criterios.outros);
  return outros ? [...base, outros] : base;
}

/** Qualificação B2C (US-028): "critério sem dado nunca conta como atendido" já existia; esta é a mesma
 * ideia para dado pessoal SENSÍVEL — um critério cujo valor bate na lista fechada de `lib/sensivel.ts`
 * (ex.: um "interesse" ou "contexto" que descreve religião/orientação/saúde), ou cujo `trecho` citado pela
 * IA interpretativa cita um termo assim, nunca vira evidência: a evidência inteira é OMITIDA (não marcada
 * "nao_atende"/"atende"), com o motivo em `console.error` — nunca na tela. */
function omitirEvidenciasSensiveis(evidencias: Evidencia[]): Evidencia[] {
  return evidencias.filter((e) => {
    const achado = termoSensivel(e.valor) ?? (e.trecho ? termoSensivel(e.trecho) : null);
    if (!achado) return true;
    console.error(`Evidência B2C omitida por termo de categoria sensível (${achado.categoria}: "${achado.termo}") no critério "${e.criterio}".`);
    return false;
  });
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

function quantidadeAlvo(criterios: Record<string, unknown>): number {
  const bruta = Number(criterios.quantidade);
  return (QUANTIDADES_EMPRESAS as readonly number[]).includes(bruta) ? bruta : QUANTIDADE_EMPRESAS_PADRAO;
}

/** Resultados de `buscarNaWeb`, paginados (US-017: "quantidade alvo" pode passar da 1ª página de 10) e
 * unificados por domínio ("empresas repetidas entre consultas são unificadas pelo domínio do site").
 * Em demonstração, `buscarNaWeb` sempre devolve os 3 mesmos resultados fixos — não pagina (AC "em
 * demonstração, 3 empresas de exemplo"), só deduplica. */
async function buscarCandidatasDeduplicadas(consulta: string, alvo: number, prospeccaoId: string): Promise<{ itens: ResultadoBuscaWeb[]; demo: boolean }> {
  const primeira = await buscarNaWeb(consulta, 0, prospeccaoId);
  if (primeira.demo) return { itens: primeira.itens, demo: true };

  const vistos = new Set<string>();
  const candidatas: ResultadoBuscaWeb[] = [];
  function acrescentar(itens: ResultadoBuscaWeb[]) {
    for (const item of itens) {
      const dom = dominioDe(item.url);
      if (!dom || vistos.has(dom)) continue;
      vistos.add(dom);
      candidatas.push(item);
    }
  }
  acrescentar(primeira.itens);

  let pagina = 1;
  while (candidatas.length < alvo && pagina < TETO_PAGINAS_BUSCA) {
    let resposta;
    try {
      resposta = await buscarNaWeb(consulta, pagina, prospeccaoId);
    } catch (err) {
      propagarTeto(err);
      break; // sem mais páginas (ou falha na próxima): fica com o que já achou até aqui
    }
    if (!resposta.itens.length) break;
    acrescentar(resposta.itens);
    pagina++;
  }
  return { itens: candidatas.slice(0, alvo), demo: false };
}

/** Nome da candidata a partir do título do resultado de busca (limpo de sufixos comuns de página
 * institucional, ex.: "Empresa X - Início" → "Empresa X"); sem título, cai no domínio. */
function nomeDaEmpresa(candidata: ResultadoBuscaWeb): string {
  const titulo = candidata.titulo.split(/\s[-–|]\s/)[0]?.trim();
  return titulo || dominioDe(candidata.url) || candidata.url;
}

/** Conteúdo institucional de demonstração PRÓPRIO deste modo (não o `conteudoPaginaDemo` genérico de
 * `lib/descoberta.ts`, usado por toda leitura de página sem distinguir o que está sendo lido): 2 de
 * cada 3 candidatas "atendem" aos critérios pedidos e 1 não tem nada verificável — mesma variação de
 * fit (alta/média/baixa) que `lib/demo.ts:criarProspeccaoExemplo` já usa para o exemplo semeado. */
function conteudoDemoDaCandidata(indice: number, segmento: string, porte: string, localizacao: string, sinal: string | undefined): string {
  if (indice % 3 === 2) return "Empresa de demonstração, sem informações públicas suficientes para confirmar os critérios pedidos.";
  const partes = [segmento && `Atuação: ${segmento}.`, porte && `Porte: ${porte}.`, localizacao && `Sede em ${localizacao}.`, sinal && `Processo seletivo aberto: ${sinal}.`].filter(Boolean);
  return `Empresa de demonstração. ${partes.join(" ")}`;
}

/** Etapa 2, modo "empresas" (US-017): busca na web a partir de segmento/localização/porte, lê a página
 * institucional de cada candidata e qualifica por evidências (lib/qualificacao.ts) — primeiro modo com
 * fit/evidências/sinais de verdade (os demais continuam fictícios, ver fronteira no topo do arquivo).
 * Falha ao ler uma candidata isolada não derruba a etapa inteira (mesmo espírito de descobrirEmLote em
 * lib/descoberta.ts): a candidata só é descartada. */
async function buscarContasReais(prospeccaoId: string, criterios: Record<string, unknown>, icp: ICP | null): Promise<void> {
  const segmento = textoCriterio(criterios, "segmento");
  const localizacao = textoCriterio(criterios, "localizacao");
  const porte = textoCriterio(criterios, "porte");
  const sinaisDoCriterio = Array.isArray(criterios.sinais) ? criterios.sinais.filter((s): s is string => typeof s === "string") : [];
  const sinaisAlvo = Array.from(new Set([...sinaisDoCriterio, ...(icp?.sinais ?? [])]));

  const consulta = ["empresas", segmento, localizacao, porte].filter(Boolean).join(" ") || "empresas";
  const { itens: candidatas, demo: buscaDemo } = await buscarCandidatasDeduplicadas(consulta, quantidadeAlvo(criterios), prospeccaoId);

  for (const [indice, candidata] of candidatas.entries()) {
    let pagina;
    try {
      pagina = await lerPagina(candidata.url, prospeccaoId, candidata.resumo);
    } catch (err) {
      propagarTeto(err);
      console.error("Falha ao ler página institucional de uma candidata:", candidata.url, err instanceof Error ? err.message : err);
      continue;
    }
    const conteudo = buscaDemo ? conteudoDemoDaCandidata(indice, segmento, porte, localizacao, sinaisAlvo[0]) : pagina.conteudo || candidata.resumo;
    const evidencias = await avaliarComOutros(conteudo, [
      { criterio: "Segmento", valor: segmento },
      { criterio: "Porte", valor: porte },
      { criterio: "Localização", valor: localizacao },
    ], icp);
    criarConta({
      prospeccaoId,
      nome: buscaDemo ? nomeEmpresaFicticia(segmento, indice) : nomeDaEmpresa(candidata),
      site: candidata.url,
      setor: segmento || null,
      porte: porte || null,
      cidade: localizacao || null,
      fit: calcularFit(evidencias),
      evidencias,
      sinais: sinaisEncontrados(conteudo, sinaisAlvo, pagina.origem, pagina.consultadoEm),
      resumo: resumoDaPagina(conteudo),
      demo: pagina.demo,
    });
  }
}

function diasAtras(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/** "Incluir apenas quem tem sinais recentes" (US-012): com a chave ligada, um sinal com mais de 90 dias
 * (lib/qualificacao.ts:sinalAntigo) não é só marcado como antigo na tela — ele é descartado aqui, antes
 * de a conta/pessoa nascer ("não entram", AC da US-020). Sem a chave, todo sinal encontrado entra (a
 * tela é quem mostra o selo "Antigo" nesse caso). */
function filtrarSinaisRecentes(sinais: SinalProspeccao[], somenteRecentes: boolean): SinalProspeccao[] {
  return somenteRecentes ? sinais.filter((s) => !sinalAntigo(s)) : sinais;
}

/** Sinais e critérios comuns às duas jornadas do modo "oportunidades" (US-020): sinais do ICP e dos
 * critérios da busca, unificados e sem repetição; "recorte" é segmento em B2B e localização em B2C
 * (mesmo campo único do passo 4, `components/CriteriosProspeccao.tsx`). */
function sinaisERecorte(criterios: Record<string, unknown>, icp: ICP | null): { sinaisAlvo: string[]; recorte: string; somenteRecentes: boolean } {
  const sinaisDoCriterio = Array.isArray(criterios.sinais) ? criterios.sinais.filter((s): s is string => typeof s === "string") : [];
  return {
    sinaisAlvo: Array.from(new Set([...sinaisDoCriterio, ...(icp?.sinais ?? [])])),
    recorte: textoCriterio(criterios, "recorte"),
    somenteRecentes: Boolean(criterios.somenteRecentes),
  };
}

/** Dias de afastamento de um sinal de demonstração por índice: a busca de demonstração (`resultadosBuscaDemo`,
 * `lib/demo.ts`) sempre devolve as MESMAS 3 candidatas fixas — para as 3 exercitarem os três resultados
 * possíveis de "oportunidades" mesmo sendo só 3, o índice 0 é recente, o 1 é "antigo" (mais de
 * DIAS_SINAL_ANTIGO) e o 2 não tem sinal nenhum (descartado). */
function diasDemoOportunidade(indice: number): number | null {
  if (indice === 0) return 15;
  if (indice === 1) return 115;
  return null;
}

/** Conteúdo institucional de demonstração PRÓPRIO do modo "oportunidades" (mesmo motivo do
 * `conteudoDemoDaCandidata` do modo "empresas": precisa citar um sinal de verdade, com uma data no
 * texto, para `sinaisEncontrados`/`dataDoSinal` (lib/qualificacao.ts) terem o que achar). A data é
 * relativa a HOJE (nunca fixa, AC da US-020), nunca um texto solto. */
function conteudoDemoDaOportunidade(indice: number, recorte: string, sinal: string): string {
  const dias = diasDemoOportunidade(indice);
  if (dias === null) return "Empresa de demonstração, sem sinais públicos recentes.";
  const dataTexto = data(diasAtras(dias), { comAno: true });
  return `Empresa de demonstração${recorte ? ` do segmento ${recorte}` : ""}. ${sinal} em ${dataTexto}.`;
}

/** Mesma ideia de `conteudoDemoDaOportunidade`, para o perfil de uma pessoa física (B2C). */
function conteudoDemoDaPessoaOportunidade(indice: number, recorte: string, sinal: string): string {
  const dias = diasDemoOportunidade(indice);
  if (dias === null) return "Perfil de demonstração, sem sinais públicos recentes.";
  const dataTexto = data(diasAtras(dias), { comAno: true });
  return `Perfil de demonstração${recorte ? ` em ${recorte}` : ""}. ${sinal} em ${dataTexto}.`;
}

/** Etapa 2, modo "oportunidades" em B2B (US-020): mesma busca paginada + leitura institucional de
 * `buscarContasReais` (US-017), mas a consulta é montada a partir dos SINAIS de intenção do ICP/critérios
 * ("empresas... que os apresentem", AC), não de segmento/porte em geral. Uma candidata só vira `Conta`
 * quando sobra pelo menos um sinal depois do filtro "somente recentes" — sem isso ela não é uma
 * oportunidade, é só mais uma empresa do segmento (isso já é o modo "empresas"). */
async function buscarOportunidadesEmpresas(prospeccaoId: string, criterios: Record<string, unknown>, icp: ICP | null): Promise<void> {
  const { sinaisAlvo, recorte, somenteRecentes } = sinaisERecorte(criterios, icp);
  if (sinaisAlvo.length === 0) return; // sem nenhum sinal de intenção, não há o que procurar neste modo

  const consulta = ["empresas", recorte, ...sinaisAlvo].filter(Boolean).join(" ");
  const { itens: candidatas, demo: buscaDemo } = await buscarCandidatasDeduplicadas(consulta, quantidadeAlvo(criterios), prospeccaoId);

  for (const [indice, candidata] of candidatas.entries()) {
    let pagina;
    try {
      pagina = await lerPagina(candidata.url, prospeccaoId, candidata.resumo);
    } catch (err) {
      propagarTeto(err);
      console.error("Falha ao ler página institucional de uma candidata a oportunidade:", candidata.url, err instanceof Error ? err.message : err);
      continue;
    }
    const sinalPrincipal = sinaisAlvo[indice % sinaisAlvo.length];
    const conteudo = buscaDemo ? conteudoDemoDaOportunidade(indice, recorte, sinalPrincipal) : pagina.conteudo || candidata.resumo;
    const sinais = filtrarSinaisRecentes(sinaisEncontrados(conteudo, sinaisAlvo, pagina.origem, pagina.consultadoEm), somenteRecentes);
    if (sinais.length === 0) continue; // sem sinal nenhum (ou só antigo, com o filtro ligado): não é uma oportunidade

    const evidencias = avaliarCriterios(conteudo, [{ criterio: "Segmento", valor: recorte }]);
    criarConta({
      prospeccaoId,
      nome: buscaDemo ? nomeEmpresaFicticia(recorte, indice) : nomeDaEmpresa(candidata),
      site: candidata.url,
      setor: recorte || null,
      porte: null,
      cidade: null,
      fit: calcularFit(evidencias),
      evidencias,
      sinais,
      resumo: resumoDaPagina(conteudo),
      demo: pagina.demo,
    });
  }
}

// Modo "oportunidades" (US-020): teto de CONTAS cujas pessoas-chave também são buscadas — não de
// pessoas em si. Sem ele, uma "quantidade alvo" de 50 empresas multiplicaria em até 250 buscas de
// pessoa numa única prospecção (sem orçamento ainda, US-023 é quem deve trazer um limite de verdade).
const TETO_CONTAS_PESSOAS_OPORTUNIDADE = 5;

/** Conteúdo institucional de demonstração PRÓPRIO do modo "Explorar uma empresa" (mesmo motivo do
 * `conteudoDemoDaCandidata` do modo "empresas": o `conteudoPaginaDemo` genérico de `lib/descoberta.ts`
 * não cita os critérios pedidos e não renderia evidências coerentes). Diferente do modo "empresas" (que
 * varia fit entre as várias candidatas para mostrar diversidade numa lista), aqui há só uma empresa —
 * a que a própria pessoa escolheu explorar — então o conteúdo sempre confirma os critérios que existirem. */
function conteudoDemoDaEmpresaUnica(nome: string, segmento: string, porte: string, localizacao: string, sinal: string | undefined): string {
  const partes = [segmento && `Atuação: ${segmento}.`, porte && `Porte: ${porte}.`, localizacao && `Sede em ${localizacao}.`, sinal && `Processo seletivo aberto: ${sinal}.`].filter(Boolean);
  return `Empresa de demonstração para ${nome}. ${partes.join(" ")}`.trim();
}

/** Entrada "parece um endereço" (mesma heurística simples já usada por `lib/produto-ia.ts`): começa com
 * http(s) ou não tem espaço e tem um ponto — o suficiente para distinguir "Zetta Manutenção Industrial"
 * (nome) de "zettamanutencao.com.br" (site), sem exigir que a pessoa saiba qual dos dois está digitando. */
function pareceEndereco(texto: string): boolean {
  return /^https?:\/\//i.test(texto) || (!texto.includes(" ") && texto.includes("."));
}

/** Etapa 2, modo "empresa_unica" (US-018): resolve o nome/site informado para uma única `Conta`, com
 * fit/evidências/sinais reais a partir da própria página institucional — mesma qualificação de
 * `buscarContasReais` (lib/qualificacao.ts), só que para UMA empresa escolhida pela pessoa em vez de uma
 * lista. Os critérios comparados vêm do ICP (segmento/porte/localização), não de `criterios` — o passo 4
 * deste modo só pede o nome da empresa (US-012), sem redigitar os critérios do perfil. Sem página
 * encontrada/legível, a conta ainda nasce (fit "media", sem evidências) — "explorar" nunca falha por
 * completo só porque a leitura pública não deu certo. */
// As duas mensagens abaixo marcam uma conta que nasceu SEM informação de página pública: são a condição
// para a ficha explicar a ausência de dados públicos sobre a
// organização, sem nunca sobrescrever um resumo real já lido da própria página institucional.
const RESUMO_SEM_SITE = "Não encontramos uma página pública para confirmar critérios desta empresa.";
const RESUMO_SITE_ILEGIVEL = "Não foi possível ler a página pública desta empresa.";

async function buscarContaUnicaReal(prospeccaoId: string, criterios: Record<string, unknown>, icp: ICP | null): Promise<Conta> {
  const nome = textoCriterio(criterios, "empresaNome") || "Empresa sem nome informado";
  const segmento = icp?.criterios.setor || "";
  const localizacao = icp?.criterios.localizacao || "";
  const porte = icp?.criterios.porte || "";
  const sinaisAlvo = icp?.sinais ?? [];
  const base = { prospeccaoId, nome, setor: segmento || null, porte: porte || null, cidade: localizacao || null };

  let site = pareceEndereco(nome) ? (nome.startsWith("http") ? nome : `https://${nome}`) : null;
  let buscaDemo = false;
  if (!site && (descobertaAtiva() || !prospectHaloAtivo())) {
    try {
      const busca = await buscarNaWeb(`${nome} site institucional`, 0, prospeccaoId);
      buscaDemo = busca.demo;
      site = busca.itens[0]?.url ?? null;
    } catch (err) {
      propagarTeto(err);
      console.error("Falha ao localizar o site institucional para explorar a empresa:", nome, err instanceof Error ? err.message : err);
    }
  }
  if (!site) {
    return criarConta({ ...base, site: null, fit: "media", evidencias: [], sinais: [], resumo: RESUMO_SEM_SITE, demo: false });
  }

  let pagina;
  try {
    pagina = await lerPagina(site, prospeccaoId);
  } catch (err) {
    propagarTeto(err);
    console.error("Falha ao ler a página institucional para explorar a empresa:", site, err instanceof Error ? err.message : err);
    return criarConta({ ...base, site, fit: "media", evidencias: [], sinais: [], resumo: RESUMO_SITE_ILEGIVEL, demo: false });
  }

  const demo = buscaDemo || pagina.demo;
  const conteudo = demo ? conteudoDemoDaEmpresaUnica(nome, segmento, porte, localizacao, sinaisAlvo[0]) : pagina.conteudo;
  const evidencias = await avaliarComOutros(conteudo, [
    { criterio: "Segmento", valor: segmento },
    { criterio: "Porte", valor: porte },
    { criterio: "Localização", valor: localizacao },
  ], icp);
  return criarConta({
    ...base,
    site,
    fit: calcularFit(evidencias),
    evidencias,
    sinais: sinaisEncontrados(conteudo, sinaisAlvo, pagina.origem, pagina.consultadoEm),
    resumo: resumoDaPagina(conteudo),
    demo,
  });
}

/** Etapa 2: cria as contas (empresas) compatíveis com os critérios recebidos. */
async function etapaProcurarEmpresas(prospeccaoId: string, modo: ModoProspeccao, jornada: Jornada, criterios: Record<string, unknown>, icp: ICP | null): Promise<void> {
  if (!deveCriarContas(modo, jornada)) return;
  if (modo === "empresas") {
    await buscarContasReais(prospeccaoId, criterios, icp);
    return;
  }
  if (modo === "empresa_unica") {
    await buscarContaUnicaReal(prospeccaoId, criterios, icp);
    return;
  }
  if (modo === "oportunidades") {
    await buscarOportunidadesEmpresas(prospeccaoId, criterios, icp);
    return;
  }
  // modo === "pessoas" (só chega aqui em B2B, por deveCriarContas): a conta de cada pessoa nasce sob
  // demanda na etapa 4 (buscarPessoasReais).
}

/** Pesquisa específica de sinais das empresas, além da página institucional inicial. */
async function analisarSinais(prospeccaoId: string, criterios: Record<string, unknown>, icp: ICP | null): Promise<void> {
  const doCriterio = Array.isArray(criterios.sinais) ? criterios.sinais.filter((s): s is string => typeof s === "string") : [];
  const sinaisAlvo = [...new Set([...doCriterio, ...(icp?.sinais ?? [])])];
  if (!sinaisAlvo.length || !descobertaAtiva()) return;
  for (const conta of listarContas(prospeccaoId)) {
    if (conta.demo || foiCancelada(prospeccaoId)) continue;
    try {
      const busca = await buscarNaWeb(`"${conta.nome}" (${sinaisAlvo.map(s => `"${s}"`).join(" OR ")})`, 0, prospeccaoId);
      const sinais = [...conta.sinais];
      for (const item of busca.itens.slice(0, 2)) {
        let conteudo = item.resumo;
        try { conteudo = (await lerPagina(item.url, prospeccaoId, item.resumo)).conteudo; } catch { /* Conserva somente o trecho obtido. */ }
        if (!conteudo.toLocaleLowerCase().includes(conta.nome.toLocaleLowerCase())) continue;
        for (const sinal of filtrarSinaisRecentes(sinaisEncontrados(conteudo, sinaisAlvo, item.url, busca.consultadoEm), Boolean(criterios.somenteRecentes))) {
          if (!sinais.some(s => s.origem === sinal.origem && s.descricao === sinal.descricao)) sinais.push(sinal);
        }
      }
      atualizarConta(conta.id, { sinais });
    } catch { /* Falhas de fornecedores já estão no diagnóstico; conserva a pesquisa inicial. */ }
  }
}

/** Identidade de um lead para reconhecer "já visto" (US-014): LinkedIn quando existe (mais específico);
 * sem ele, nome + empresa normalizados (minúsculas, sem espaço nas pontas) — mesmo espírito de chavePerfil
 * em lib/leads-vistos.ts, só que pela identidade da PESSOA, não pelo perfil da busca. */
function chaveLead(nome: string, empresa: string | null, linkedin: string | null): string {
  if (linkedin?.trim()) {
    try { const u = new URL(linkedin); return `linkedin:${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`.toLowerCase(); }
    catch { return `linkedin:${linkedin.trim().toLowerCase()}`; }
  }
  return `nome:${nome.trim().toLowerCase()}|${String(empresa || "").trim().toLowerCase()}`;
}

// Modo "empresa_unica" (US-018): no máximo 5 pessoas-chave por empresa explorada — teto pequeno de
// propósito (é uma busca focada numa única empresa, não uma lista para rolar).
const TETO_PESSOAS_CHAVE = 5;

/** Nome e cargo a partir do título de um resultado de busca por perfil (formato típico de busca por
 * `site:linkedin.com/in`: "Nome Sobrenome - Cargo - Empresa | LinkedIn", às vezes só "Nome Sobrenome |
 * LinkedIn"): descarta o sufixo do serviço (depois do `|`) e lê o primeiro segmento como nome, o segundo
 * (se existir) como cargo. */
function pessoaDoResultado(item: ResultadoBuscaWeb): { nome: string; cargo: string | null; empresa: string | null } {
  if (item.pessoa) return item.pessoa;
  const titulo = item.titulo.split("|")[0].trim();
  const partes = titulo.split(/\s[-–]\s/).map((p) => p.trim()).filter(Boolean);
  return { nome: partes[0] || titulo, cargo: partes[1] || null, empresa: partes[2] || null };
}

/** Pessoas-chave de demonstração PRÓPRIAS deste modo (mesmo motivo de `conteudoDemoDaEmpresaUnica`):
 * nomes e cargos plausíveis, variados o bastante para exercitar as três classificações de papel. */
function pessoasChaveDemo(): { nome: string; cargo: string | null; linkedin: string | null }[] {
  return [0, 1, 2].map((i) => ({ nome: nomePessoaFicticia(i), cargo: CARGOS_PESSOA[i % CARGOS_PESSOA.length], linkedin: null }));
}

/** Empresa única: contatos de todas as fontes, seleção explícita preservada. */
async function buscarPessoasChaveUnica(prospeccaoId: string, conta: Conta, produtoId: string, personas: string[]): Promise<void> {
  await adicionarPessoasDaConta(prospeccaoId, conta, produtoId, personas, "novo");
}

async function adicionarPessoasDaConta(prospeccaoId: string, conta: Conta, produtoId: string, personas: string[], status: "novo" | "pesquisado"): Promise<void> {
  const jaVistos = new Set(leadsDoProduto(produtoId).map(l => chaveLead(l.nome, l.empresa, l.linkedin)));
  const resultado = conta.demo
    ? { itens: [] as ResultadoBuscaWeb[], demo: true, consultadoEm: new Date().toISOString() }
    : await pesquisarPessoas({ empresa: conta.nome, cargo: personas.join(" ou "), quantidade: TETO_PESSOAS_CHAVE }, prospeccaoId);
  const candidatos = resultado.demo ? pessoasChaveDemo().map(p => ({ ...p, item: undefined as ResultadoBuscaWeb | undefined }))
    : resultado.itens.map(item => ({ ...pessoaDoResultado(item), linkedin: item.url, item }));
  let criados = 0;
  for (const candidato of candidatos) {
    if (foiCancelada(prospeccaoId)) return;
    if (criados >= TETO_PESSOAS_CHAVE || !candidato.nome) continue;
    const chave = chaveLead(candidato.nome, conta.nome, candidato.linkedin);
    if (jaVistos.has(chave)) continue;
    jaVistos.add(chave);
    const conteudo = candidato.item ? await conteudoDaPessoa(candidato.item, prospeccaoId) : "";
    if (foiCancelada(prospeccaoId)) return;
    const evidenciasPessoa = avaliarCriterios(conteudo, [{ criterio: "Empresa atual", valor: conta.nome }]);
    criarLead({
      prospeccaoId, contaId: conta.id, nome: candidato.nome, cargo: candidato.cargo, empresa: conta.nome, cidade: conta.cidade,
      linkedin: candidato.linkedin, fonte: resultado.demo ? null : `${(candidato.item?.fontes ?? ["busca pública"]).join(", ")} · ${candidato.linkedin}`,
      papel: inferirPapel(candidato.cargo, personas), fit: conta.fit,
      evidencias: [...conta.evidencias, ...evidenciasPessoa], sinais: conta.sinais, hipotese: null,
      status, noCRM: false, demo: resultado.demo,
    });
    criados++;
  }
}

/** Usa só conteúdo coletado; falha de leitura conserva o trecho real e a origem da busca. */
async function conteudoDaPessoa(item: ResultadoBuscaWeb, prospeccaoId: string): Promise<string> {
  if (item.conteudoPerfil) return item.conteudoPerfil;
  const trecho = [item.titulo, item.resumo].filter(Boolean).join(". ");
  if (item.pessoa?.cargo && item.pessoa.empresa) return trecho;
  if (!descobertaAtiva()) return trecho;
  try { return (await perfilDePessoa(item.url, prospeccaoId, trecho)).conteudo; }
  catch { return trecho; }
}

/** Etapa 4, modo "oportunidades" em B2B (US-020): pessoas-chave de cada conta encontrada por
 * `buscarOportunidadesEmpresas` — mesma busca `site:linkedin.com/in` de `buscarPessoasChaveUnica`
 * (US-018), aplicada a VÁRIAS empresas (até `TETO_CONTAS_PESSOAS_OPORTUNIDADE`) em vez de uma só. Não
 * reaproveita `buscarPessoasChaveUnica` diretamente por duas diferenças de propósito: aqui a pessoa
 * nasce `status: "pesquisado"` (a etapa 5 promove a "qualificado" como em qualquer outro modo automático
 * — "Explorar uma empresa" é uma busca manual e pontual, cujo `"novo"` exige seleção explícita antes de
 * contar como lead da prospecção; "oportunidades" não tem essa tela intermediária), e o "já visto"
 * (`jaVistos`) é compartilhado por TODAS as contas do laço, não reiniciado a cada uma. */
async function buscarPessoasOportunidadesEmpresas(prospeccaoId: string, produtoId: string, personas: string[]): Promise<void> {
  for (const conta of listarContas(prospeccaoId).slice(0, TETO_CONTAS_PESSOAS_OPORTUNIDADE)) {
    try { await adicionarPessoasDaConta(prospeccaoId, conta, produtoId, personas, "pesquisado"); }
    catch { /* As falhas já estão registradas; as demais empresas continuam sendo pesquisadas. */ }
  }
}

// Teto de pessoas do modo "pessoas" (US-019) — mesmo espírito do TETO_PESSOAS_CHAVE da US-018, um pouco
// maior porque aqui a busca não é focada numa única empresa. Reaproveitado pelo modo "oportunidades" em
// B2C (US-020), que busca pessoas soltas do mesmo jeito (sem conta).
const TETO_PESSOAS_MODO = 10;

/** Etapa 4, modo "oportunidades" em B2C (US-020): pessoas físicas com um sinal de intenção público, sem
 * conta (a jornada B2C não tem empresa como unidade) — mesma busca pública `site:linkedin.com/in` de
 * `buscarPessoasReais` (US-019), mas os termos citados/comparados são os SINAIS do ICP/critérios, não
 * cargo. Primeiro uso de `perfilDePessoa` (lib/descoberta.ts) no app: até aqui toda leitura de página
 * (institucional ou de perfil) passava por `lerPagina`, porque nenhum modo anterior lia o perfil de uma
 * pessoa isoladamente, sem conta. Só vira `LeadProspeccao` quem sobra com pelo menos um sinal depois do
 * filtro "somente recentes" — mesma regra de `buscarOportunidadesEmpresas`. Papel sempre "desconhecido"
 * (B2C não classifica papel de decisão; a qualificação completa desta jornada é da US-021). */
async function buscarPessoasOportunidadesB2C(prospeccaoId: string, criterios: Record<string, unknown>, icp: ICP | null, produtoId: string): Promise<void> {
  const { sinaisAlvo, recorte, somenteRecentes } = sinaisERecorte(criterios, icp);
  if (sinaisAlvo.length === 0) return;
  const jaVistos = new Set(leadsDoProduto(produtoId).map((l) => chaveLead(l.nome, l.empresa, l.linkedin)));

  const consulta = ["site:linkedin.com/in", recorte, ...sinaisAlvo].filter(Boolean).join(" ");
  let resultado;
  try {
    resultado = await buscarNaWeb(consulta, 0, prospeccaoId);
  } catch (err) {
    propagarFalhaBusca(err);
    console.error("Falha na busca pública de oportunidades (B2C):", err instanceof Error ? err.message : err);
    return;
  }
  const candidatos = resultado.demo
    ? pessoasChaveDemo().map((p, i) => ({ ...p, empresa: null as string | null, linkedin: `https://www.linkedin.com/in/perfil-exemplo-${i + 1}` }))
    : resultado.itens.map((item) => ({ ...pessoaDoResultado(item), linkedin: item.url }));

  let criados = 0;
  for (const [indice, candidato] of candidatos.entries()) {
    if (criados >= TETO_PESSOAS_MODO || !candidato.nome) continue;
    const chave = chaveLead(candidato.nome, null, candidato.linkedin);
    if (jaVistos.has(chave)) continue;

    const sinalPrincipal = sinaisAlvo[indice % sinaisAlvo.length];
    let conteudo: string;
    let origem: string;
    let consultadoEm: string;
    let demoFinal: boolean;
    if (resultado.demo) {
      conteudo = conteudoDemoDaPessoaOportunidade(indice, recorte, sinalPrincipal);
      origem = candidato.linkedin;
      consultadoEm = resultado.consultadoEm;
      demoFinal = true;
    } else {
      let perfil;
      try {
        perfil = await perfilDePessoa(candidato.linkedin, prospeccaoId, resultado.itens.find(item => item.url === candidato.linkedin)?.resumo);
      } catch (err) {
        propagarTeto(err);
        console.error("Falha ao ler perfil público de uma pessoa (oportunidades B2C):", candidato.linkedin, err instanceof Error ? err.message : err);
        continue;
      }
      // Um perfil de demonstração não pode vazar para dentro de uma busca já real: substitui pelo
      // conteúdo demo PRÓPRIO deste modo (com sinal e data), nunca `perfil.conteudo` genérico.
      conteudo = perfil.demo ? conteudoDemoDaPessoaOportunidade(indice, recorte, sinalPrincipal) : perfil.conteudo;
      origem = perfil.origem;
      consultadoEm = perfil.consultadoEm;
      demoFinal = perfil.demo;
    }

    const sinais = filtrarSinaisRecentes(sinaisEncontrados(conteudo, sinaisAlvo, origem, consultadoEm), somenteRecentes);
    if (sinais.length === 0) continue;
    jaVistos.add(chave);
    const evidencias = avaliarCriterios(conteudo, [{ criterio: "Localização", valor: recorte }]);
    criarLead({
      prospeccaoId, contaId: null, nome: candidato.nome, cargo: candidato.cargo, empresa: null,
      cidade: recorte || null, linkedin: candidato.linkedin,
      fonte: demoFinal ? null : origemPessoa(dominioDe(candidato.linkedin), consultadoEm),
      papel: "desconhecido", fit: calcularFit(evidencias), evidencias, sinais, hipotese: null,
      status: "pesquisado", noCRM: false, demo: demoFinal,
    });
    criados++;
  }
}

/** Conteúdo de demonstração PRÓPRIO do modo "pessoas" em B2C (US-021): confirma os critérios do PERFIL
 * (ocupação, localização, interesses), nunca um sinal de intenção — diferente de "oportunidades" B2C
 * (US-020), aqui não há sinal obrigatório para a pessoa entrar na lista, só combinar com o perfil ideal. */
function conteudoDemoDaPessoaB2C(indice: number, ocupacao: string, localizacao: string, interesses: string[]): string {
  if (indice % 3 === 2) return "Perfil de demonstração, sem informações públicas suficientes para confirmar os critérios pedidos.";
  const partes = [ocupacao && `Ocupação: ${ocupacao}.`, localizacao && `Mora em ${localizacao}.`, interesses.length > 0 && `Interesses públicos: ${interesses.join(", ")}.`].filter(Boolean);
  return `Perfil de demonstração. ${partes.join(" ")}`;
}

/** Etapa 4, modo "pessoas" em B2C (US-021 trouxe a descoberta real; US-024 apertou a qualificação):
 * pessoas físicas encontradas por localização, ocupação, interesses e contexto públicos (critérios da
 * US-006) — nunca uma `Conta` (a jornada B2C usa a pessoa como unidade). Mesma técnica de busca pública
 * `site:linkedin.com/in` + leitura por `perfilDePessoa` de `buscarPessoasOportunidadesB2C` (US-020), mas
 * os termos comparados são os do PERFIL, não sinais de intenção. Até a US-024, uma pessoa sem nenhuma
 * evidência ainda entrava na lista (fit "media"); a AC "um lead sem nenhuma evidência verificável não
 * entra na lista" substitui essa decisão — agora ela é descartada, igual a "oportunidades" (US-020), só
 * que a condição de entrada é evidência (fit), não sinal. Sinais do ICP ainda são extraídos quando
 * aparecem no texto (alimentam a coluna "Sinal" da lista), mas continuam sem ser condição de entrada.
 * Papel sempre "desconhecido" (B2C não classifica papel de decisão). */
async function buscarPessoasB2C(prospeccaoId: string, criterios: Record<string, unknown>, icp: ICP | null, produtoId: string): Promise<void> {
  const localizacao = textoCriterio(criterios, "localizacao");
  const ocupacao = textoCriterio(criterios, "ocupacao");
  const contexto = textoCriterio(criterios, "contexto");
  const interesses = Array.isArray(criterios.interesses) ? criterios.interesses.filter((s): s is string => typeof s === "string") : [];
  const sinaisAlvo = icp?.sinais ?? [];
  const jaVistos = new Set(leadsDoProduto(produtoId).map((l) => chaveLead(l.nome, l.empresa, l.linkedin)));

  const consulta = ["site:linkedin.com/in", ocupacao, localizacao, ...interesses].filter(Boolean).join(" ");
  let resultado;
  try {
    resultado = await buscarNaWeb(consulta, 0, prospeccaoId);
  } catch (err) {
    propagarFalhaBusca(err);
    console.error("Falha na busca pública de pessoas (B2C):", err instanceof Error ? err.message : err);
    return;
  }
  const candidatos = resultado.demo
    ? pessoasChaveDemo().map((p, i) => ({ ...p, linkedin: `https://www.linkedin.com/in/perfil-exemplo-${i + 1}` }))
    : resultado.itens.map((item) => ({ ...pessoaDoResultado(item), linkedin: item.url }));

  let criados = 0;
  for (const [indice, candidato] of candidatos.entries()) {
    if (criados >= TETO_PESSOAS_MODO || !candidato.nome) continue;
    const chave = chaveLead(candidato.nome, null, candidato.linkedin);
    if (jaVistos.has(chave)) continue;

    let conteudo: string;
    let origem: string;
    let consultadoEm: string;
    let demo: boolean;
    if (resultado.demo) {
      conteudo = conteudoDemoDaPessoaB2C(indice, ocupacao, localizacao, interesses);
      origem = candidato.linkedin;
      consultadoEm = resultado.consultadoEm;
      demo = true;
    } else {
      let perfil;
      try {
        perfil = await perfilDePessoa(candidato.linkedin, prospeccaoId, resultado.itens.find(item => item.url === candidato.linkedin)?.resumo);
      } catch (err) {
        propagarTeto(err);
        console.error("Falha ao ler perfil público de uma pessoa (pessoas B2C):", candidato.linkedin, err instanceof Error ? err.message : err);
        continue;
      }
      // Mesma regra já aplicada a lerPagina/perfilDePessoa desde a US-015: um perfil de demonstração
      // nunca vaza para dentro de uma busca já real.
      conteudo = perfil.demo ? conteudoDemoDaPessoaB2C(indice, ocupacao, localizacao, interesses) : perfil.conteudo;
      origem = perfil.origem;
      consultadoEm = perfil.consultadoEm;
      demo = perfil.demo;
    }

    jaVistos.add(chave);
    const evidenciasBase = avaliarCriterios(conteudo, [
      { criterio: "Localização", valor: localizacao },
      { criterio: "Ocupação", valor: ocupacao },
      { criterio: "Interesses", valor: interesses.join(", ") },
    ]);
    const evidenciaContexto = await avaliarCriterioInterpretativo(conteudo, "Contexto", contexto);
    const evidenciasBrutas = evidenciaContexto ? [...evidenciasBase, evidenciaContexto] : evidenciasBase;
    // US-028: termo de categoria sensível (lista fechada, lib/sensivel.ts) nunca qualifica — a evidência
    // é omitida antes de decidir se a pessoa entra na lista, não só antes de exibir.
    const evidencias = omitirEvidenciasSensiveis(evidenciasBrutas);
    // US-024: sem nenhuma evidência verificável (nem determinística, nem interpretativa), a pessoa não
    // entra na lista — mesmo critério de "sem sinal nenhum não é uma oportunidade" (US-020), aplicado aqui
    // a evidência em vez de sinal.
    if (!evidencias.some((e) => e.resultado !== "nao_verificavel")) continue;
    const sinais = sinaisEncontrados(conteudo, sinaisAlvo, origem, consultadoEm);
    criarLead({
      prospeccaoId, contaId: null, nome: candidato.nome, cargo: candidato.cargo, empresa: null,
      cidade: localizacao || null, linkedin: candidato.linkedin,
      fonte: demo ? null : origemPessoa(dominioDe(candidato.linkedin), consultadoEm),
      papel: "desconhecido", fit: calcularFit(evidencias), evidencias, sinais, hipotese: null,
      status: "pesquisado", noCRM: false, demo,
    });
    criados++;
  }
}

/** Origem preservada na ficha, sem inventar domínio ou fornecedor. */
function origemPessoa(dominio: string | null, consultadoEm: string): string | null {
  return dominio ? `encontrado em ${dominio}, em ${data(consultadoEm, { comAno: true })}` : null;
}

/** B2B: combina contatos e pesquisa pública, lê perfis e qualifica empresa e pessoa. */
async function buscarPessoasReais(prospeccaoId: string, criterios: Record<string, unknown>, icp: ICP | null, produtoId: string): Promise<void> {
  const cargo = textoCriterio(criterios, "cargo") || icp?.personas.join(" ou ") || "";
  const segmento = textoCriterio(criterios, "segmento") || icp?.criterios.setor || "";
  const localizacao = textoCriterio(criterios, "localizacao") || icp?.criterios.localizacao || "";
  const porte = textoCriterio(criterios, "porte") || icp?.criterios.porte || "";
  const resultado = await pesquisarPessoas({ cargo, segmento, localizacao, porte, outros: icp?.criterios.outros,
    proposta: obterProduto(produtoId)?.propostaValor, quantidade: TETO_PESSOAS_MODO }, prospeccaoId);
  const jaVistos = new Set(leadsDoProduto(produtoId).map(l => chaveLead(l.nome, l.empresa, l.linkedin)));
  const contas = new Map<string, Conta>();
  const candidatos = resultado.demo
    ? pessoasChaveDemo().map((p, i) => ({ titulo: `${p.nome} - ${p.cargo} - ${nomeEmpresaFicticia(segmento, i)}`, url: "", resumo: "" } as ResultadoBuscaWeb))
    : resultado.itens;
  let criados = 0;
  for (const item of candidatos) {
    if (foiCancelada(prospeccaoId)) return;
    if (criados >= TETO_PESSOAS_MODO) break;
    const pessoa = pessoaDoResultado(item);
    if (!pessoa.nome) continue;
    const chave = chaveLead(pessoa.nome, pessoa.empresa, item.url);
    if (jaVistos.has(chave)) continue;
    jaVistos.add(chave);
    const conteudo = resultado.demo ? conteudoDemoDaCandidata(0, segmento, porte, localizacao, undefined) : await conteudoDaPessoa(item, prospeccaoId);
    if (foiCancelada(prospeccaoId)) return;
    let conta: Conta | undefined;
    if (pessoa.empresa) {
      const identidade = pessoa.empresa.trim().toLowerCase();
      conta = contas.get(identidade);
      if (!conta) {
        let institucional = "";
        const site = item.pessoa?.site || null;
        if (site && descobertaAtiva()) {
          try { institucional = (await lerPagina(site, prospeccaoId)).conteudo; } catch { /* O perfil ainda é evidência disponível. */ }
        }
        const evidenciaEmpresa = await avaliarComOutros(institucional || conteudo, [
          { criterio: "Segmento", valor: segmento }, { criterio: "Porte", valor: porte }, { criterio: "Localização", valor: localizacao },
        ], icp);
        if (foiCancelada(prospeccaoId)) return;
        conta = criarConta({ prospeccaoId, nome: pessoa.empresa, site, setor: null, porte: null, cidade: null,
          fit: calcularFit(evidenciaEmpresa), evidencias: evidenciaEmpresa,
          sinais: sinaisEncontrados(institucional || conteudo, icp?.sinais ?? [], site || item.url, resultado.consultadoEm),
          resumo: resumoDaPagina(institucional || conteudo), demo: resultado.demo });
        contas.set(identidade, conta);
      }
    }
    const evidencias = [...(conta?.evidencias ?? await avaliarComOutros(conteudo, [{ criterio: "Segmento", valor: segmento }, { criterio: "Porte", valor: porte }], icp)), ...avaliarCriterios(conteudo, [{ criterio: "Cargo", valor: cargo }, { criterio: "Localização da pessoa", valor: localizacao }])];
    if (foiCancelada(prospeccaoId)) return;
    criarLead({ prospeccaoId, contaId: conta?.id ?? null, nome: pessoa.nome, cargo: pessoa.cargo, empresa: pessoa.empresa,
      cidade: item.pessoa?.cidade || null, linkedin: item.url || null,
      fonte: resultado.demo ? null : `${(item.fontes ?? ["busca pública"]).join(", ")} · ${item.url} · ${data(resultado.consultadoEm, { comAno: true })}`,
      papel: inferirPapel(pessoa.cargo, icp?.personas ?? []), fit: calcularFit(evidencias), evidencias,
      sinais: [...(conta?.sinais ?? []), ...sinaisEncontrados(conteudo, icp?.sinais ?? [], item.url, resultado.consultadoEm)],
      hipotese: null, status: "pesquisado", noCRM: false, demo: resultado.demo });
    criados++;
  }
}

/** Etapa 4: encontra as pessoas-chave do modo escolhido — os cinco casos possíveis de modo/jornada que
 * chegam aqui (ver deveCriarPessoas/MODOS_POR_JORNADA: "empresas" nunca chama esta etapa, e
 * empresas/empresa_unica só existem em B2B), todos com descoberta real desde a US-021. */
async function etapaEncontrarPessoas(prospeccaoId: string, modo: ModoProspeccao, jornada: Jornada, criterios: Record<string, unknown>, produtoId: string, icp: ICP | null): Promise<void> {
  if (modo === "empresa_unica") {
    const conta = listarContas(prospeccaoId)[0];
    if (conta) await buscarPessoasChaveUnica(prospeccaoId, conta, produtoId, icp?.personas ?? []);
    return;
  }
  if (modo === "pessoas") {
    if (jornada === "b2b") await buscarPessoasReais(prospeccaoId, criterios, icp, produtoId);
    else await buscarPessoasB2C(prospeccaoId, criterios, icp, produtoId);
    return;
  }
  // modo === "oportunidades" (único caso restante)
  if (jornada === "b2b") await buscarPessoasOportunidadesEmpresas(prospeccaoId, produtoId, icp?.personas ?? []);
  else await buscarPessoasOportunidadesB2C(prospeccaoId, criterios, icp, produtoId);
}

/** Etapa 5: promove os leads recém-criados de "pesquisado" para "qualificado" (fit/evidências já vêm
 * calculados desde a criação, US-024) e gera a hipótese de dor de CADA lead da prospecção (US-025) — um
 * ponto central único, em vez de espalhar a chamada pelos ~6 lugares que criam um LeadProspeccao, porque
 * todo lead (inclusive os "novo" de "Explorar uma empresa", que esta etapa não promove) passa por aqui. A
 * hipótese usa os SINAIS que o próprio lead já tem (nunca as evidências, que ficam em bloco separado) e as
 * dores do ICP da prospecção — sem nenhum sinal, `gerarHipoteseDor` devolve `null` sem chamar a IA. */
async function etapaQualificar(prospeccaoId: string, icp: ICP | null): Promise<void> {
  const dores = icp?.dores ?? [];
  const jornada: Jornada = icp?.jornada ?? "b2b";
  for (const lead of listarLeads(prospeccaoId)) {
    const hipotese = await gerarHipoteseDor(lead.sinais, dores, jornada);
    const status = lead.status === "pesquisado" && lead.evidencias.length > 0 && lead.evidencias.every(e => e.resultado === "atende") ? "qualificado" : lead.status;
    atualizarLead(lead.id, { status, hipotese });
  }
}

/** Dispara o pipeline em segundo plano; nunca aguardada pela rota que cria a prospecção. */
export function iniciarExecucao(prospeccaoId: string): void {
  void executarPipeline(prospeccaoId);
}

export type ResultadoCriarProspeccao = { ok: true; prospeccao: Prospeccao } | { ok: false; erro: string; status: number };

/** Valida, cria e dispara a execução de uma prospecção (POST /api/prospeccoes e a ferramenta MCP
 * `criar_prospeccao`, US-039) — mesma validação e o mesmo pipeline nos dois casos. `status` acompanha o
 * `erro` só para o chamador HTTP montar o código certo (404 produto/ICP, 400 os demais); a ferramenta MCP
 * ignora `status` e lança `erro` direto. */
export function criarProspeccaoValidada(dados: { produtoId: string; icpId: string; modo: unknown; criterios: unknown }): ResultadoCriarProspeccao {
  const { produtoId, icpId, modo, criterios } = dados;
  if (!produtoId || !obterProduto(produtoId)) return { ok: false, erro: "Produto não encontrado.", status: 404 };

  const icp = icpId ? obterICP(icpId) : null;
  if (!icpId || !icp) return { ok: false, erro: "Perfil ideal de cliente não encontrado.", status: 404 };
  if (icp.produtoId !== produtoId) return { ok: false, erro: "Este perfil ideal de cliente não pertence ao produto escolhido.", status: 400 };

  if (typeof modo !== "string" || !MODOS_PROSPECCAO_VALIDOS.includes(modo as ModoProspeccao)) {
    return { ok: false, erro: "Escolha um tipo de busca válido.", status: 400 };
  }

  if (!criterios || typeof criterios !== "object" || Array.isArray(criterios)) {
    return { ok: false, erro: "Informe os critérios da busca.", status: 400 };
  }
  if (modo === "empresa_unica") {
    const empresaNome = typeof (criterios as Record<string, unknown>).empresaNome === "string" ? ((criterios as Record<string, unknown>).empresaNome as string) : "";
    if (!empresaNome.trim()) return { ok: false, erro: "Informe o nome da empresa para explorar.", status: 400 };
  }

  const prospeccao = criarProspeccao({
    produtoId,
    icpId,
    modo: modo as ModoProspeccao,
    criterios: criterios as Record<string, unknown>,
    estado: "executando",
    etapa: null,
    erro: null,
  });
  iniciarExecucao(prospeccao.id);
  return { ok: true, prospeccao };
}

/** Relê o estado antes de novas etapas e gravações. Cancelamento, exclusão ou encerramento
 * impedem que uma resposta tardia retome a execução e recrie resultados. */
function foiCancelada(prospeccaoId: string): boolean {
  return obterProspeccao(prospeccaoId)?.estado !== "executando";
}

/** Exportada para a rotina "Oportunidades novas" (US-040, lib/rotinas-do-app.ts) poder AGUARDAR o
 * pipeline de uma prospecção-filha antes de montar o aviso — diferente de `iniciarExecucao`, que nunca é
 * aguardada (a rota HTTP responde antes do pipeline terminar). */
export async function executarPipeline(prospeccaoId: string): Promise<void> {
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
    const etapasAtivas = etapasDaProspeccao(prospeccao.modo, jornada);

    // Etapa 2: procurando empresas compatíveis.
    if (foiCancelada(prospeccaoId)) return;
    if (etapasAtivas.includes(ETAPAS_PROSPECCAO[1])) {
      rotuloEtapaAtual = ETAPAS_PROSPECCAO[1].rotulo;
      atualizarProspeccao(prospeccaoId, { etapa: ETAPAS_PROSPECCAO[1].chave });
      await etapaProcurarEmpresas(prospeccaoId, prospeccao.modo, jornada, prospeccao.criterios, icp);
    }

    // Etapa 3: pesquisa complementar de sinais públicos com origem e data.
    if (foiCancelada(prospeccaoId)) return;
    if (etapasAtivas.includes(ETAPAS_PROSPECCAO[2])) {
      rotuloEtapaAtual = ETAPAS_PROSPECCAO[2].rotulo;
      atualizarProspeccao(prospeccaoId, { etapa: ETAPAS_PROSPECCAO[2].chave });
      await analisarSinais(prospeccaoId, prospeccao.criterios, icp);
    }

    // Etapa 4: encontrando pessoas-chave (não roda em "empresas" puro).
    if (foiCancelada(prospeccaoId)) return;
    if (deveCriarPessoas(prospeccao.modo)) {
      rotuloEtapaAtual = ETAPAS_PROSPECCAO[3].rotulo;
      atualizarProspeccao(prospeccaoId, { etapa: ETAPAS_PROSPECCAO[3].chave });
      await etapaEncontrarPessoas(prospeccaoId, prospeccao.modo, jornada, prospeccao.criterios, prospeccao.produtoId, icp);
    }

    // Etapa 5: qualificando oportunidades.
    if (foiCancelada(prospeccaoId)) return;
    rotuloEtapaAtual = ETAPAS_PROSPECCAO[4].rotulo;
    atualizarProspeccao(prospeccaoId, { etapa: ETAPAS_PROSPECCAO[4].chave });
    await etapaQualificar(prospeccaoId, icp);

    if (foiCancelada(prospeccaoId)) return;
    const consultas = consultasDaProspeccao(prospeccaoId);
    const falhas = consultas.filter(c => c.estado === "falhou" || c.estado === "limite");
    const pendentes = consultas.some(c => c.estado === "pendente");
    const temResultados = listarContas(prospeccaoId).length > 0 || listarLeads(prospeccaoId).length > 0;
    atualizarProspeccao(prospeccaoId, {
      estado: !temResultados && falhas.length ? "falhou" : "pronta",
      erro: pendentes ? "O ProspectHalo ainda está qualificando candidatos. Consulte novamente com os mesmos critérios para recuperar a busca em andamento. Os resultados disponíveis foram mantidos." : falhas.length ? (temResultados ? "Algumas fontes não responderam; mantivemos os resultados encontrados. Confira as fontes consultadas abaixo." : "Não foi possível concluir a busca em todas as fontes. Confira as conexões e tente novamente.") : null,
      concluidoEm: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Falha ao executar a prospecção", prospeccaoId, err);
    if (foiCancelada(prospeccaoId)) return;
    if (err instanceof ErroDescoberta && err.codigo === "sem_resultado") {
      atualizarProspeccao(prospeccaoId, { estado: "pronta", erro: null, concluidoEm: new Date().toISOString() });
      return;
    }
    // Teto de consultas (US-023) não é uma falha de serviço: a prospecção termina "pronta" com o
    // aviso de orçamento, e não com a mensagem genérica de etapa interrompida.
    if (err instanceof TetoConsultasAtingido) {
      atualizarProspeccao(prospeccaoId, {
        estado: "pronta",
        erro: `Paramos após ${err.teto} consultas para não consumir sua cota.`,
        concluidoEm: new Date().toISOString(),
      });
      return;
    }
    atualizarProspeccao(prospeccaoId, {
      estado: listarContas(prospeccaoId).length || listarLeads(prospeccaoId).length ? "pronta" : "falhou",
      erro: err instanceof ErroDescoberta || err instanceof ErroProspectHalo ? err.message : `Não foi possível concluir a etapa "${rotuloEtapaAtual}"; os resultados encontrados até aqui foram mantidos.`,
      concluidoEm: new Date().toISOString(),
    });
  }
}

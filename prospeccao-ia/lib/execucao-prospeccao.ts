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
// Fronteira exata para US-026 substituir sem reler este arquivo inteiro: todo modo/jornada faz
// descoberta de verdade desde a US-021 — "empresas" (US-017), "empresa_unica" (US-018), "pessoas" em B2B
// (US-019), "oportunidades" nas duas jornadas (US-020) e "pessoas" em B2C (US-021, a última a sair do
// fictício). Sinais de intenção do ICP/critérios ainda são lidos e filtrados na etapa 3
// (`analisarSinais`), mas ela não persiste nada — cada modo real já extrai e persiste seu próprio
// SinalProspeccao dentro das etapas 2/4 (lib/qualificacao.ts:sinaisEncontrados), então essa função hoje
// não faz diferença para nenhum modo (mantida simples, sem uso prático).
//
// US-024 apertou a qualificação por evidências (fit/evidencias já existiam desde a US-017): "Porte" ganhou
// comparação NUMÉRICA determinística (lib/qualificacao.ts:avaliarPorte, pode devolver "nao_atende" de
// verdade agora) e "Outros critérios" (ICP B2B, texto livre) e "Contexto" (critério de busca B2C, texto
// livre) ganharam avaliação INTERPRETATIVA por IA (lib/qualificacao-ia.ts, `avaliarComOutros` para contas),
// só nas Contas de `buscarContasReais`/`buscarContaUnicaReal` e nos Leads de `buscarPessoasB2C` — os demais
// call-sites de `avaliarCriterios` (contaPara em buscarPessoasReais, buscarOportunidadesEmpresas,
// buscarPessoasOportunidadesB2C) continuam só com os critérios objetivos de sempre, fronteira documentada
// para não reler o arquivo inteiro achando "esquecimento". "Lead sem nenhuma evidência verificável não
// entra na lista" (AC da US-024) foi aplicada só em `buscarPessoasB2C` (onde a evidência é da PRÓPRIA
// pessoa, contra os critérios do perfil) — não em `buscarPessoasChaveUnica`/`buscarPessoasReais`/
// `buscarPessoasOportunidadesEmpresas`, cujo lead herda `conta.evidencias` (a evidência é da EMPRESA, não
// da pessoa): aplicar o mesmo filtro ali esconderia toda pessoa de uma conta sem site encontrado,
// contradizendo a AC da US-018 ("nenhuma pessoa é adicionada sem seleção explícita" pressupõe que ela
// aparece na lista para poder ser selecionada) e derrubaria o modo "pessoas" B2B inteiro em demonstração
// (a busca pública nunca qualifica a conta, `contaPara` é chamada com `site: null`).
//
// US-028 (qualificação B2C): `buscarPessoasB2C` já usava os critérios da US-006 (Localização/Ocupação/
// Interesses/Contexto) desde a US-024 — esta história só ACRESCENTOU a recusa de termo de categoria
// sensível (`omitirEvidenciasSensiveis`, lista fechada em `lib/sensivel.ts`) por cima da evidência já
// calculada, e uma hipótese de dor específica de B2C (`gerarHipoteseDor(..., jornada)`, "necessidade ou
// momento", nunca característica pessoal protegida) — nenhuma das duas muda o comportamento B2B.
//
// "empresa_unica" (US-018) tem uma particularidade: as pessoas encontradas nascem com status "novo"
// (não "pesquisado"), então a etapa 5 (que só promove "pesquisado" → "qualificado") NÃO as promove — elas
// só entram de fato na prospecção quando a pessoa marca a caixa de seleção e confirma "Adicionar à
// prospecção" (POST /api/prospeccoes/[id]/selecionar-pessoas, status "novo" → "selecionado"). "Nenhuma
// pessoa é adicionada sem seleção explícita" (AC da US-018) é isso: a tela nunca esconde quem foi
// encontrado, só não considera ninguém parte da prospecção até a escolha. A etapa 5 GERA A HIPÓTESE DE
// DOR (US-025) de TODO lead, independente do status — inclusive os "novo" de "empresa_unica", que ela não
// promove: é por isso que o laço da etapa 5 não filtra por status antes de chamar `gerarHipoteseDor`.
import { ETAPAS_PROSPECCAO } from "./execucao-etapas";
import { buscarNaWeb, lerPagina, perfilDePessoa, TetoConsultasAtingido } from "./descoberta";
import type { ResultadoBuscaWeb } from "./descoberta";
import { data } from "./formato";
import { apolloEnabled, buscarLeads, buscarPessoasDaEmpresa } from "./leads";
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
      pagina = await lerPagina(candidata.url, prospeccaoId);
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
      pagina = await lerPagina(candidata.url, prospeccaoId);
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
// para a etapa 4 (buscarPessoasChaveUnica) enriquecer `resumo` com o que a Apollo devolver sobre a
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
  if (!site) {
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

/** Etapa 3: trabalho real = ler e filtrar os sinais de intenção do ICP e dos critérios recebidos — só
 * para uso do pipeline dos modos que ainda não leem sinal nenhum de verdade (hoje, só "pessoas" em B2C);
 * os modos com descoberta real (empresas/empresa_unica/pessoas-B2B/oportunidades) já extraem e persistem
 * SinalProspeccao dentro das próprias etapas 2/4 (lib/qualificacao.ts:sinaisEncontrados), então esta
 * função não faz diferença para eles — mantida simples e sem persistência aqui. */
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

// Modo "empresa_unica" (US-018): no máximo 5 pessoas-chave por empresa explorada — teto pequeno de
// propósito (é uma busca focada numa única empresa, não uma lista para rolar).
const TETO_PESSOAS_CHAVE = 5;

/** Nome e cargo a partir do título de um resultado de busca por perfil (formato típico de busca por
 * `site:linkedin.com/in`: "Nome Sobrenome - Cargo - Empresa | LinkedIn", às vezes só "Nome Sobrenome |
 * LinkedIn"): descarta o sufixo do serviço (depois do `|`) e lê o primeiro segmento como nome, o segundo
 * (se existir) como cargo. */
function pessoaDoResultado(item: ResultadoBuscaWeb): { nome: string; cargo: string | null; empresa: string | null } {
  const titulo = item.titulo.split("|")[0].trim();
  const partes = titulo.split(/\s[-–]\s/).map((p) => p.trim()).filter(Boolean);
  return { nome: partes[0] || titulo, cargo: partes[1] || null, empresa: partes[2] || null };
}

/** Pessoas-chave de demonstração PRÓPRIAS deste modo (mesmo motivo de `conteudoDemoDaEmpresaUnica`):
 * nomes e cargos plausíveis, variados o bastante para exercitar as três classificações de papel. */
function pessoasChaveDemo(): { nome: string; cargo: string | null; linkedin: string | null }[] {
  return [0, 1, 2].map((i) => ({ nome: nomePessoaFicticia(i), cargo: CARGOS_PESSOA[i % CARGOS_PESSOA.length], linkedin: null }));
}

/** Etapa 4, modo "empresa_unica" (US-018, Apollo como fonte desde a US-022): busca pessoas ligadas à
 * empresa explorada em vez das pessoas fixas e fictícias dos demais modos — primeiro modo com descoberta
 * real de PESSOAS (contas real desde a mesma história; "empresas"/US-017 já tinha real só para contas).
 * Duas fontes, nunca misturadas na mesma busca (mesmo critério do modo "pessoas", US-019): com a Apollo
 * conectada, ela é a fonte ÚNICA — cargo e nome vêm dos campos ESTRUTURADOS da organização (mais
 * confiáveis que extrair do título de um resultado de busca), e o fato sobre a empresa que a Apollo
 * devolve enriquece `conta.resumo` (exibido na ficha como "Sobre a empresa", nunca como sinal) quando a
 * leitura da página institucional (etapa 2) não achou nada para contar. Sem Apollo, cai na busca pública
 * `site:linkedin.com/in` de sempre. Evidências/sinais continuam herdados da própria conta (a mesma
 * leitura institucional já qualificou a empresa; ler o perfil de cada pessoa também é orçamento que só a
 * US-019 trouxe, e só para o modo "pessoas"). Nasce com `status: "novo"` (não "pesquisado"): só vira parte
 * de fato da prospecção quando selecionada na tela (ver comentário de topo do arquivo). */
async function buscarPessoasChaveUnica(prospeccaoId: string, conta: Conta, produtoId: string, personas: string[]): Promise<void> {
  const jaVistos = new Set(leadsDoProduto(produtoId).map((l) => chaveLead(l.nome, l.empresa, l.linkedin)));
  let candidatos: { nome: string; cargo: string | null; linkedin: string | null }[];
  let demo = conta.demo;
  let viaApollo = false;

  if (conta.demo) {
    candidatos = pessoasChaveDemo();
  } else if (apolloEnabled()) {
    try {
      const resultado = await buscarPessoasDaEmpresa(conta.nome, TETO_PESSOAS_CHAVE);
      candidatos = resultado.pessoas;
      viaApollo = true;
      if (resultado.sobreEmpresa && (conta.resumo === RESUMO_SEM_SITE || conta.resumo === RESUMO_SITE_ILEGIVEL)) {
        atualizarConta(conta.id, { resumo: resultado.sobreEmpresa });
      }
    } catch (err) {
      console.error("Falha ao buscar pessoas da empresa via Apollo:", conta.nome, err instanceof Error ? err.message : err);
      candidatos = [];
    }
  } else {
    try {
      const resultado = await buscarNaWeb(`site:linkedin.com/in "${conta.nome}" (diretor OR gerente OR head OR coordenador)`, 0, prospeccaoId);
      demo = resultado.demo;
      candidatos = resultado.demo ? pessoasChaveDemo() : resultado.itens.map((item) => ({ ...pessoaDoResultado(item), linkedin: item.url }));
    } catch (err) {
      propagarTeto(err);
      console.error("Falha ao buscar pessoas-chave de", conta.nome, err instanceof Error ? err.message : err);
      candidatos = [];
    }
  }

  const vistosNestaBusca = new Set<string>();
  let criados = 0;
  for (const candidato of candidatos) {
    if (criados >= TETO_PESSOAS_CHAVE) break;
    if (!candidato.nome) continue;
    const chave = chaveLead(candidato.nome, conta.nome, candidato.linkedin ?? null);
    if (jaVistos.has(chave) || vistosNestaBusca.has(chave)) continue;
    vistosNestaBusca.add(chave);
    criarLead({
      prospeccaoId, contaId: conta.id, nome: candidato.nome, cargo: candidato.cargo, empresa: conta.nome, cidade: conta.cidade,
      linkedin: candidato.linkedin ?? null,
      fonte: demo ? null : viaApollo ? origemPessoa(conta.site ? dominioDe(conta.site) : null, conta.criadoEm, true) : "busca pública",
      papel: inferirPapel(candidato.cargo, personas),
      fit: conta.fit, evidencias: conta.evidencias, sinais: conta.sinais, hipotese: null,
      status: "novo", noCRM: false, demo,
    });
    criados++;
  }
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
  const contas = listarContas(prospeccaoId).slice(0, TETO_CONTAS_PESSOAS_OPORTUNIDADE);
  const jaVistos = new Set(leadsDoProduto(produtoId).map((l) => chaveLead(l.nome, l.empresa, l.linkedin)));

  for (const conta of contas) {
    let candidatos: { nome: string; cargo: string | null; linkedin: string | null }[];
    let demo = conta.demo;
    if (conta.demo) {
      candidatos = pessoasChaveDemo();
    } else {
      try {
        const resultado = await buscarNaWeb(`site:linkedin.com/in "${conta.nome}" (diretor OR gerente OR head OR coordenador)`, 0, prospeccaoId);
        demo = resultado.demo;
        candidatos = resultado.demo ? pessoasChaveDemo() : resultado.itens.map((item) => ({ ...pessoaDoResultado(item), linkedin: item.url }));
      } catch (err) {
        propagarTeto(err);
        console.error("Falha ao buscar pessoas-chave de uma oportunidade:", conta.nome, err instanceof Error ? err.message : err);
        candidatos = [];
      }
    }

    let criadosNaConta = 0;
    for (const candidato of candidatos) {
      if (criadosNaConta >= TETO_PESSOAS_CHAVE || !candidato.nome) continue;
      const chave = chaveLead(candidato.nome, conta.nome, candidato.linkedin ?? null);
      if (jaVistos.has(chave)) continue;
      jaVistos.add(chave);
      criarLead({
        prospeccaoId, contaId: conta.id, nome: candidato.nome, cargo: candidato.cargo, empresa: conta.nome, cidade: conta.cidade,
        linkedin: candidato.linkedin ?? null, fonte: demo ? null : "busca pública", papel: inferirPapel(candidato.cargo, personas),
        fit: conta.fit, evidencias: conta.evidencias, sinais: conta.sinais, hipotese: null,
        status: "pesquisado", noCRM: false, demo,
      });
      criadosNaConta++;
    }
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
    propagarTeto(err);
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
        perfil = await perfilDePessoa(candidato.linkedin, prospeccaoId);
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
      fonte: demoFinal ? null : origemPessoa(dominioDe(candidato.linkedin), consultadoEm, false),
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
    propagarTeto(err);
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
        perfil = await perfilDePessoa(candidato.linkedin, prospeccaoId);
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
      fonte: demo ? null : origemPessoa(dominioDe(candidato.linkedin), consultadoEm, false),
      papel: "desconhecido", fit: calcularFit(evidencias), evidencias, sinais, hipotese: null,
      status: "pesquisado", noCRM: false, demo,
    });
    criados++;
  }
}

/** Origem formatada para a ficha de uma pessoa (AC da US-019: "encontrado em <domínio>, em dd/mm/aaaa").
 * Sem domínio (ex.: contato só por Apollo, sem site da empresa) cai numa frase mais simples — nunca
 * inventa um domínio que a busca não confirmou. */
function origemPessoa(dominio: string | null, consultadoEm: string, viaApollo: boolean): string | null {
  if (dominio) return `encontrado em ${dominio}, em ${data(consultadoEm, { comAno: true })}`;
  return viaApollo ? "encontrado via Apollo" : null;
}

/** Modo "pessoas", jornada B2B (US-019): busca pessoas por cargo/empresa-ou-segmento/localização,
 * vinculando cada uma a uma `Conta` (criada sob demanda, com o mesmo cache local por nome — a etapa 2
 * não cria nada para este modo, ver `etapaProcurarEmpresas`). Duas fontes, nunca misturadas na mesma
 * pessoa: com a Apollo conectada, ela é a fonte de CONTATO (`lib/leads.ts:buscarLeads`, mesmo caminho da
 * busca de leads de hoje) e a conta de cada pessoa ainda é qualificada com sinais públicos de verdade
 * (lê a página do site da empresa devolvido pela Apollo, mesma qualificação de `buscarContasReais`); sem
 * Apollo, as pessoas vêm direto de uma busca pública `site:linkedin.com/in`, mesma técnica de
 * `buscarPessoasChaveUnica` (US-018), com fallback de demonstração próprio quando a busca não está
 * conectada (`pessoasChaveDemo`, não o `resultadosBuscaDemo` genérico — que não gera nomes de pessoa). */
async function buscarPessoasReais(prospeccaoId: string, criterios: Record<string, unknown>, icp: ICP | null, produtoId: string): Promise<void> {
  const cargo = textoCriterio(criterios, "cargo");
  const empresaOuSegmento = textoCriterio(criterios, "segmento");
  const localizacao = textoCriterio(criterios, "localizacao");
  const sinaisAlvo = icp?.sinais ?? [];
  const personas = icp?.personas ?? [];
  const jaVistos = new Set(leadsDoProduto(produtoId).map((l) => chaveLead(l.nome, l.empresa, l.linkedin)));
  const contasCache = new Map<string, Conta>(listarContas(prospeccaoId).map((c) => [c.nome.trim().toLowerCase(), c]));
  let criados = 0;

  /** Encontra ou cria a `Conta` de uma empresa citada por uma pessoa; quando o site é conhecido, lê a
   * página institucional e qualifica por evidências (mesma lógica de `buscarContasReais`) — é isso que
   * implementa "combinado com os sinais públicos" para quem veio da Apollo. */
  async function contaPara(nome: string, site: string | null, demoForcado: boolean): Promise<Conta> {
    const chave = nome.trim().toLowerCase();
    const existente = contasCache.get(chave);
    if (existente) return existente;
    let evidencias: Evidencia[] = [];
    let sinais: SinalProspeccao[] = [];
    let demo = demoForcado;
    if (site) {
      try {
        const pagina = await lerPagina(site, prospeccaoId);
        demo = demo || pagina.demo;
        const conteudo = pagina.demo ? conteudoDemoDaCandidata(0, empresaOuSegmento, "", localizacao, sinaisAlvo[0]) : pagina.conteudo;
        evidencias = avaliarCriterios(conteudo, [{ criterio: "Segmento", valor: empresaOuSegmento }, { criterio: "Localização", valor: localizacao }]);
        sinais = sinaisEncontrados(conteudo, sinaisAlvo, pagina.origem, pagina.consultadoEm);
      } catch (err) {
        propagarTeto(err);
        console.error("Falha ao ler página institucional para qualificar", nome, err instanceof Error ? err.message : err);
      }
    }
    const nova = criarConta({
      prospeccaoId, nome, site, setor: empresaOuSegmento || null, porte: null, cidade: localizacao || null,
      fit: evidencias.length ? calcularFit(evidencias) : null, evidencias, sinais, resumo: "", demo,
    });
    contasCache.set(chave, nova);
    return nova;
  }

  if (apolloEnabled()) {
    let resultado;
    try {
      resultado = await buscarLeads({ segmento: empresaOuSegmento, cargo, localizacao, porte: "", proposta: "", quantidade: String(TETO_PESSOAS_MODO) });
    } catch (err) {
      console.error("Falha na busca de contato via Apollo para o modo pessoas:", err instanceof Error ? err.message : err);
      return;
    }
    for (const lead of resultado.leads) {
      if (criados >= TETO_PESSOAS_MODO || !lead.nome) continue;
      const nomeEmpresa = lead.empresa || empresaOuSegmento || "Empresa não identificada";
      const chave = chaveLead(lead.nome, nomeEmpresa, lead.linkedin || null);
      if (jaVistos.has(chave)) continue;
      jaVistos.add(chave);
      const conta = await contaPara(nomeEmpresa, lead.site || null, false);
      criarLead({
        prospeccaoId, contaId: conta.id, nome: lead.nome, cargo: lead.cargo || cargo || null, empresa: nomeEmpresa,
        cidade: lead.cidade || localizacao || null, linkedin: lead.linkedin || null,
        fonte: origemPessoa(conta.site ? dominioDe(conta.site) : null, conta.criadoEm, true),
        papel: inferirPapel(lead.cargo || cargo || null, personas), fit: conta.fit, evidencias: conta.evidencias, sinais: conta.sinais,
        hipotese: null, status: "pesquisado", noCRM: false, demo: false,
      });
      criados++;
    }
    return;
  }

  const consulta = ["site:linkedin.com/in", cargo, empresaOuSegmento, localizacao].filter(Boolean).join(" ");
  let resultado;
  try {
    resultado = await buscarNaWeb(consulta, 0, prospeccaoId);
  } catch (err) {
    propagarTeto(err);
    console.error("Falha na busca pública de pessoas:", err instanceof Error ? err.message : err);
    return;
  }
  const candidatos = resultado.demo
    ? pessoasChaveDemo().map((p, i) => ({ ...p, empresa: nomeEmpresaFicticia(empresaOuSegmento, i) }))
    : resultado.itens.map((item) => ({ ...pessoaDoResultado(item), linkedin: item.url }));
  for (const candidato of candidatos) {
    if (criados >= TETO_PESSOAS_MODO || !candidato.nome) continue;
    const nomeEmpresa = candidato.empresa || empresaOuSegmento || "Empresa não identificada";
    const chave = chaveLead(candidato.nome, nomeEmpresa, candidato.linkedin ?? null);
    if (jaVistos.has(chave)) continue;
    jaVistos.add(chave);
    const conta = await contaPara(nomeEmpresa, null, resultado.demo);
    criarLead({
      prospeccaoId, contaId: conta.id, nome: candidato.nome, cargo: candidato.cargo, empresa: nomeEmpresa,
      cidade: localizacao || null, linkedin: candidato.linkedin ?? null,
      fonte: resultado.demo ? null : origemPessoa(candidato.linkedin ? dominioDe(candidato.linkedin) : null, resultado.consultadoEm, false),
      papel: inferirPapel(candidato.cargo, personas), fit: conta.fit, evidencias: conta.evidencias, sinais: conta.sinais,
      hipotese: null, status: "pesquisado", noCRM: false, demo: resultado.demo,
    });
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
    const status = lead.status === "pesquisado" ? "qualificado" : lead.status;
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
    await etapaProcurarEmpresas(prospeccaoId, prospeccao.modo, jornada, prospeccao.criterios, icp);

    // Etapa 3: analisando sinais públicos (sem persistência, ver comentário de topo).
    if (foiCancelada(prospeccaoId)) return;
    rotuloEtapaAtual = ETAPAS_PROSPECCAO[2].rotulo;
    atualizarProspeccao(prospeccaoId, { etapa: ETAPAS_PROSPECCAO[2].chave });
    analisarSinais(prospeccao.criterios, icp);

    // Etapa 4: encontrando pessoas-chave (não roda em "empresas" puro).
    if (foiCancelada(prospeccaoId)) return;
    rotuloEtapaAtual = ETAPAS_PROSPECCAO[3].rotulo;
    atualizarProspeccao(prospeccaoId, { etapa: ETAPAS_PROSPECCAO[3].chave });
    if (deveCriarPessoas(prospeccao.modo)) await etapaEncontrarPessoas(prospeccaoId, prospeccao.modo, jornada, prospeccao.criterios, prospeccao.produtoId, icp);

    // Etapa 5: qualificando oportunidades.
    if (foiCancelada(prospeccaoId)) return;
    rotuloEtapaAtual = ETAPAS_PROSPECCAO[4].rotulo;
    atualizarProspeccao(prospeccaoId, { etapa: ETAPAS_PROSPECCAO[4].chave });
    await etapaQualificar(prospeccaoId, icp);

    if (foiCancelada(prospeccaoId)) return;
    atualizarProspeccao(prospeccaoId, { estado: "pronta", erro: null, concluidoEm: new Date().toISOString() });
  } catch (err) {
    console.error("Falha ao executar a prospecção", prospeccaoId, err);
    if (foiCancelada(prospeccaoId)) return;
    // Teto de consultas (US-023) não é uma falha de serviço: a prospecção termina "pronta" com o
    // aviso de orçamento, e não com a mensagem genérica de etapa interrompida.
    if (err instanceof TetoConsultasAtingido) {
      atualizarProspeccao(prospeccaoId, {
        estado: "pronta",
        erro: `Paramos em ${err.teto} empresas para não consumir sua cota.`,
        concluidoEm: new Date().toISOString(),
      });
      return;
    }
    atualizarProspeccao(prospeccaoId, {
      estado: "pronta",
      erro: `Não foi possível concluir a etapa "${rotuloEtapaAtual}"; os resultados encontrados até aqui foram mantidos.`,
      concluidoEm: new Date().toISOString(),
    });
  }
}

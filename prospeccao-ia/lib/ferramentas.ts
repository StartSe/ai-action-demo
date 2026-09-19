// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
//
// As seis ferramentas do workspace (US-039) chamam a MESMA função de lib/ usada pela rota HTTP
// equivalente, sem duplicar prompt nem regra: listar_produtos → lib/workspace.ts:produtosComICPs (GET
// /api/produtos), criar_prospeccao → lib/execucao-prospeccao.ts:criarProspeccaoValidada (POST
// /api/prospeccoes), andamento_prospeccao → lib/workspace.ts:obterAndamento (GET
// /api/prospeccoes/[id]/andamento), listar_leads → lib/workspace.ts:listarLeadsComContexto (GET
// /api/leads/todos, com o filtro de fit/status aplicado aqui, por cima), qualificar_lead →
// lib/workspace.ts:mudarStatusLead (PUT /api/leads/[id]) e criar_abordagem →
// lib/estrategia.ts:gerarOuObterAbordagem (GET /api/leads/[id]/abordagem).
import { escreverAbordagem } from "./abordagem";
import { executarAcaoPesquisa, listarAcoesPesquisa } from "./descoberta";
import { gerarOuObterAbordagem } from "./estrategia";
import { criarProspeccaoValidada } from "./execucao-prospeccao";
import { buscarLeads, QUANTIDADES_VALIDAS } from "./leads";
import type { Ferramenta } from "./mcp";
import { ROTULO_MOTIVO_DESCARTE, ROTULO_STATUS_LEAD } from "./rotulos";
import type { DadosBusca, Lead } from "./types";
import { listarLeadsComContexto, mudarStatusLead, obterAndamento, produtosComICPs } from "./workspace";

const STATUS_LEAD_VALIDOS = Object.keys(ROTULO_STATUS_LEAD);
const MOTIVOS_DESCARTE_VALIDOS = Object.keys(ROTULO_MOTIVO_DESCARTE);

export const NOME_SERVIDOR = "prospeccao-ia";

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "listar_acoes_pesquisa",
    descricao: "Lista as ações de pesquisa conectadas e seus schemas atuais: busca na web, leitura de páginas, Search Dataset e dados públicos de LinkedIn, Instagram e outras redes. Consulte antes de executar uma ação.",
    schema: { type: "object", properties: {} },
    async executar() { return listarAcoesPesquisa(); },
  },
  {
    nome: "executar_acao_pesquisa",
    descricao: "Executa uma ação de consulta retornada por listar_acoes_pesquisa, usando exatamente seu schema. Para search_dataset, consulte list_dataset_fields antes para escolher campos e filtros válidos. Permite todas as ações de dados públicos disponíveis, incluindo perfis, empresas, vagas, posts, busca de pessoas, reels e comentários. Não envia mensagens.",
    schema: {
      type: "object",
      properties: {
        acao: { type: "string", description: "Nome exato da ação no catálogo" },
        argumentos: { type: "object", description: "Argumentos conforme o schema retornado no catálogo" },
        prospeccaoId: { type: "string", description: "Id da prospecção para contabilizar a consulta no teto (opcional)" },
      },
      required: ["acao", "argumentos"],
    },
    async executar(args) {
      if (typeof args.acao !== "string" || !args.acao.trim()) throw new Error("Informe a ação de pesquisa.");
      if (!args.argumentos || typeof args.argumentos !== "object" || Array.isArray(args.argumentos)) throw new Error("Informe os argumentos da ação como objeto.");
      const id = typeof args.prospeccaoId === "string" ? args.prospeccaoId : undefined;
      if (id && !obterAndamento(id)) throw new Error("Prospecção não encontrada.");
      return executarAcaoPesquisa(args.acao, args.argumentos as Record<string, unknown>, id);
    },
  },
  {
    nome: "buscar_leads",
    descricao:
      "Busca leads (nome, cargo, empresa, contato e um sinal de abordagem) que combinam com o perfil de cliente ideal informado: segmento, cargo-alvo, localização e o que a empresa do usuário vende.",
    schema: {
      type: "object",
      properties: {
        segmento: { type: "string", description: "Segmento ou setor de mercado das empresas-alvo" },
        cargo: { type: "string", description: "Cargo-alvo dentro dessas empresas" },
        localizacao: { type: "string", description: "Cidade, estado ou região das empresas-alvo" },
        proposta: { type: "string", description: "O que a empresa do usuário vende e para quem" },
        porte: { type: "string", description: "Faixa de número de funcionários, ex.: '51-200' (opcional, padrão 51-200)" },
        quantidade: { type: "number", enum: QUANTIDADES_VALIDAS, description: "Quantidade de leads a buscar (opcional, padrão 10)" },
      },
      required: ["segmento", "cargo", "localizacao", "proposta"],
    },
    async executar(args) {
      const segmento = String(args.segmento || "").trim();
      const cargo = String(args.cargo || "").trim();
      const localizacao = String(args.localizacao || "").trim();
      const proposta = String(args.proposta || "").trim();
      if (!segmento || !cargo || !localizacao || !proposta) {
        throw new Error("Informe segmento, cargo-alvo, localização e o que sua empresa vende.");
      }
      const porte = String(args.porte || "51-200").trim();
      const quantidade = QUANTIDADES_VALIDAS.includes(Number(args.quantidade)) ? String(args.quantidade) : "10";
      const dados: DadosBusca = { segmento, cargo, localizacao, porte, proposta, quantidade };
      return buscarLeads(dados);
    },
  },
  {
    nome: "escrever_abordagem",
    descricao:
      "Escreve uma abordagem personalizada (e-mail, mensagem de LinkedIn e de WhatsApp) para prospectar um lead específico, a partir dos dados do lead e do que a empresa do usuário vende.",
    schema: {
      type: "object",
      properties: {
        lead: {
          type: "object",
          description: "Dados do lead a abordar (devolvidos por buscar_leads ou informados diretamente)",
          properties: {
            nome: { type: "string" },
            cargo: { type: "string" },
            empresa: { type: "string" },
            setor: { type: "string" },
            porte: { type: "string" },
            cidade: { type: "string" },
            linkedin: { type: "string" },
            site: { type: "string" },
            sinal: { type: "string", description: "Fato ou hipótese sobre o lead ou a empresa, usado como gancho da abordagem" },
          },
          required: ["nome", "empresa"],
        },
        proposta: { type: "string", description: "O que a empresa do usuário vende e para quem" },
        segmento: { type: "string", description: "Segmento-alvo desta prospecção (opcional)" },
      },
      required: ["lead", "proposta"],
    },
    async executar(args) {
      const lead = (args.lead as Partial<Lead>) || {};
      const proposta = String(args.proposta || "").trim();
      if (!lead.nome || !lead.empresa) throw new Error("Informe ao menos o nome e a empresa do lead.");
      if (!proposta) throw new Error("Descreva o que sua empresa vende e para quem.");
      const segmento = args.segmento ? String(args.segmento).trim() : undefined;
      return escreverAbordagem({ lead, proposta, segmento });
    },
  },
  {
    nome: "listar_produtos",
    descricao: "Lista os produtos cadastrados no workspace de prospecção, cada um com os perfis ideais de cliente (ICPs) vinculados.",
    schema: { type: "object", properties: {} },
    async executar() {
      return produtosComICPs();
    },
  },
  {
    nome: "criar_prospeccao",
    descricao:
      "Cria uma prospecção para um produto e um perfil ideal de cliente já cadastrados e começa a busca em segundo plano: empresas, pessoas, uma empresa específica ou oportunidades por sinal de intenção.",
    schema: {
      type: "object",
      properties: {
        produtoId: { type: "string", description: "Id do produto (ver listar_produtos)" },
        icpId: { type: "string", description: "Id do perfil ideal de cliente (ICP), vinculado ao produto" },
        modo: {
          type: "string",
          enum: ["empresas", "pessoas", "empresa_unica", "oportunidades"],
          description: "Tipo de busca: empresas, pessoas, uma empresa específica (empresa_unica) ou oportunidades por sinal",
        },
        criterios: {
          type: "object",
          description: "Critérios da busca conforme o modo (segmento, localização, porte, cargo, sinais, empresaNome em 'empresa_unica' etc.)",
        },
      },
      required: ["produtoId", "icpId", "modo", "criterios"],
    },
    async executar(args) {
      const resultado = criarProspeccaoValidada({
        produtoId: String(args.produtoId || ""),
        icpId: String(args.icpId || ""),
        modo: args.modo,
        criterios: args.criterios,
      });
      if (!resultado.ok) throw new Error(resultado.erro);
      return resultado.prospeccao;
    },
  },
  {
    nome: "andamento_prospeccao",
    descricao: "Mostra o andamento de uma prospecção: etapa atual, empresas e pessoas já encontradas, com aderência ao perfil e sinais públicos.",
    schema: {
      type: "object",
      properties: { prospeccaoId: { type: "string", description: "Id da prospecção (ver criar_prospeccao)" } },
      required: ["prospeccaoId"],
    },
    async executar(args) {
      const andamento = obterAndamento(String(args.prospeccaoId || ""));
      if (!andamento) throw new Error("Prospecção não encontrada.");
      return andamento;
    },
  },
  {
    nome: "listar_leads",
    descricao: "Lista as pessoas encontradas em todas as prospecções, com a empresa e a aderência ao perfil ideal; aceita filtro por aderência e por status.",
    schema: {
      type: "object",
      properties: {
        fit: { type: "string", enum: ["alta", "media", "baixa"], description: "Filtra só quem tem esta aderência ao perfil ideal (opcional)" },
        status: { type: "string", enum: STATUS_LEAD_VALIDOS, description: "Filtra só quem está neste status (opcional)" },
      },
    },
    async executar(args) {
      const { leads, prospeccoes } = listarLeadsComContexto();
      const fit = typeof args.fit === "string" ? args.fit : null;
      const status = typeof args.status === "string" ? args.status : null;
      const filtrados = leads.filter((l) => (!fit || l.fit === fit) && (!status || l.status === status));
      return { leads: filtrados, prospeccoes };
    },
  },
  {
    nome: "qualificar_lead",
    descricao: "Muda o status de uma pessoa na prospecção (ex.: marcar como qualificada, selecionada ou descartada, com o motivo do descarte).",
    schema: {
      type: "object",
      properties: {
        leadId: { type: "string", description: "Id da pessoa (ver listar_leads)" },
        status: { type: "string", enum: STATUS_LEAD_VALIDOS, description: "Novo status da pessoa" },
        motivo: { type: "string", enum: MOTIVOS_DESCARTE_VALIDOS, description: "Motivo do descarte, só quando status é 'descartado' (opcional)" },
      },
      required: ["leadId", "status"],
    },
    async executar(args) {
      const leadId = String(args.leadId || "");
      if (!leadId) throw new Error("Informe a pessoa a qualificar.");
      const motivo = typeof args.motivo === "string" ? args.motivo : undefined;
      const atualizado = mudarStatusLead(leadId, String(args.status || ""), motivo);
      if (!atualizado) throw new Error("Pessoa não encontrada.");
      return atualizado;
    },
  },
  {
    nome: "criar_abordagem",
    descricao:
      "Gera (ou devolve, se já existir) a estratégia e as mensagens de abordagem — e-mail, LinkedIn e WhatsApp — para uma pessoa já encontrada numa prospecção.",
    schema: {
      type: "object",
      properties: { leadId: { type: "string", description: "Id da pessoa (ver listar_leads)" } },
      required: ["leadId"],
    },
    async executar(args) {
      const resultado = await gerarOuObterAbordagem(String(args.leadId || ""));
      if (!resultado) throw new Error("Esta pessoa não existe mais.");
      return resultado;
    },
  },
];

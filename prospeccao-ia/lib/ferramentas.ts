// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { escreverAbordagem } from "./abordagem";
import { buscarLeads, QUANTIDADES_VALIDAS } from "./leads";
import type { Ferramenta } from "./mcp";
import type { DadosBusca, Lead } from "./types";

export const NOME_SERVIDOR = "prospeccao-ia";

export const FERRAMENTAS: Ferramenta[] = [
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
];

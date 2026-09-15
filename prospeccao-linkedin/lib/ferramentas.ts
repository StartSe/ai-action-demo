// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { buscarLeads, completarRemetente, validarPerfil } from "./leads";
import type { Ferramenta } from "./mcp";
import { escreverSequencia } from "./sequencias";
import { SINAIS_INTENCAO, TONS, type Lead } from "./types";

export const NOME_SERVIDOR = "prospeccao-linkedin";

const PROPRIEDADES_PERFIL = {
  cargos: { type: "string", description: "Cargos-alvo, separados por vírgula (ex.: 'Diretor de Operações, Gerente de Logística')" },
  setores: { type: "string", description: "Setores-alvo, separados por vírgula (ex.: 'Indústria de alimentos, Varejo')" },
  sinais: { type: "array", items: { type: "string", enum: SINAIS_INTENCAO.map((s) => s.valor) }, description: "Sinais de intenção a priorizar (opcional; vazio = qualquer sinal)" },
  proposta: { type: "string", description: "A proposta da empresa do usuário em uma frase" },
  remetente: { type: "object", description: "Quem assina as mensagens (opcional)", properties: { nome: { type: "string" }, empresa: { type: "string" } } },
  tom: { type: "string", enum: TONS.map((t) => t.valor), description: "Tom das mensagens (opcional, padrão 'consultivo')" },
};

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "buscar_leads_linkedin",
    descricao:
      "Busca leads no LinkedIn que combinam com o perfil de cliente ideal (cargos, setores, sinais de intenção e proposta) e cria uma campanha em rascunho com a lista pontuada. Devolve a campanha (id, leads com nome, cargo, empresa, sinal, pontuação e link do LinkedIn).",
    schema: { type: "object", properties: PROPRIEDADES_PERFIL, required: ["cargos", "setores", "proposta"] },
    async executar(args) {
      const perfil = completarRemetente(validarPerfil(args));
      return buscarLeads(perfil);
    },
  },
  {
    nome: "escrever_sequencia",
    descricao:
      "Escreve a sequência de mensagens de LinkedIn para um lead: pedido de conexão (até 300 caracteres), dois acompanhamentos e um e-mail opcional, a partir da proposta da empresa do usuário e do sinal de intenção do lead.",
    schema: {
      type: "object",
      properties: {
        lead: {
          type: "object",
          description: "Dados do lead (devolvidos por buscar_leads_linkedin ou informados diretamente)",
          properties: {
            id: { type: "string" },
            nome: { type: "string" },
            cargo: { type: "string" },
            empresa: { type: "string" },
            setor: { type: "string" },
            linkedinUrl: { type: "string" },
            sinal: { type: "string", description: "Sinal de intenção observado, usado como gancho" },
          },
          required: ["nome", "empresa"],
        },
        proposta: PROPRIEDADES_PERFIL.proposta,
        remetente: PROPRIEDADES_PERFIL.remetente,
        tom: PROPRIEDADES_PERFIL.tom,
      },
      required: ["lead", "proposta"],
    },
    async executar(args) {
      const bruto = (args.lead && typeof args.lead === "object" ? args.lead : {}) as Partial<Lead>;
      if (!bruto.nome || !bruto.empresa) throw new Error("Informe ao menos o nome e a empresa do lead.");
      const proposta = String(args.proposta || "").trim();
      if (!proposta) throw new Error("Descreva a sua proposta em uma frase.");
      const lead: Lead = {
        id: String(bruto.id || "avulso"),
        nome: String(bruto.nome),
        cargo: String(bruto.cargo || ""),
        empresa: String(bruto.empresa),
        setor: String(bruto.setor || ""),
        linkedinUrl: String(bruto.linkedinUrl || ""),
        sinal: String(bruto.sinal || ""),
        pontuacao: Number(bruto.pontuacao) || 0,
        origem: bruto.origem === "prospecthalo" ? "prospecthalo" : "demo",
      };
      const perfil = completarRemetente(validarPerfil({ cargos: lead.cargo || "não informado", setores: lead.setor || "não informado", proposta, remetente: args.remetente, tom: args.tom }));
      return escreverSequencia(lead, perfil);
    },
  },
];

// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { gerarAnalise } from "./analise";
import { AVISO_SEM_FALAS, parseConversaColada } from "./conversa";
import { METODOLOGIAS_IDS } from "./metodologias";
import { DIFICULDADES, criarSimulacao } from "./nova-simulacao";
import { gerarPainelEquipe } from "./painel-equipe";
import { montarPainelSimulacao } from "./painel-simulacao";
import { enderecoPublico } from "./setup-comum";
import { listar as listarSimulacoes } from "./simulacoes";
import type { Ferramenta } from "./mcp";
import type { DadosAnalise } from "./types";

export const NOME_SERVIDOR = "simulador-vendas";

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "analisar_conversa",
    descricao: "Analisa uma conversa de vendas colada (uma fala por linha, no formato 'Vendedor: ...' / 'Cliente: ...') e devolve uma nota geral, a nota e a evidência de cada critério de venda consultiva, pontos fortes, pontos a melhorar e os momentos-chave da conversa.",
    schema: {
      type: "object",
      properties: {
        transcricao: { type: "string", description: "Conversa colada, uma fala por linha, com o prefixo 'Vendedor:' ou 'Cliente:' antes de cada fala" },
        vendedor: { type: "string", description: "Identificador de um vendedor já cadastrado no time (opcional)" },
        cenario: { type: "string", description: "Identificador de um cenário de cliente simulado já cadastrado (opcional)" },
      },
      required: ["transcricao"],
    },
    async executar(args) {
      const transcricao = String(args.transcricao || "").trim();
      if (!transcricao) throw new Error("Cole a transcrição da conversa (uma fala por linha, com 'Vendedor:' ou 'Cliente:').");
      // Mesma validação de POST /api/analisar: sem nenhuma fala reconhecida a IA receberia uma
      // transcrição vazia e devolveria notas baixas sem explicação.
      if (parseConversaColada(transcricao).length === 0) throw new Error(AVISO_SEM_FALAS);
      const dados: DadosAnalise = {
        conversaColada: transcricao,
        vendedorId: args.vendedor ? String(args.vendedor) : undefined,
        cenarioId: args.cenario ? String(args.cenario) : undefined,
      };
      return gerarAnalise(dados);
    },
  },
  {
    nome: "painel_equipe",
    descricao: "Monta o painel da equipe de vendas: nota média do período (com variação contra o período anterior), e para cada vendedor a quantidade de conversas, a nota média, a tendência (subindo/estável/caindo) e o critério de venda consultiva mais fraco.",
    schema: {
      type: "object",
      properties: {
        dias: { type: "number", description: "Tamanho da janela em dias considerada (padrão 30)" },
      },
    },
    async executar(args) {
      const diasBruto = Number(args.dias);
      const dias = Number.isFinite(diasBruto) && diasBruto > 0 ? Math.round(diasBruto) : 30;
      return gerarPainelEquipe(dias);
    },
  },
  {
    nome: "criar_simulacao",
    descricao:
      "Cria um treino de vendas a partir de um produto já cadastrado e devolve o link único para mandar ao time inteiro. Escolha o método de venda que a avaliação vai cobrar e o quanto o cliente simulado vai dificultar; cada pessoa que abrir o link recebe um cliente próprio e um resultado próprio.",
    schema: {
      type: "object",
      properties: {
        produto: { type: "string", description: "Nome (ou identificador) de um produto já cadastrado" },
        nome: { type: "string", description: "Nome do treino; sem ele, vira \"Treino — <produto>\"" },
        objetivo: { type: "string", description: "O que o time deve praticar neste treino (opcional)" },
        metodologia: { type: "string", enum: [...METODOLOGIAS_IDS], description: "Método de venda que a avaliação vai cobrar (padrão: consultiva)" },
        dificuldade: { type: "string", enum: [...DIFICULDADES], description: "O quanto o cliente simulado dificulta (padrão: realista)" },
        maxTentativas: { type: "number", description: "Quantas conversas cada pessoa pode ter: 1, 3 ou 5 (padrão 3)" },
        duracaoMin: { type: "number", description: "Duração de cada conversa em minutos: 5, 10 ou 15 (padrão 10)" },
        mostrarFeedback: { type: "boolean", description: "Se quem treina vê a própria avaliação ao terminar (padrão: sim)" },
      },
      required: ["produto"],
    },
    async executar(args) {
      // As mesmas regras da tela de três passos, sem uma segunda cópia: quem valida é lib/nova-simulacao.ts.
      const resultado = criarSimulacao(args);
      if ("erro" in resultado) throw new Error(resultado.erro);

      const { simulacao } = resultado;
      const caminho = `/simular/${simulacao.codigo}`;
      // O endereço público é o que a instalação já aprendeu de uma requisição real (lib/setup-comum.ts).
      // Numa instalação que nunca recebeu uma, o caminho relativo ainda diz onde o treino mora.
      const base = enderecoPublico();
      return {
        codigo: simulacao.codigo,
        nome: simulacao.nome,
        metodologia: simulacao.metodologia,
        dificuldade: simulacao.dificuldade,
        maxTentativas: simulacao.maxTentativas,
        duracaoMin: simulacao.duracaoMin,
        link: base ? `${base}${caminho}` : caminho,
      };
    },
  },
  {
    nome: "resultados_da_simulacao",
    descricao:
      "Devolve os números de um treino pelo código do link: nota média do time, quantas pessoas treinaram, as competências da mais fraca para a mais forte, a nota de cada pessoa e a nota por tipo de cliente. Sem o código, lista os treinos existentes para escolher um.",
    schema: {
      type: "object",
      properties: {
        codigo: { type: "string", description: "Código do treino — o trecho final do link /simular/<código>" },
        dias: { type: "number", description: "Tamanho da janela comparada, em dias (padrão 30)" },
      },
    },
    async executar(args) {
      const codigo = String(args.codigo || "").trim();
      if (!codigo) {
        // Sem código, a saída útil é a lista de onde ele sai — não um erro pedindo um valor que
        // quem conversa não tem como adivinhar.
        return { treinos: listarSimulacoes().map((s) => ({ codigo: s.codigo, nome: s.nome, status: s.status })) };
      }

      const diasBruto = Number(args.dias);
      const dias = Number.isFinite(diasBruto) && diasBruto > 0 ? Math.round(diasBruto) : 30;
      const painel = montarPainelSimulacao(codigo, dias);
      if (!painel) throw new Error("Não existe treino com esse código. Peça a lista de treinos para escolher um.");

      // Só os agregados: a transcrição e o feedback de cada conversa ficam de fora de propósito — a
      // pergunta aqui é "como o time está indo", e mandar o conteúdo das conversas para dentro de um
      // assistente seria um vazamento que ninguém pediu.
      return {
        codigo: painel.codigo,
        nome: painel.nome,
        produto: painel.produto,
        metodologia: painel.metodologia,
        dificuldade: painel.dificuldade,
        status: painel.status,
        dias: painel.dias,
        sessoes: painel.sessoes,
        participantes: painel.participantes,
        avaliadas: painel.avaliadas,
        notaMedia: painel.notaMedia,
        variacao: painel.variacao,
        competencias: painel.competencias.map((c) => ({ nome: c.nome, grupo: c.grupo, nota: c.nota, avaliacoes: c.avaliacoes })),
        equipe: painel.equipe.map((v) => ({ nome: v.nome, sessoes: v.sessoes, avaliadas: v.avaliadas, nota: v.nota, tendencia: v.tendencia })),
        tiposDeCliente: painel.personas.map((p) => ({ nome: p.nome, sessoes: p.sessoes, avaliadas: p.avaliadas, nota: p.nota, poucosDados: p.poucosDados })),
      };
    },
  },
];

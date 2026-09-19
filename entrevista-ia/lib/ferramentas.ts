// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
//
// **Nenhuma regra nasce neste arquivo.** Quem decide se uma vaga aceita mais alguém é
// `lib/convite.ts`, quem decide se a pesquisa pode rodar é `lib/pesquisa.ts`, e quem junta entrevista
// com candidato, vaga e parecer é `lib/painel.ts` — os mesmos módulos que as telas usam. Uma cópia da
// regra aqui viraria, no primeiro ajuste, duas respostas diferentes para a mesma pergunta conforme a
// pessoa tenha clicado na tela ou pedido ao assistente.
import { obter as obterCandidato } from "./candidatos";
import { atribuirEConvidar } from "./convite";
import { CONTAGEM_VAZIA, contarPorVaga, obter as obterEntrevista } from "./entrevistas";
import { faixaSalarial, ROTULO_DECISAO, situacaoDaEntrevista } from "./formato";
import { obter as obterResultado } from "./historico";
import { listarEntrevistasNoPainel } from "./painel";
import { dispararPesquisa, impedimentoDaPesquisa } from "./pesquisa";
import { enderecoPublico } from "./setup-comum";
import { listar as listarVagas, obter as obterVaga, type StatusVaga } from "./vagas";
import type { Ferramenta } from "./mcp";
import type { Parecer, Scorecard, Troca, Vaga } from "./types";

export const NOME_SERVIDOR = "entrevista-ia";

/** Descrição comum das duas portas do parecer (`obter_parecer` e o apelido antigo). */
const DESCRICAO_PARECER =
  "Devolve o parecer de uma entrevista já avaliada: nota geral, recomendação, resumo, aderência a cada requisito da vaga, avaliação técnica e cultural, consistência entre a conversa, o currículo e o perfil público, pontos fortes, pontos de atenção e o que perguntar na próxima etapa. Aceita o id da entrevista ou o id do resultado visível no link /r/<id>.";

/**
 * O parecer, venha o id de onde vier.
 *
 * Três formatos de id circulam por aí e todos precisam continuar abrindo: o da **entrevista** (o de
 * hoje, o que as telas mostram), o do **resultado** `parecer` e o dos resultados antigos (`entrevista`
 * e `scorecard`, do app antes de Vaga → Candidato → Entrevista existir). Quem escreveu o id num
 * documento meses atrás não tem como saber qual dos três copiou.
 */
function lerParecer(id: string): Record<string, unknown> {
  const entrevista = obterEntrevista(id);
  if (entrevista) {
    if (!entrevista.resultadoId) {
      throw new Error("Esta entrevista ainda não tem parecer. O parecer fica pronto alguns instantes depois que o candidato termina a conversa.");
    }
    const registro = obterResultado<unknown, Parecer>(entrevista.resultadoId);
    if (!registro) throw new Error("O parecer desta entrevista não está mais guardado.");
    return {
      entrevistaId: entrevista.id,
      resultadoId: entrevista.resultadoId,
      candidato: obterCandidato(entrevista.candidatoId)?.nome ?? "Candidato removido",
      vaga: obterVaga(entrevista.vagaId)?.cargo ?? "Vaga removida",
      status: situacaoDaEntrevista(entrevista).rotulo,
      decisao: entrevista.decisao ? ROTULO_DECISAO[entrevista.decisao] : null,
      concluidaEm: entrevista.concluidaEm ?? null,
      parecer: registro.saida,
    };
  }

  const registro = obterResultado<{ vaga?: Vaga; historico?: Troca[]; entrevistaId?: string }, Parecer | Scorecard>(id);
  if (!registro) throw new Error("Não existe entrevista nem parecer com esse id.");
  if (registro.tipo === "parecer") {
    return { resultadoId: registro.id, entrevistaId: registro.entrada?.entrevistaId ?? null, titulo: registro.titulo, criadoEm: registro.criadoEm, parecer: registro.saida };
  }
  // Os dois tipos antigos guardam o `Scorecard` (snake_case), que é outro formato — devolvê-lo sob a
  // chave `parecer` faria quem consome achar que os campos sumiram.
  if (registro.tipo === "entrevista" || registro.tipo === "scorecard") {
    return { resultadoId: registro.id, titulo: registro.titulo, criadoEm: registro.criadoEm, vaga: registro.entrada?.vaga ?? null, scorecard: registro.saida };
  }
  throw new Error("Esse id é de outro tipo de registro (uma comparação ou um relatório), não de um parecer.");
}

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "listar_vagas",
    descricao:
      "Lista as vagas cadastradas com cargo, área, senioridade, modelo de trabalho, local, faixa salarial e quantos candidatos estão em cada etapa (convidados, em andamento, concluídos, avaliados). É de onde sai o id de vaga que as outras ferramentas pedem.",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["aberta", "encerrada"], description: "Filtra por situação da vaga; sem ele, devolve todas" },
      },
    },
    async executar(args) {
      const pedido = String(args.status || "").trim();
      const status = pedido === "aberta" || pedido === "encerrada" ? (pedido as StatusVaga) : undefined;
      const contagens = contarPorVaga();
      return {
        vagas: listarVagas({ status }).map((vaga) => ({
          id: vaga.id,
          cargo: vaga.cargo,
          area: vaga.area || null,
          senioridade: vaga.senioridade ?? null,
          modelo: vaga.modelo ?? null,
          local: vaga.local || null,
          salario: faixaSalarial(vaga),
          status: vaga.status,
          candidatos: contagens[vaga.id] ?? CONTAGEM_VAZIA,
          criadoEm: vaga.criadoEm,
          exemplo: vaga.exemplo,
        })),
      };
    },
  },
  {
    nome: "listar_candidatos_da_vaga",
    descricao:
      "Lista quem foi chamado para uma vaga: nome, em que ponto do processo cada pessoa está, a nota e a recomendação do parecer (quando já existe) e a decisão registrada pelo gestor. Use listar_vagas para descobrir o id da vaga.",
    schema: {
      type: "object",
      properties: {
        vaga_id: { type: "string", description: "Id da vaga, devolvido por listar_vagas" },
      },
      required: ["vaga_id"],
    },
    async executar(args) {
      const vagaId = String(args.vaga_id || "").trim();
      if (!vagaId) throw new Error("Informe o id da vaga. Use listar_vagas para descobri-lo.");
      const vaga = obterVaga(vagaId);
      if (!vaga) throw new Error("Não existe vaga com esse id. Use listar_vagas para escolher uma.");

      return {
        vaga: { id: vaga.id, cargo: vaga.cargo, status: vaga.status },
        // A junção é a mesma das telas (lib/painel.ts): status, nota e recomendação de uma leitura só.
        candidatos: listarEntrevistasNoPainel({ vagaId }).map((e) => ({
          entrevistaId: e.id,
          candidatoId: e.candidatoId,
          nome: e.candidatoNome,
          status: situacaoDaEntrevista(e).rotulo,
          notaGeral: e.notaGeral ?? null,
          recomendacao: e.recomendacao ?? null,
          decisao: e.decisao ? ROTULO_DECISAO[e.decisao] : null,
          convidadaEm: e.convidadaEm ?? null,
          concluidaEm: e.concluidaEm ?? null,
          exemplo: e.exemplo,
        })),
      };
    },
  },
  {
    nome: "obter_parecer",
    descricao: DESCRICAO_PARECER,
    schema: {
      type: "object",
      properties: {
        entrevista_id: { type: "string", description: "Id da entrevista (de listar_candidatos_da_vaga) ou do resultado visível no link /r/<id>" },
      },
      required: ["entrevista_id"],
    },
    async executar(args) {
      const id = String(args.entrevista_id || "").trim();
      if (!id) throw new Error("Informe o id da entrevista.");
      return lerParecer(id);
    },
  },
  {
    // Apelido do anterior. A ferramenta mudou de nome porque o app deixou de produzir "scorecards",
    // mas um assistente configurado meses atrás continua chamando pelo nome antigo — e quem o
    // configurou não tem por que descobrir isso por um erro no meio de uma conversa.
    nome: "obter_scorecard",
    descricao: `${DESCRICAO_PARECER} Este é o nome antigo de obter_parecer e continua funcionando; prefira obter_parecer.`,
    schema: {
      type: "object",
      properties: {
        id_entrevista: { type: "string", description: "Id da entrevista ou do resultado visível no link /r/<id>" },
      },
      required: ["id_entrevista"],
    },
    async executar(args) {
      const id = String(args.id_entrevista || args.entrevista_id || "").trim();
      if (!id) throw new Error("Informe o id da entrevista.");
      return lerParecer(id);
    },
  },
  {
    nome: "criar_convite",
    descricao:
      "Chama um candidato para uma vaga e devolve o link da entrevista e a mensagem pronta para enviar a ele. Convidar duas vezes a mesma pessoa para a mesma vaga não cria um segundo processo: o link continua o mesmo e só o prazo é estendido.",
    schema: {
      type: "object",
      properties: {
        vaga_id: { type: "string", description: "Id da vaga, devolvido por listar_vagas" },
        candidato_id: { type: "string", description: "Id do candidato, devolvido por listar_candidatos_da_vaga" },
        expira_em_dias: { type: "number", enum: [7, 15, 30], description: "Por quantos dias o link vale (padrão 15)" },
      },
      required: ["vaga_id", "candidato_id"],
    },
    async executar(args) {
      const origem = enderecoPublico();
      // Sem endereço público não há link para entregar, e um convite com caminho relativo não abre no
      // celular de ninguém. Abrir o app uma vez no navegador já grava o endereço (lib/setup-comum.ts).
      if (!origem) {
        throw new Error("O app ainda não sabe o próprio endereço público. Abra o app uma vez no navegador (ou defina APP_URL) e peça de novo.");
      }
      const resultado = atribuirEConvidar({
        vagaId: String(args.vaga_id || "").trim(),
        candidatoId: String(args.candidato_id || "").trim(),
        expiraEmDias: args.expira_em_dias,
        origem,
      });
      if (!resultado.ok) throw new Error(resultado.erro);
      const { convite } = resultado;
      return {
        entrevistaId: convite.entrevistaId,
        candidato: convite.candidatoNome,
        candidatoEmail: convite.candidatoEmail || null,
        cargo: convite.cargo,
        link: convite.link,
        assunto: convite.assunto,
        mensagem: convite.mensagem,
        expiraEm: convite.expiraEm ?? null,
        duracaoMin: convite.duracaoMin,
      };
    },
  },
  {
    nome: "pesquisar_candidato",
    descricao:
      "Procura o perfil público de um candidato na web e preenche a ficha dele com o que encontrar, sempre dizendo de onde veio cada informação. A pesquisa leva até um minuto e roda em segundo plano: esta ferramenta devolve o estado em que ela ficou, e consultar o candidato de novo mais tarde mostra o resultado.",
    schema: {
      type: "object",
      properties: {
        candidato_id: { type: "string", description: "Id do candidato, devolvido por listar_candidatos_da_vaga" },
      },
      required: ["candidato_id"],
    },
    async executar(args) {
      const id = String(args.candidato_id || "").trim();
      if (!id) throw new Error("Informe o id do candidato.");
      const candidato = obterCandidato(id);
      if (!candidato) throw new Error("Não existe candidato com esse id.");

      // As duas situações em que a pesquisa não tem como rodar são respondidas de imediato, com a
      // mesma frase da tela: disparar em segundo plano algo que vai morrer em silêncio deixaria quem
      // pediu esperando por nada.
      const impedimento = impedimentoDaPesquisa(candidato);
      if (impedimento) return { candidatoId: id, nome: candidato.nome, pesquisaStatus: candidato.pesquisaStatus, aviso: impedimento.aviso };

      // Pedir duas vezes não gasta o orçamento de chamadas duas vezes.
      if (candidato.pesquisaStatus === "pendente" || candidato.pesquisaStatus === "em_andamento") {
        return { candidatoId: id, nome: candidato.nome, pesquisaStatus: candidato.pesquisaStatus, emAndamento: true };
      }

      dispararPesquisa(id);
      return { candidatoId: id, nome: candidato.nome, pesquisaStatus: obterCandidato(id)?.pesquisaStatus ?? "pendente", emAndamento: true };
    },
  },
];

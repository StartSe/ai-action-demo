// O feedback de uma conversa, na tela do vendedor (US-017).
//
// Existe porque `/r/<id>` é do **gestor**: aquela tela tem o menu do app e exige conta, então o link
// do feedback que o vendedor recebe não pode apontar para lá — ele seria mandado para a tela de entrar,
// no meio do treino. Aqui a mesma avaliação aparece na moldura de quem treina, sem menu e sem conta,
// protegida pelo cookie assinado: cada um só abre as próprias conversas.
//
// É também o lugar onde o **tipo de cliente** é revelado. Antes da conversa ele fica escondido (D2);
// depois dela, é o que explica por que o cliente reagiu daquele jeito.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { obter as obterResultado } from "@/lib/historico";
import { obter as obterParticipante } from "@/lib/participantes";
import { obter as obterProduto } from "@/lib/produtos";
import { montarPersonagem } from "@/lib/cliente-simulado";
import { adjetivosDoCliente, frasePerfil, persona, personasDe, rotulo } from "@/lib/personas";
import { balancoDeTentativas } from "@/lib/sala-do-vendedor";
import { obter as obterSessao } from "@/lib/sessoes";
import { lerSessaoVendedor } from "@/lib/sessao-vendedor";
import { obter as obterSimulacao } from "@/lib/simulacoes";
import type { Meta } from "@/lib/ai";
import type { Conversa } from "@/lib/types";
import type { AvaliacaoSessao } from "@/lib/avaliacao";
import { ConversaRegistrada, FeedbackVendedor } from "@/components/FeedbackVendedor";
import { Moldura } from "../../Moldura";

export const dynamic = "force-dynamic";

export default async function Page({ params }: PageProps<"/simular/[token]/meus-resultados/[sessao]">) {
  const { token, sessao: sessaoId } = await params;

  const simulacao = obterSimulacao(token);
  if (!simulacao) {
    return (
      <Moldura>
        <div className="card p-7 max-md:p-[22px]">
          <h1 className="text-[22px] leading-[1.2] font-extrabold tracking-[-0.02em] mb-2">Este link não existe</h1>
          <p className="text-muted">Confira se o endereço foi copiado corretamente, ou peça um novo link de treino a quem enviou este convite.</p>
        </div>
      </Moldura>
    );
  }

  const sessaoVendedor = lerSessaoVendedor((await headers()).get("cookie"));
  const participante = sessaoVendedor ? obterParticipante(sessaoVendedor.participanteId) : null;
  if (!participante) redirect(`/simular/${token}`);

  // Quantas conversas ele já teve neste treino e se ainda pode ter outra: é o que decide se "Treinar
  // novamente" aparece, e vale para todas as saídas desta tela, inclusive as de recado.
  const tentativas = balancoDeTentativas(simulacao, participante.id);
  const recado = (titulo: string, descricao: string) => (
    <Moldura>
      <ConversaRegistrada codigo={token} titulo={titulo} descricao={descricao} tentativas={tentativas} />
    </Moldura>
  );

  // O dono da conversa é reconferido no banco, nunca deduzido do endereço: sem isto, trocar o id na
  // barra abriria o feedback de um colega, com a conversa inteira dele dentro.
  const sessao = obterSessao(sessaoId);
  if (!sessao || sessao.participanteId !== participante.id || sessao.simulacaoCodigo !== token) {
    return recado("Esta conversa não está aqui", "O endereço pode ter sido copiado pela metade, ou esta conversa é de outra pessoa.");
  }

  // O gestor pode ter desligado o feedback ao criar o treino (US-011): a avaliação existe e é dele.
  if (!simulacao.mostrarFeedback) {
    return recado("Conversa registrada", "Seu gestor vai comentar com você.");
  }

  // O tipo tem de ser `"sessao"` (US-018). Os treinos avaliados antes dela ficaram gravados no formato
  // da análise de conversa colada, sem os quatro momentos nem a oportunidade: em vez de mostrar uma
  // avaliação pela metade, a tela avisa — a conversa em si continua no histórico do vendedor.
  const registro = sessao.resultadoId ? obterResultado<Conversa, AvaliacaoSessao, Meta>(sessao.resultadoId) : null;
  if (!registro || registro.tipo !== "sessao") {
    return recado(
      "Esta conversa ainda não tem avaliação",
      "Ela ficou registrada e você pode treinar de novo. Se isso se repetir, avise quem enviou o link.",
    );
  }

  // O personagem é remontado com a **mesma semente** da conversa (o id da sessão), então o nome que
  // aparece na revelação é o mesmo com quem ele falou — remontar é mais barato que gravar o
  // personagem inteiro na sessão, e não deixa os dois desencontrarem.
  const tipoDeCliente = persona(sessao.personaId);
  const produto = obterProduto(simulacao.produtoId);
  const personagem = tipoDeCliente
    ? montarPersonagem({
        persona: personasDe([sessao.personaId])[0],
        dificuldade: simulacao.dificuldade,
        produto: produto ?? { nome: simulacao.nome, conhecimento: undefined },
        semente: sessao.id,
      })
    : null;

  return (
    <Moldura largo>
      <FeedbackVendedor
        codigo={token}
        cliente={
          tipoDeCliente
            ? {
                tipoDeCliente: rotulo(tipoDeCliente),
                comportamento: tipoDeCliente.comportamento,
                perfil: personagem ? frasePerfil(personagem.nome, adjetivosDoCliente(tipoDeCliente, simulacao.dificuldade)) : undefined,
              }
            : null
        }
        resultado={{ conversa: registro.entrada, avaliacao: registro.saida, meta: registro.meta, id: registro.id, titulo: registro.titulo }}
        tentativas={tentativas}
        demoTexto="Exemplo fixo: as notas abaixo não são um julgamento da conversa que você teve."
      />
    </Moldura>
  );
}

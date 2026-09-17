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
import { persona, rotulo } from "@/lib/personas";
import { obter as obterSessao } from "@/lib/sessoes";
import { lerSessaoVendedor } from "@/lib/sessao-vendedor";
import { obter as obterSimulacao } from "@/lib/simulacoes";
import type { Meta } from "@/lib/ai";
import type { Analise, Conversa } from "@/lib/types";
import { Resultado } from "@/app/page";
import { Cartao, Moldura } from "../../Moldura";

export const dynamic = "force-dynamic";

function Recado({ titulo, descricao, token }: { titulo: string; descricao: string; token: string }) {
  return (
    <Cartao>
      <h1 className="text-[22px] leading-[1.2] font-extrabold tracking-[-0.02em] mb-2">{titulo}</h1>
      <p className="text-muted mb-5">{descricao}</p>
      <a className="btn-link text-[13.5px]" href={`/simular/${token}/meus-resultados`}>
        Ver minhas conversas
      </a>
    </Cartao>
  );
}

export default async function Page({ params }: PageProps<"/simular/[token]/meus-resultados/[sessao]">) {
  const { token, sessao: sessaoId } = await params;

  const simulacao = obterSimulacao(token);
  if (!simulacao) {
    return (
      <Cartao>
        <h1 className="text-[22px] leading-[1.2] font-extrabold tracking-[-0.02em] mb-2">Este link não existe</h1>
        <p className="text-muted">Confira se o endereço foi copiado corretamente, ou peça um novo link de treino a quem enviou este convite.</p>
      </Cartao>
    );
  }

  const sessaoVendedor = lerSessaoVendedor((await headers()).get("cookie"));
  const participante = sessaoVendedor ? obterParticipante(sessaoVendedor.participanteId) : null;
  if (!participante) redirect(`/simular/${token}`);

  // O dono da conversa é reconferido no banco, nunca deduzido do endereço: sem isto, trocar o id na
  // barra abriria o feedback de um colega, com a conversa inteira dele dentro.
  const sessao = obterSessao(sessaoId);
  if (!sessao || sessao.participanteId !== participante.id || sessao.simulacaoCodigo !== token) {
    return <Recado token={token} titulo="Esta conversa não está aqui" descricao="O endereço pode ter sido copiado pela metade, ou esta conversa é de outra pessoa." />;
  }

  // O gestor pode ter desligado o feedback ao criar o treino (US-011): a avaliação existe e é dele.
  if (!simulacao.mostrarFeedback) {
    return <Recado token={token} titulo="Conversa registrada" descricao="Neste treino a avaliação vai para quem enviou o link. Seu gestor vai comentar com você." />;
  }

  const registro = sessao.resultadoId ? obterResultado<Conversa, Analise, Meta>(sessao.resultadoId) : null;
  if (!registro || registro.tipo !== "conversa") {
    return (
      <Recado
        token={token}
        titulo="Esta conversa ainda não tem avaliação"
        descricao="Ela ficou registrada e você pode treinar de novo. Se isso se repetir, avise quem enviou o link."
      />
    );
  }

  const tipoDeCliente = persona(sessao.personaId);

  return (
    <Moldura largo>
      {tipoDeCliente && (
        <div className="card p-5 max-md:p-4 mb-5">
          <div className="text-muted text-[12.5px] font-semibold uppercase tracking-[0.04em] mb-1">O cliente com quem você falou</div>
          <div className="text-[17px] font-extrabold tracking-[-0.01em]">{rotulo(tipoDeCliente)}</div>
          <p className="text-muted text-[13.5px] mt-1">{tipoDeCliente.comportamento}</p>
        </div>
      )}

      <Resultado
        conversa={registro.entrada}
        analise={registro.saida}
        meta={registro.meta}
        id={registro.id}
        titulo={registro.titulo}
        demoTexto="Exemplo fixo: a avaliação abaixo não é sobre a conversa que você teve."
      />

      <p className="mt-6">
        <a className="btn-link text-[13.5px]" href={`/simular/${token}/meus-resultados`}>
          Ver minhas conversas
        </a>
      </p>
    </Moldura>
  );
}

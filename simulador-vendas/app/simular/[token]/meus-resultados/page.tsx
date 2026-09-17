// "Minhas conversas" (US-017): o histórico do vendedor dentro de um treino.
//
// É a tela que responde "estou melhorando?" — a pergunta que faz alguém treinar de novo. Por isso ela
// mostra as conversas em ordem, com a nota de cada uma e o cliente que apareceu em cada tentativa.
//
// O **tipo de cliente** (a persona) aparece aqui, e só aqui e no feedback: depois da conversa saber que
// aquele era "o Cético" ensina; antes dela, transformaria o treino em decoreba (D2). A conversa que
// ainda está aberta é a única linha sem revelação — ela não terminou.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { obter as obterParticipante } from "@/lib/participantes";
import { persona, rotulo } from "@/lib/personas";
import { historicoDe, type SessaoComNota } from "@/lib/sessoes";
import { lerSessaoVendedor } from "@/lib/sessao-vendedor";
import { obter as obterSimulacao } from "@/lib/simulacoes";
import { data, numero } from "@/lib/formato";
import { Cartao, Moldura } from "../Moldura";

export const dynamic = "force-dynamic";

/** O que a linha diz quando não há nota: cada caso tem um motivo diferente e quem treinou merece sabê-lo. */
function semNota(sessao: SessaoComNota): string {
  if (sessao.status === "em_andamento") return "Conversa em andamento";
  if (!sessao.resultadoId) return "Sem avaliação";
  return "Avaliação a caminho";
}

export default async function Page({ params }: PageProps<"/simular/[token]/meus-resultados">) {
  const { token } = await params;

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
  // Sem identificação não há "minhas conversas": o link do treino é o mesmo para o time inteiro, e é a
  // identificação que separa as trinta pessoas que abriram ele.
  if (!participante) redirect(`/simular/${token}`);

  const conversas = historicoDe(token, participante.id);

  return (
    <Moldura>
      <div className="card p-7 max-md:p-[22px]">
        <p className="text-muted text-[13px] font-semibold mb-1">{simulacao.nome}</p>
        <h1 className="text-[22px] leading-[1.2] font-extrabold tracking-[-0.02em] mb-4">Minhas conversas</h1>

        {conversas.length === 0 ? (
          <p className="text-muted">Você ainda não treinou neste link. Quando terminar a primeira conversa, o resultado dela aparece aqui.</p>
        ) : (
          <ul className="flex flex-col">
            {conversas.map((c) => {
              const tipo = c.status === "em_andamento" ? null : persona(c.personaId);
              return (
                <li key={c.id} className="flex items-center gap-4 py-3.5 border-t border-line">
                  <div className="flex-1 min-w-0">
                    <div className="text-[14.5px] font-semibold">{data(c.criadoEm, { comHora: true })}</div>
                    <div className="text-muted text-[13px] truncate">{tipo ? `Seu cliente: ${rotulo(tipo)}` : "Conversa em andamento"}</div>
                  </div>
                  <div className="text-right shrink-0">
                    {c.nota === null ? (
                      <div className="text-muted text-[13px]">{semNota(c)}</div>
                    ) : (
                      <div className="text-[19px] font-extrabold tabular-nums leading-none">{numero(c.nota, 1)}</div>
                    )}
                    {c.resultadoId && (
                      <a className="btn-link text-[13px]" href={`/simular/${token}/meus-resultados/${c.id}`}>
                        Ver meu feedback
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-6">
          <a className="btn-link text-[13.5px]" href={`/simular/${token}`}>
            Voltar para o treino
          </a>
        </p>
      </div>
    </Moldura>
  );
}

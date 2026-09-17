// Sala de treino pública: o link que o gestor manda para o time inteiro (/simular/<código>).
//
// A ordem da tela é: treino disponível? → quem é você? (US-013) → ainda tem tentativa? → conversa.
// Nada aqui mostra menu do app, cabeçalho de gestor ou caminho para as configurações: quem abre este
// endereço é o vendedor, que não tem conta e não administra nada.
//
// Links antigos (as "salas" de antes da US-002) continuam abrindo: a migração converteu cada uma numa
// simulação com o mesmo código, e a linha em `salas` — que é quem guarda o cenário da conversa por
// texto/voz de hoje — continua existindo para elas.
import { headers } from "next/headers";
import { obter as obterSala, expirou } from "@/lib/salas";
import { obter as obterSimulacao } from "@/lib/simulacoes";
import { obter as obterProduto } from "@/lib/produtos";
import { obter as obterParticipante } from "@/lib/participantes";
import { melhorSessaoDe, tentativasDe } from "@/lib/sessoes";
import { lerSessaoVendedor } from "@/lib/sessao-vendedor";
import { nomeDoProvedor, provedoresDisponiveis } from "@/lib/entrar-vendedor";
import { obter as obterVendedor } from "@/lib/vendedores";
import { obter as obterCenario } from "@/lib/cenarios";
import { getConfig } from "@/lib/store";
import { integracaoConfigurada } from "@/lib/setup-comum";
import { ELEVENLABS_AGENTE } from "@/lib/integracoes";
import { SalaSimulacao } from "@/components/SalaSimulacao";
import { numero } from "@/lib/formato";
import { Identificacao } from "./Identificacao";

export const dynamic = "force-dynamic";

const MARCA = "S";
const NOME_APP = "Simulador de Vendas";

function Indisponivel({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <main className="min-h-[70vh] flex flex-col items-center justify-center text-center gap-3 px-6">
      <h1 className="text-2xl font-extrabold">{titulo}</h1>
      <p className="text-muted max-w-[420px]">{descricao}</p>
    </main>
  );
}

/** Molde das telas que o vendedor vê depois de se identificar: mesma marca, mesmo cartão, sem menu. */
function Cartao({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[520px] mx-auto px-8 py-12 max-md:px-4 max-md:py-8" style={{ colorScheme: "light" }}>
      <div className="flex items-center gap-3 mb-7">
        <div className="shrink-0 w-[34px] h-[34px] rounded-[9px] bg-accent text-white grid place-items-center font-extrabold text-[15px] tracking-tight">{MARCA}</div>
        <div className="font-bold text-[15px]">{NOME_APP}</div>
      </div>
      <div className="card p-7 max-md:p-[22px]">{children}</div>
    </div>
  );
}

export default async function Page({ params, searchParams }: PageProps<"/simular/[token]">) {
  const { token } = await params;
  const busca = await searchParams;
  const erro = typeof busca.erro === "string" ? busca.erro : undefined;
  const confirmou = busca.pronto === "1";

  // O treino pausado ou encerrado tem que dizer isso a quem abriu o link (US-012), e não "este link
  // não existe": quem recebeu o endereço no grupo do time precisa saber se espera ou se pede outro.
  const simulacao = obterSimulacao(token);
  if (simulacao?.status === "pausada") {
    return <Indisponivel titulo="Este treino está pausado" descricao="Fale com quem enviou o link: quando ele for reativado, este mesmo endereço volta a abrir." />;
  }
  if (simulacao?.status === "encerrada") {
    return <Indisponivel titulo="Este treino foi encerrado" descricao="Fale com quem enviou o link para saber se vai haver uma nova rodada." />;
  }

  const sala = obterSala(token);
  if (!simulacao && !sala) {
    return <Indisponivel titulo="Este link não existe" descricao="Confira se o endereço foi copiado corretamente, ou peça um novo link de treino a quem enviou este convite." />;
  }
  if (!simulacao && sala && expirou(sala)) {
    return <Indisponivel titulo="Este link expirou" descricao="Peça um novo link de treino a quem enviou este convite." />;
  }

  const cenario = sala?.cenarioId ? obterCenario(sala.cenarioId) : null;
  const comVoz = integracaoConfigurada(ELEVENLABS_AGENTE);
  const agentId = comVoz ? getConfig("ELEVENLABS_AGENT_ID") : undefined;

  // Link antigo sem simulação (instalação onde a migração ainda não rodou): segue o caminho de antes,
  // sem identificação, para ninguém ficar de fora de um treino que já estava no ar.
  if (!simulacao) {
    const vendedor = sala?.vendedorId ? obterVendedor(sala.vendedorId) : null;
    return <SalaSimulacao codigo={token} marca={MARCA} nome={NOME_APP} cenario={cenario} vendedorId={vendedor?.id} comVoz={comVoz} agentId={agentId || undefined} />;
  }

  const sessaoVendedor = lerSessaoVendedor((await headers()).get("cookie"));
  const participante = sessaoVendedor ? obterParticipante(sessaoVendedor.participanteId) : null;

  if (!participante || !confirmou) {
    const produto = obterProduto(simulacao.produtoId);
    return (
      <Identificacao
        codigo={token}
        marca={MARCA}
        nome={NOME_APP}
        titulo={simulacao.nome}
        produto={produto?.nome ?? "Treino de vendas"}
        contexto={`Você vai conversar com um cliente virtual por cerca de ${simulacao.duracaoMin} minutos e, no fim, recebe o que foi bem e o que dá para melhorar.`}
        provedores={provedoresDisponiveis().map((p) => ({ id: p, rotulo: `Entrar com ${nomeDoProvedor(p)}` }))}
        conhecido={participante?.nome ?? null}
        erroInicial={erro}
      />
    );
  }

  // Limite de tentativas (US-011): quem já usou todas não abre outra conversa — vê quantas fez e o
  // feedback da melhor delas, que é o que ele voltou aqui para reler.
  const tentativas = tentativasDe(token, participante.id);
  if (simulacao.maxTentativas !== null && tentativas >= simulacao.maxTentativas) {
    const melhor = melhorSessaoDe(token, participante.id);
    return (
      <Cartao>
        <h1 className="text-[22px] leading-[1.2] font-extrabold tracking-[-0.02em] mb-2">Você já concluiu este treino</h1>
        <p className="text-muted mb-5">
          {`Foram ${tentativas} de ${simulacao.maxTentativas} ${simulacao.maxTentativas === 1 ? "conversa" : "conversas"} em "${simulacao.nome}". Fale com quem enviou o link se precisar de mais uma chance.`}
        </p>
        {melhor ? (
          <>
            <p className="mb-4">
              Sua melhor conversa teve nota <strong>{numero(melhor.nota, 1)}</strong>.
            </p>
            <a className="btn-primary" href={`/r/${melhor.resultadoId}`}>
              Ver meu feedback
            </a>
          </>
        ) : (
          <p className="text-muted">Assim que a avaliação das suas conversas ficar pronta, ela aparece por aqui.</p>
        )}
      </Cartao>
    );
  }

  // PENDÊNCIA DE SEQUÊNCIA (PRD): a preparação ("Seu cliente") é a US-014 e a conversa com o cliente
  // simulado é a US-015. Enquanto elas não chegam, um link migrado abre a sala de hoje (já identificada,
  // o que é a melhoria desta história) e um treino criado no modelo novo mostra o que vem a seguir.
  if (sala) {
    return <SalaSimulacao codigo={token} marca={MARCA} nome={NOME_APP} cenario={cenario} vendedorId={participante.id} comVoz={comVoz} agentId={agentId || undefined} />;
  }

  return (
    <Cartao>
      <h1 className="text-[22px] leading-[1.2] font-extrabold tracking-[-0.02em] mb-2">{`Tudo pronto, ${participante.nome.split(" ")[0]}`}</h1>
      <p className="text-muted mb-4">
        {`Você entrou em "${simulacao.nome}". O próximo passo é conhecer o cliente que vai atender e começar a conversa.`}
      </p>
      <p className="text-muted">Esta parte do treino ainda está sendo preparada. Volte por este mesmo link em instantes.</p>
    </Cartao>
  );
}

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
import { emAndamento, emPreparacao, melhorSessaoDe, tentativasDe, transcricao } from "@/lib/sessoes";
import { montarPersonagem } from "@/lib/cliente-simulado";
import { personasDe } from "@/lib/personas";
import { lerSessaoVendedor } from "@/lib/sessao-vendedor";
import { nomeDoProvedor, provedoresDisponiveis } from "@/lib/entrar-vendedor";
import { obter as obterVendedor } from "@/lib/vendedores";
import { obter as obterCenario } from "@/lib/cenarios";
import { getConfig } from "@/lib/store";
import { integracaoConfigurada } from "@/lib/setup-comum";
import { ELEVENLABS_AGENTE } from "@/lib/integracoes";
import { SalaSimulacao } from "@/components/SalaSimulacao";
import { SalaAgente } from "@/components/SalaAgente";
import { SalaVoz, type PropsSalaVoz } from "@/components/SalaVoz";
import { numero } from "@/lib/formato";
import { Identificacao } from "./Identificacao";
import { Preparacao } from "./Preparacao";

export const dynamic = "force-dynamic";

const MARCA = "S";
const NOME_APP = "Simulador de Vendas";

/** Mesmo texto de app/api/salas/[token]/sessao: o que o vendedor combina quando o gestor não escreveu nada. */
const OBJETIVO_PADRAO = "Entender a situação do cliente e sair da conversa com um próximo passo combinado.";

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

  const produto = obterProduto(simulacao.produtoId);

  if (!participante || !confirmou) {
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

  // A conversa que esta pessoa já abriu e ainda não terminou. Ela é lida **antes** do limite de
  // tentativas porque já foi contada quando nasceu: sem isto, um treino de uma tentativa só barraria
  // o vendedor na própria vez, entre a preparação e o "Começar conversa".
  const aberta = emPreparacao(token, participante.id) ?? emAndamento(token, participante.id);

  // Limite de tentativas (US-011): quem já usou todas não abre outra conversa — vê quantas fez e o
  // feedback da melhor delas, que é o que ele voltou aqui para reler.
  const tentativas = tentativasDe(token, participante.id);
  if (!aberta && simulacao.maxTentativas !== null && tentativas >= simulacao.maxTentativas) {
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

  // Link migrado das salas antigas (US-002): daqui para frente ele segue o **mesmo** caminho de um
  // treino novo — preparação e depois a conversa. É a unificação que a US-014 deixou anunciada: com o
  // participante identificado e uma sessão própria, manter uma segunda sala só para esses links
  // significaria manter duas conversas, duas transcrições e duas avaliações vivas ao mesmo tempo. O
  // cenário gravado na sala antiga deixa de ser usado; o cliente passa a nascer da ficha do produto e
  // do tipo de cliente, como em qualquer outro treino.

  // A conversa (US-015). O personagem é remontado aqui com a **mesma semente** da preparação (o id da
  // sessão), então é o mesmo cliente que o vendedor acabou de conhecer. Só nome, cargo e empresa
  // atravessam para o navegador: `instrucoes` e `personaId` ficam no servidor (D2).
  if (aberta?.status === "em_andamento") {
    const personagem = montarPersonagem({
      persona: personasDe([aberta.personaId])[0],
      dificuldade: simulacao.dificuldade,
      produto: produto ?? { nome: simulacao.nome, conhecimento: undefined },
      semente: aberta.id,
    });
    const objetivo = simulacao.objetivo?.trim() || OBJETIVO_PADRAO;
    const nivel2: PropsSalaVoz = {
      codigo: token,
      marca: MARCA,
      nome: NOME_APP,
      titulo: simulacao.nome,
      cliente: { nome: personagem.nome, cargo: personagem.cargo, empresa: personagem.empresa },
      objetivo,
      duracaoMin: simulacao.duracaoMin,
      iniciadaEm: aberta.iniciadaEm ?? aberta.criadoEm,
      // Recarregar a página no meio do treino não apaga a conversa: ela vem do servidor, de onde parou.
      falasIniciais: transcricao(aberta.id).map((m) => ({ papel: m.papel, texto: m.texto })),
      porVoz: simulacao.permiteVoz,
      porTexto: simulacao.permiteTexto,
      // A chave da voz nunca vem para cá: a tela só precisa saber se existe uma para pedir o áudio
      // ao servidor, ou se a fala do cliente sai do próprio navegador.
      vozDoServidor: Boolean(getConfig("ELEVENLABS_API_KEY")),
    };

    // Nível 1 (US-016): com o agente conversacional conectado, quem conduz a conversa é ele, e as
    // variáveis que ele recebe são as da **sessão** — cada vendedor no mesmo link tem a sua.
    //
    // `persona_instrucoes` é o único lugar do app em que o system prompt do personagem atravessa para
    // o navegador, e não há como ser diferente: o widget roda ali e é ele quem fala com o agente. A
    // regra de esconder as instruções (D2) continua valendo em toda rota — a preparação, o turno da
    // conversa e o resultado seguem devolvendo só o personagem visível.
    if (comVoz && agentId && simulacao.permiteVoz) {
      return (
        <SalaAgente
          agente={agentId}
          variaveis={{
            sessao_id: aberta.id,
            simulacao: simulacao.nome,
            produto: produto?.nome ?? simulacao.nome,
            persona_instrucoes: personagem.instrucoes,
            participante: participante.nome,
            duracao_minutos: String(simulacao.duracaoMin),
          }}
          navegador={nivel2}
        />
      );
    }

    return <SalaVoz {...nivel2} />;
  }

  return <Preparacao codigo={token} marca={MARCA} nome={NOME_APP} titulo={simulacao.nome} produto={produto?.nome ?? "Treino de vendas"} />;
}

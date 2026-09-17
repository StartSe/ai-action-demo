// Sala de simulação pública: o link que "Criar link de treino" gera (app/page.tsx) aponta para cá.
// Sem a ElevenLabs conectada, mostra a conversa por texto (components/SalaSimulacao); com ela conectada,
// mostra o widget oficial de voz. Reaproveita lib/salas.ts (token, prazo de 30 dias, sem limite de usos).
import { obter as obterSala, expirou } from "@/lib/salas";
import { obter as obterSimulacao } from "@/lib/simulacoes";
import { obter as obterVendedor } from "@/lib/vendedores";
import { obter as obterCenario } from "@/lib/cenarios";
import { getConfig } from "@/lib/store";
import { integracaoConfigurada } from "@/lib/setup-comum";
import { ELEVENLABS_AGENTE } from "@/lib/integracoes";
import { SalaSimulacao } from "@/components/SalaSimulacao";

export const dynamic = "force-dynamic";

function Indisponivel({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <main className="min-h-[70vh] flex flex-col items-center justify-center text-center gap-3 px-6">
      <h1 className="text-2xl font-extrabold">{titulo}</h1>
      <p className="text-muted max-w-[420px]">{descricao}</p>
    </main>
  );
}

export default async function Page({ params }: PageProps<"/simular/[token]">) {
  const { token } = await params;

  // O treino pausado ou encerrado tem que dizer isso a quem abriu o link (US-012), e não "este link
  // não existe": quem recebeu o endereço no grupo do time precisa saber se espera ou se pede outro.
  // A simulação é consultada antes da sala porque toda sala migrada (US-002) virou uma simulação com
  // o mesmo código — inclusive as que já tinham vencido, que nasceram `encerrada`.
  const simulacao = obterSimulacao(token);
  if (simulacao?.status === "pausada") {
    return <Indisponivel titulo="Este treino está pausado" descricao="Fale com quem enviou o link: quando ele for reativado, este mesmo endereço volta a abrir." />;
  }
  if (simulacao?.status === "encerrada") {
    return <Indisponivel titulo="Este treino foi encerrado" descricao="Fale com quem enviou o link para saber se vai haver uma nova rodada." />;
  }

  const sala = obterSala(token);

  if (!sala) {
    return <Indisponivel titulo="Este link não existe" descricao="Confira se o endereço foi copiado corretamente, ou peça um novo link de treino a quem enviou este convite." />;
  }
  if (expirou(sala)) {
    return <Indisponivel titulo="Este link expirou" descricao="Peça um novo link de treino a quem enviou este convite." />;
  }

  const vendedor = sala.vendedorId ? obterVendedor(sala.vendedorId) : null;
  const cenario = sala.cenarioId ? obterCenario(sala.cenarioId) : null;
  const comVoz = integracaoConfigurada(ELEVENLABS_AGENTE);
  const agentId = comVoz ? getConfig("ELEVENLABS_AGENT_ID") : undefined;

  return (
    <SalaSimulacao
      codigo={token}
      marca="S"
      nome="Simulador de Vendas"
      cenario={cenario}
      vendedorId={vendedor?.id}
      comVoz={comVoz}
      agentId={agentId || undefined}
    />
  );
}

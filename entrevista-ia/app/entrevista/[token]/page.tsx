// Sala de entrevista pública: o link do convite (US-014) aponta para cá em vez de para app/f/[token],
// porque a conversa (components/Sala.tsx) não cabe no formulário genérico de campos texto/textarea.
// Reaproveita o mesmo lib/formularios.ts (código do link, limite de uma resposta) usado pelos
// formulários genéricos.
//
// Dois tipos de link convivem aqui: `entrevista` (o convite de hoje, que sabe de qual vaga e de qual
// pessoa é) e `scorecard` (os links criados antes desta história). Quem conhece os dois é
// `resolverConvite()` — ver lib/convite.ts e a nota de remoção do tipo antigo no CLAUDE.md.
//
// O link usa a conversa do app com a voz escolhida no setup. Configurações antigas de agente
// não alteram silenciosamente a experiência nem exigem um widget externo para começar.
import { headers } from "next/headers";
import { EntrevistaCandidato } from "@/components/EntrevistaCandidato";
import { AGRADECIMENTO_APOIO, agradecimentoTitulo } from "@/lib/formato";
import { abrirSala } from "@/lib/sala-do-candidato";
import { ttsEnabled } from "@/lib/voz";

export const dynamic = "force-dynamic";

function Indisponivel({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <main className="min-h-[70vh] flex flex-col items-center justify-center text-center gap-3 px-6">
      <h1 className="text-2xl font-extrabold">{titulo}</h1>
      <p className="text-muted max-w-[420px]">{descricao}</p>
    </main>
  );
}

/** Quem volta ao link depois de conversar lê a MESMA tela do fim da entrevista (US-021), nunca "este
 * link já foi usado": a pessoa acabou de responder oito perguntas, e uma frase de link vencido faz
 * parecer que o que ela disse se perdeu. */
function Agradecimento({ nome }: { nome?: string }) {
  return (
    <main className="min-h-[70vh] flex flex-col items-center justify-center text-center gap-3 px-6">
      <h1 className="text-2xl font-extrabold">{agradecimentoTitulo(nome)}</h1>
      <p className="text-muted max-w-[420px]">{AGRADECIMENTO_APOIO} Você já pode fechar esta página.</p>
    </main>
  );
}

export default async function Page({ params }: PageProps<"/entrevista/[token]">) {
  const { token } = await params;
  // O candidato abriu o convite: quem acompanha o processo vê "Link aberto" em vez de continuar
  // esperando. Só na primeira vez — recarregar a página não reescreve a linha do tempo.
  const resultado = abrirSala(token, (await headers()).get("cookie"));

  if (!resultado.ok) {
    if (resultado.motivo === "concluida") return <Agradecimento nome={resultado.nome} />;
    return <Indisponivel titulo={resultado.titulo} descricao={resultado.descricao} />;
  }

  const { marca, nome, vaga, duracaoMin } = resultado.sala;
  return (
    <EntrevistaCandidato
      codigo={token}
      marca={marca}
      nome={nome}
      vaga={vaga}
      duracaoMin={duracaoMin}
      vozLigada={ttsEnabled()}
      retomando={resultado.entrevista?.status === "em_andamento"}
      conversaNoNavegador={!resultado.entrevista}
    />
  );
}

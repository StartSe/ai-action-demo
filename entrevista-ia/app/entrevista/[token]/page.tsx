// Sala de entrevista pública: o link do convite (US-014) aponta para cá em vez de para app/f/[token],
// porque a conversa (components/Sala.tsx) não cabe no formulário genérico de campos texto/textarea.
// Reaproveita o mesmo lib/formularios.ts (código do link, limite de uma resposta) usado pelos
// formulários genéricos.
//
// Dois tipos de link convivem aqui: `entrevista` (o convite de hoje, que sabe de qual vaga e de qual
// pessoa é) e `scorecard` (os links criados antes desta história). Quem conhece os dois é
// `resolverConvite()` — ver lib/convite.ts e a nota de remoção do tipo antigo no CLAUDE.md.
import { FECHADO, resolverConvite } from "@/lib/convite";
import { mudarStatus, obter as obterEntrevista } from "@/lib/entrevistas";
import { EntrevistaCandidato } from "@/components/EntrevistaCandidato";
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

export default async function Page({ params }: PageProps<"/entrevista/[token]">) {
  const { token } = await params;
  const resolucao = resolverConvite(token);

  if (!resolucao.ok) {
    const { titulo, descricao } = FECHADO[resolucao.motivo];
    return <Indisponivel titulo={titulo} descricao={descricao} />;
  }

  // O candidato abriu o convite: quem acompanha o processo vê "Link aberto" em vez de continuar
  // esperando. Só na primeira vez — recarregar a página não reescreve a linha do tempo.
  const { marca, nome, vaga, entrevistaId } = resolucao.sala;
  if (entrevistaId && obterEntrevista(entrevistaId)?.status === "convidada") {
    mudarStatus(entrevistaId, "aberta");
  }

  // A tela do candidato não consulta /api/status (rota privada): quem diz se a voz natural está
  // ligada é o próprio servidor, aqui.
  return <EntrevistaCandidato codigo={token} marca={marca} nome={nome} vaga={vaga} vozLigada={ttsEnabled()} />;
}

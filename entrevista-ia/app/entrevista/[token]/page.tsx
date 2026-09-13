// Sala de entrevista pública: o link que o gestor gera em "Criar link para candidatos" (app/page.tsx)
// aponta para cá em vez de para app/f/[token], porque a conversa (components/Sala.tsx) não cabe no
// formulário genérico de campos texto/textarea. Reaproveita o mesmo lib/formularios.ts (token, prazo,
// limite de uma resposta) usado pelos formulários genéricos.
import type { ParametrosCandidato } from "@/lib/entrevista";
import { expirou, listarRespostas, obter } from "@/lib/formularios";
import { EntrevistaCandidato } from "@/components/EntrevistaCandidato";

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
  const formulario = obter<ParametrosCandidato>(token);

  if (!formulario || formulario.tipo !== "scorecard") {
    return <Indisponivel titulo="Este link não existe" descricao="Confira se o endereço foi copiado corretamente, ou peça um novo link a quem enviou este convite." />;
  }

  if (expirou(formulario)) {
    return <Indisponivel titulo="Este link expirou" descricao="Peça um novo link a quem enviou este convite." />;
  }

  const jaRespondido = formulario.limite !== null && listarRespostas(token).length >= formulario.limite;
  if (jaRespondido) {
    return <Indisponivel titulo="Esta entrevista já foi concluída" descricao="Este link já recebeu uma resposta e não pode ser usado de novo." />;
  }

  const { marca, nome, vaga } = formulario.parametros;
  return <EntrevistaCandidato codigo={token} marca={marca} nome={nome} vaga={vaga} />;
}

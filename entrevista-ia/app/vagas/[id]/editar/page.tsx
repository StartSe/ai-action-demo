"use client";
// Editar uma vaga (US-005): o mesmo `components/FormularioVaga.tsx` da abertura, preenchido com o
// que está salvo.
//
// Mudar a vaga muda o que a entrevistadora pergunta **daqui para frente**; as entrevistas já feitas
// continuam com o parecer que foi gerado na época, porque o parecer é o registro do que aconteceu.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FormularioVaga,
  corpoDaVaga,
  dadosDaVaga,
  type DadosVaga,
  type ValorDaEmpresa,
  type VagaSalva,
} from "@/components/FormularioVaga";
import { ErrorBox, Topbar, lerErro, useStatus, type ErroLido } from "@/components/ui";
import { ACAO_CULTURA } from "@/lib/acoes";

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [dados, setDados] = useState<DadosVaga | null>(null);
  const [culturaDeExemplo, setCulturaDeExemplo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState("");
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/vagas/${id}`).then((r) => (r.ok ? r.json() : Promise.reject(r))),
      fetch("/api/cultura").then((r) => (r.ok ? r.json() : Promise.reject(r))),
    ])
      .then(([daVaga, daEmpresa]: [{ vaga: VagaSalva }, { cultura: { valores: ValorDaEmpresa[]; exemplo: boolean } }]) => {
        setDados(dadosDaVaga(daVaga.vaga, daEmpresa.cultura.valores));
        setCulturaDeExemplo(daEmpresa.cultura.exemplo);
      })
      .catch(async (e) => setErroTela(await lerErro(e)));
  }, [id]);

  async function salvar() {
    if (!dados) return;
    setSalvando(true);
    setFalha("");
    try {
      const r = await fetch(`/api/vagas/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpoDaVaga(dados)) });
      if (!r.ok) throw r;
      router.push("/vagas");
    } catch (e) {
      setFalha((await lerErro(e)).mensagem);
      setSalvando(false);
    }
  }

  return (
    <>
      <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[760px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Link href="/vagas" className="btn-link text-[13px]">← Vagas</Link>
        <h1 className="titulo-painel mt-3 mb-1.5">Editar vaga</h1>
        <p className="apoio mb-6">O que mudar aqui vale para as próximas entrevistas desta vaga.</p>

        {erroTela ? (
          <ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao ?? { rotulo: "Voltar para as vagas", url: "/vagas" }} />
        ) : dados ? (
          <FormularioVaga
            dados={dados}
            onMudar={setDados}
            onSalvar={() => void salvar()}
            onCancelar={() => router.push("/vagas")}
            salvando={salvando}
            erro={falha}
            rotuloSalvar="Salvar vaga"
            culturaDeExemplo={culturaDeExemplo}
            acaoCultura={ACAO_CULTURA}
          />
        ) : (
          <p className="text-muted text-sm">Carregando...</p>
        )}
      </main>
    </>
  );
}

"use client";
// Abrir uma vaga (US-005).
//
// A tela é fina de propósito: quem sabe o que é uma vaga é `components/FormularioVaga.tsx` (usado
// também na edição) e `lib/vagas.ts` (que valida). Aqui ficam só o estado, a chamada e para onde ir
// depois de salvar.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DescricaoColada } from "@/components/DescricaoColada";
import {
  FormularioVaga,
  VAGA_DE_EXEMPLO,
  aplicarVagaEstruturada,
  corpoDaVaga,
  dadosVazios,
  type DadosVaga,
  type ValorDaEmpresa,
} from "@/components/FormularioVaga";
import { Topbar, lerErro, useStatus } from "@/components/ui";
import { ACAO_CULTURA } from "@/lib/acoes";

type RespostaCultura = { cultura: { valores: ValorDaEmpresa[]; exemplo: boolean } };

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();

  const [dados, setDados] = useState<DadosVaga | null>(null);
  const [culturaDeExemplo, setCulturaDeExemplo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState("");

  // As competências culturais da empresa (US-003) já vêm marcadas na vaga nova, e "Preencher com um
  // exemplo" (o estado vazio da lista) chega por `?exemplo=1`. Os dois dependem da mesma leitura, por
  // isso o formulário só nasce depois dela.
  useEffect(() => {
    const querExemplo = new URLSearchParams(window.location.search).get("exemplo") === "1";
    fetch("/api/cultura")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo: RespostaCultura) => {
        const base = dadosVazios(corpo.cultura.valores);
        setDados(querExemplo ? { ...base, ...VAGA_DE_EXEMPLO } : base);
        setCulturaDeExemplo(corpo.cultura.exemplo);
      })
      .catch(async (e) => {
        setDados(dadosVazios([]));
        setFalha((await lerErro(e)).mensagem);
      });
  }, []);

  async function salvar() {
    if (!dados) return;
    setSalvando(true);
    setFalha("");
    try {
      const r = await fetch("/api/vagas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpoDaVaga(dados)) });
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
        <h1 className="titulo-painel mt-3 mb-1.5">Abrir vaga</h1>
        <p className="apoio mb-6">Preencha uma vez: todo candidato desta vaga responde sobre os mesmos requisitos.</p>

        {dados ? (
          <FormularioVaga
            dados={dados}
            onMudar={setDados}
            onSalvar={() => void salvar()}
            onCancelar={() => router.push("/vagas")}
            salvando={salvando}
            erro={falha}
            rotuloSalvar="Abrir vaga"
            culturaDeExemplo={culturaDeExemplo}
            acaoCultura={ACAO_CULTURA}
          >
            <DescricaoColada onPreencher={(vaga) => setDados((atual) => (atual ? aplicarVagaEstruturada(atual, vaga) : atual))} />
          </FormularioVaga>
        ) : (
          <p className="text-muted text-sm">Carregando...</p>
        )}
      </main>
    </>
  );
}

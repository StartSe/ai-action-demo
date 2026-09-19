"use client";
// Cadastrar um candidato (US-008).
//
// A tela é fina de propósito: quem sabe o que é um candidato é `components/FormularioCandidato.tsx`
// e `lib/candidatos.ts` (que valida); quem sabe ler um currículo é `lib/curriculo.ts`. Aqui ficam o
// estado, a chamada e para onde ir depois de salvar.
//
// Com `?vaga=<id>` — o caminho que vem do diálogo "Adicionar candidato" da vaga — o candidato salvo
// já é atribuído à vaga e a tela volta para lá com o recado. O convite em si (o link e a mensagem
// pronta) é da US-014.
import Link from "next/link";
import { PesquisaComplementar } from "@/components/PesquisaComplementar";
import type { Ficha } from "@/lib/types";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  FormularioCandidato,
  corpoDoCandidato,
  dadosVaziosCandidato,
  type DadosCandidato,
} from "@/components/FormularioCandidato";
import { Aviso, Topbar, lerErro, useStatus } from "@/components/ui";

/**
 * Depois de salvar: o candidato está criado e alguma coisa ficou faltando.
 *
 * Duas faltas diferentes, com saídas diferentes: **sem texto** (o arquivo não deu texto nenhum), e aí
 * a saída é colar o currículo; **com texto, sem ficha** (a leitura da US-009 estourou o prazo ou
 * falhou), e aí a saída é pedir para ler de novo — o texto já está guardado, não há o que colar.
 */
type Salvo = { id: string; nome: string; aviso: string; temTexto: boolean; ficha?: Ficha; linkedinUrl?: string };

function Conteudo() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const vaga = useSearchParams().get("vaga");

  const [dados, setDados] = useState<DadosCandidato>(dadosVaziosCandidato);
  const [curriculo, setCurriculo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState("");
  const [salvo, setSalvo] = useState<Salvo | null>(null);
  const [textoColado, setTextoColado] = useState("");
  const [preparado, setPreparado] = useState<Salvo | null>(null);
  const [convitePendente, setConvitePendente] = useState<Salvo | null>(null);

  // Sem vaga no endereço, o lugar de cair é a ficha recém-montada (US-013): é ela que a pessoa quer
  // conferir depois de enviar um currículo. Vindo da vaga, o lugar continua sendo a vaga.
  const destino = (candidatoId: string) => (vaga ? `/vagas/${vaga}?candidato=${encodeURIComponent(candidatoId)}` : `/candidatos/${candidatoId}`);

  function continuar(candidato: Salvo) {
    if (candidato.aviso) {
      setSalvo(candidato);
      setSalvando(false);
    } else {
      setPreparado(candidato);
      setSalvando(false);
    }
  }

  async function gerarConvite(candidato: Salvo) {
    setSalvando(true);
    setFalha("");
    try {
      const atribuicao = await fetch("/api/entrevistas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vagaId: vaga, candidatoId: candidato.id }),
      });
      if (!atribuicao.ok) throw atribuicao;
      setConvitePendente(null);
      continuar(candidato);
    } catch (e) {
      // A pessoa já foi salva. Uma nova tentativa deve repetir só a atribuição,
      // que é idempotente para o mesmo candidato e vaga, nunca o cadastro.
      setConvitePendente(candidato);
      setFalha((await lerErro(e)).mensagem);
      setSalvando(false);
    }
  }

  async function salvar() {
    if (salvando) return;
    setSalvando(true);
    setFalha("");
    try {
      const r = await fetch("/api/candidatos", { method: "POST", body: corpoDoCandidato(dados, curriculo) });
      if (!r.ok) throw r;
      const { candidato, aviso } = await r.json();
      const cadastrado: Salvo = { id: candidato.id, nome: candidato.nome, aviso: aviso || "", temTexto: Boolean(candidato.temCvTexto), ficha: candidato.ficha, linkedinUrl: candidato.linkedinUrl };
      if (vaga) await gerarConvite(cadastrado);
      else continuar(cadastrado);
    } catch (e) {
      setFalha((await lerErro(e)).mensagem);
      setSalvando(false);
    }
  }

  /**
   * O texto que a pessoa colou entra no mesmo lugar do que sairia do arquivo: `cvTexto` — e, logo em
   * seguida, vira ficha pelo mesmo caminho de sempre. Se a leitura falhar, ela não segura a pessoa
   * nesta tela: o texto já está salvo e "Ler o currículo de novo" continua à mão na ficha.
   */
  async function salvarTexto() {
    if (!salvo || !textoColado.trim()) return;
    setSalvando(true);
    setFalha("");
    try {
      const r = await fetch(`/api/candidatos/${salvo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvTexto: textoColado }),
      });
      if (!r.ok) throw r;
      await fetch(`/api/candidatos/${salvo.id}/ficha`, { method: "POST" }).catch(() => null);
      router.push(destino(salvo.id));
    } catch (e) {
      setFalha((await lerErro(e)).mensagem);
      setSalvando(false);
    }
  }

  /** O texto do currículo já está guardado: só faltou a ficha. */
  async function lerDeNovo() {
    if (!salvo) return;
    setSalvando(true);
    setFalha("");
    try {
      const r = await fetch(`/api/candidatos/${salvo.id}/ficha`, { method: "POST" });
      if (!r.ok) throw r;
      router.push(destino(salvo.id));
    } catch (e) {
      setFalha((await lerErro(e)).mensagem);
      setSalvando(false);
    }
  }

  return (
    <>
      <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[760px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <Link href={vaga ? `/vagas/${vaga}` : "/candidatos"} className="btn-link text-[13px]">
          {vaga ? "← Voltar para a vaga" : "← Candidatos"}
        </Link>
        <h1 className="titulo-painel mt-3 mb-1.5">Cadastrar candidato</h1>
        <p className="apoio mb-6">Comece com o nome e o currículo. LinkedIn e anotações são opcionais.</p>

        {preparado ? (
          <>
            <div className="card p-5 mb-5 border-accent/30">
              <p className="sobretitulo mb-2">Cadastro concluído</p>
              <h2 className="font-bold text-xl">{preparado.nome}</h2>
              <p className="text-sm text-muted mt-2">{vaga ? "O link de entrevista já está pronto. Você pode complementar a ficha antes de compartilhar." : "A ficha está salva. Você pode complementar os dados agora ou continuar para escolher uma vaga."}</p>
            </div>
            <PesquisaComplementar candidato={preparado} />
            <button type="button" className="btn-primary !w-auto max-md:!w-full" onClick={() => router.push(destino(preparado.id))}>{vaga ? "Continuar para o link da entrevista →" : "Continuar para a ficha →"}</button>
          </>
        ) : convitePendente ? (
          <section className="card p-6 max-md:p-5">
            <h2 className="font-bold text-lg mb-2">{convitePendente.nome} já está cadastrado</h2>
            <p className="text-muted text-sm mb-4">Falta gerar o link para esta vaga. Você pode tentar novamente sem refazer o cadastro.</p>
            {falha && <div className="mb-4"><Aviso tom="danger">{falha}</Aviso></div>}
            <div className="flex gap-3 flex-wrap">
              <button type="button" className="btn-primary !w-auto max-md:!w-full" disabled={salvando} onClick={() => void gerarConvite(convitePendente)}>
                {salvando ? "Gerando link..." : "Tentar gerar o link novamente"}
              </button>
              <Link className="btn-ghost" href={`/candidatos/${convitePendente.id}`}>Ver candidato salvo</Link>
            </div>
          </section>
        ) : salvo ? (
          <section className="card p-6 max-md:p-5">
            <h2 className="font-bold text-[16px] mb-1.5">{salvo.nome} está cadastrado</h2>
            <p className="text-muted text-sm mb-4">O arquivo do currículo ficou guardado e você pode abri-lo quando quiser.</p>

            <div className="mb-4">
              <Aviso tom="warn">{salvo.aviso}</Aviso>
            </div>

            {!salvo.temTexto && (
              <div className="flex flex-col gap-1.5 mb-4">
                <label htmlFor="candidato-cv-texto" className="text-[13px] font-semibold">Texto do currículo</label>
                <textarea
                  id="candidato-cv-texto"
                  className="input min-h-40 resize-y"
                  value={textoColado}
                  placeholder="Cole aqui o texto do currículo, do jeito que estiver."
                  onChange={(e) => setTextoColado(e.target.value)}
                />
              </div>
            )}

            {falha && (
              <div className="mb-4">
                <Aviso tom="danger">{falha}</Aviso>
              </div>
            )}

            <div className="flex items-center gap-2.5 flex-wrap">
              {salvo.temTexto ? (
                <button type="button" id="candidato-ler-de-novo" className="btn-primary !w-auto max-md:!w-full" disabled={salvando} onClick={() => void lerDeNovo()}>
                  {salvando ? "Lendo..." : "Ler o currículo de novo"}
                </button>
              ) : (
                <button type="button" className="btn-primary !w-auto max-md:!w-full" disabled={salvando || !textoColado.trim()} onClick={() => void salvarTexto()}>
                  {salvando ? "Salvando..." : "Salvar o texto"}
                </button>
              )}
              <button type="button" className="btn-ghost !w-auto max-md:!w-full" onClick={() => router.push(destino(salvo.id))}>
                {salvo.temTexto ? "Continuar sem a ficha" : "Continuar sem o texto"}
              </button>
            </div>
          </section>
        ) : (
          <FormularioCandidato
            dados={dados}
            onMudar={setDados}
            curriculo={curriculo}
            onCurriculo={setCurriculo}
            onSalvar={() => void salvar()}
            onCancelar={() => router.push(vaga ? `/vagas/${vaga}` : "/candidatos")}
            salvando={salvando}
            erro={falha}
            rotuloSalvar={vaga ? "Cadastrar e gerar link" : "Cadastrar candidato"}
          />
        )}
      </main>
    </>
  );
}

export default function Page() {
  // `useSearchParams` obriga um limite de Suspense na compilação estática do Next.
  return (
    <Suspense fallback={null}>
      <Conteudo />
    </Suspense>
  );
}

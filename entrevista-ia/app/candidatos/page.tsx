"use client";
// A lista de candidatos (US-008). Nasceu na US-001 como destino do cabeçalho com um estado vazio;
// agora é a lista de verdade — o título e o texto de apoio são os mesmos de lá, de propósito.
//
// Tabela, e não cartões (ao contrário da lista de vagas): o que se quer aqui é comparar pessoas linha
// a linha — quem tem currículo lido, quem já está em processo, em qual vaga.
//
// A busca acontece no SERVIDOR (`GET /api/candidatos?busca=`), não em memória: a lista de candidatos
// cresce com o tempo e filtrar no navegador exigiria baixá-la inteira a cada tecla.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AvisoExemplo } from "@/components/AvisoExemplo";
import { Chip, DataTable, Empty, ErrorBox, Topbar, lerErro, useStatus, type Coluna, type ErroLido } from "@/components/ui";

type CandidatoLista = {
  id: string;
  nome: string;
  cidade?: string;
  cargoAtual?: string;
  origens: ("cv" | "web")[];
  cvNome?: string;
  entrevistas: number;
  ultimaVaga?: string;
  exemplo: boolean;
};

const ROTULO_ORIGEM: Record<"cv" | "web", string> = { cv: "CV", web: "Web" };

function IconeCandidatos() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="24" cy="23" r="9" />
      <path d="M8 50c0-8.8 7.2-14 16-14s16 5.2 16 14" />
      <path d="M44 18h12M44 26h12M44 34h8" />
    </svg>
  );
}

/** Toda célula que pode ficar sem conteúdo devolve "—": no celular o rótulo da coluna aparece
 * sempre, e um rótulo sozinho parece defeito. */
const COLUNAS: Coluna<CandidatoLista>[] = [
  { chave: "nome", titulo: "Candidato", papel: "titulo", largura: "17%", render: (c) => c.nome },
  {
    chave: "origem",
    titulo: "Ficha",
    papel: "chip",
    // `flex-nowrap` mais uma largura mínima: sem os dois a coluna fica estreita demais e "CV" e "Web"
    // empilham um sobre o outro, que no desktop parecem duas linhas diferentes da tabela.
    largura: "110px",
    render: (c) =>
      c.origens.length ? (
        <span className="flex items-center gap-1.5 flex-nowrap">
          {c.origens.map((o) => (
            <Chip key={o} nivel="neutral">{ROTULO_ORIGEM[o]}</Chip>
          ))}
        </span>
      ) : (
        <span className="text-muted text-[12.5px]">Sem ficha</span>
      ),
  },
  { chave: "cargo", titulo: "Cargo atual", render: (c) => c.cargoAtual || "—" },
  { chave: "cidade", titulo: "Cidade", render: (c) => c.cidade || "—" },
  {
    chave: "entrevistas",
    titulo: "Entrevistas",
    render: (c) => (c.entrevistas ? `${c.entrevistas}` : "Nenhuma"),
  },
  { chave: "ultimaVaga", titulo: "Última vaga", render: (c) => c.ultimaVaga || "—" },
  {
    chave: "curriculo",
    titulo: "Currículo",
    papel: "detalhe",
    render: (c) =>
      c.cvNome ? (
        // Abre em outra aba porque é o arquivo original (a rota é privada, como o resto do painel).
        <a href={`/api/candidatos/${c.id}/cv`} target="_blank" rel="noreferrer" className="btn-link">Abrir o currículo</a>
      ) : (
        "—"
      ),
  },
];

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();

  const [itens, setItens] = useState<CandidatoLista[] | null>(null);
  const [busca, setBusca] = useState("");
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);

  // Uma busca por digitação, com meio segundo de espera: quem digita "Bruno" não precisa de cinco
  // consultas para ver um nome. A primeira leitura (busca vazia) não espera nada.
  useEffect(() => {
    const termo = busca.trim();
    const tempo = setTimeout(() => {
      fetch(`/api/candidatos?busca=${encodeURIComponent(termo)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r)))
        .then((corpo) => setItens(corpo.itens))
        .catch(async (e) => {
          setErroTela(await lerErro(e));
          setItens([]);
        });
    }, termo ? 400 : 0);
    return () => clearTimeout(tempo);
  }, [busca]);

  const procurando = Boolean(busca.trim());
  const soExemplo = Boolean(itens?.length) && itens?.every((c) => c.exemplo);

  return (
    <>
      <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[980px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <div className="flex items-start justify-between gap-4 mb-6 max-md:flex-col max-md:gap-3">
          <div>
            <h1 className="titulo-painel mb-1.5">Candidatos</h1>
            <p className="apoio">Quem é a pessoa antes da conversa começar.</p>
          </div>
          <Link href="/candidatos/novo" className="btn-primary !w-auto shrink-0 max-md:!w-full">Cadastrar candidato</Link>
        </div>

        {erroTela && <div className="mb-5"><ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao} /></div>}

        {(procurando || Boolean(itens?.length)) && (
          <div className="flex flex-col gap-1.5 mb-5 max-w-[360px]">
            <label htmlFor="busca-candidatos" className="text-[13px] font-semibold">Procurar pelo nome</label>
            <input
              id="busca-candidatos"
              className="input"
              value={busca}
              placeholder="Comece a digitar o nome"
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        )}

        {soExemplo && (
          <AvisoExemplo>
            Os candidatos abaixo são um exemplo, com ficha e parecer prontos; eles somem quando você cadastrar o primeiro candidato de verdade.
          </AvisoExemplo>
        )}

        {itens === null ? (
          <p className="text-muted text-sm">Carregando...</p>
        ) : itens.length === 0 ? (
          procurando ? (
            <p className="text-muted text-sm border border-dashed border-line rounded-card p-8 text-center">Ninguém com esse nome ainda.</p>
          ) : (
            <Empty
              ilustracao={<IconeCandidatos />}
              titulo="Nenhum candidato cadastrado"
              descricao="Cadastre a pessoa pelo nome e envie o currículo: a IA lê o arquivo e preenche a ficha, com a origem de cada informação, para você revisar em vez de transcrever."
              acao="Cadastrar candidato"
              acaoSecundaria={{ rotulo: "Ver as vagas abertas", url: "/vagas" }}
              onAcao={() => router.push("/candidatos/novo")}
            />
          )
        ) : (
          <DataTable colunas={COLUNAS} linhas={itens} />
        )}
      </main>
    </>
  );
}

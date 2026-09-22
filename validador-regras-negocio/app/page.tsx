"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Entregar, ErrorBox, Field, Hero, Item, Loading, Origem, ResultHead, SeloIA, Section, Stage, Topbar, lerErro, useScrollToResult, useStatus } from "@/components/ui";
import { useRouter } from "next/navigation";
import { BLOCOS, rotuloDoBloco } from "@/lib/canvas";
import type { CodigoErroIA, Meta } from "@/lib/ai";
import type { DadosValidador, ResultadoValidacao } from "@/lib/types";

const EXEMPLO: DadosValidador = {
  descricao:
    "Quero criar um aplicativo de assinatura para academias pequenas e estúdios de treino personalizado gerenciarem o agendamento de aulas e a cobrança automática dos alunos. A ideia é vender para academias de até 30 alunos que hoje controlam tudo em papel ou em planilha. Pretendo divulgar com anúncios pagos no Instagram e pedir indicação para os clientes que já usarem. O plano custa R$ 79 por mês, sem limite de alunos cadastrados. Para tocar isso preciso manter a plataforma no ar e ter um time de suporte por WhatsApp.",
};

const VAZIO: DadosValidador = { descricao: "" };

const ETAPAS_CARREGANDO = ["Lendo a descrição da ideia...", "Distribuindo nos blocos do modelo de negócio...", "Comparando os blocos entre si..."];

// Textos do hero (título ≤ 8 palavras, apoio ≤ 20, itens ≤ 5 de até 6 palavras cada — ver CLAUDE.md).
const PROMESSA = {
  sobretitulo: "Gestão",
  titulo: "Descubra se a lógica do negócio fecha",
  apoio: "Descreva a ideia em texto livre e veja onde a proposta, o canal e o preço não se sustentam juntos.",
  itens: ["Ideia organizada no modelo de negócios", "Blocos sem informação ficam vazios", "Conflitos apontados entre dois blocos", "Sem pesquisa externa, só seu texto", "Pronto para copiar ou imprimir"],
};

function IconeIdeia() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9v.2h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3Z" />
    </svg>
  );
}

function IconeItem() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0 mt-0.5" aria-hidden="true">
      <path d="M5 12.5 9.5 17 19 7" />
    </svg>
  );
}

/** Prévia de "o que você vai receber", exibida no lugar do resultado antes da primeira validação. */
function Previa({ itens }: { itens: string[] }) {
  return (
    <div className="card p-7 max-md:p-5 h-full min-h-[420px] max-md:min-h-0 flex flex-col justify-center">
      <h2 className="font-bold text-[15px] mb-4">O que você vai receber</h2>
      <ul className="flex flex-col gap-3">
        {itens.map((it) => (
          <li key={it} className="flex items-start gap-2.5 text-sm text-ink-2">
            <IconeItem />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Estado =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string; codigo?: CodigoErroIA; acao?: { rotulo: string; url: string }; dados: DadosValidador }
  | { fase: "pronto"; resultado: ResultadoValidacao; dados: DadosValidador; meta: Meta; id?: string };

export default function Page() {
  const { status, erro } = useStatus();
  const router = useRouter();
  const [dados, setDados] = useState<DadosValidador>(VAZIO);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });
  const autoEnviado = useRef(false);

  useScrollToResult(estado.fase === "pronto");

  async function validar(d: DadosValidador) {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/validador", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      if (!r.ok) {
        // lerErro lê { error, codigo, acao } da rota (respostaErro) e nunca deixa status HTTP cru chegar à tela.
        const info = await lerErro(r);
        if (r.status === 401 && info.codigo === "sem_sessao") {
          router.push(`/entrar?next=${encodeURIComponent(location.pathname)}`);
          return;
        }
        setEstado({ fase: "erro", mensagem: info.mensagem, codigo: info.codigo as CodigoErroIA | undefined, acao: info.acao, dados: d });
        return;
      }
      const resposta = await r.json();
      setEstado({ fase: "pronto", resultado: resposta.resultado, dados: d, meta: resposta.meta, id: resposta.id });
    } catch (e) {
      const info = await lerErro(e);
      setEstado({ fase: "erro", mensagem: info.mensagem, dados: d });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    validar(dados);
  }

  /** "Preencher com um exemplo" preenche E valida: quem quer ver o resultado não precisa rolar até o botão. */
  function preencherExemplo() {
    setDados(EXEMPLO);
    validar(EXEMPLO);
  }

  // Atalho para demonstrações: /?exemplo=1 preenche e envia o formulário.
  useEffect(() => {
    if (autoEnviado.current) return;
    const params = new URLSearchParams(location.search);
    if (params.get("exemplo") === "1") {
      autoEnviado.current = true;
      setTimeout(() => { setDados(EXEMPLO); validar(EXEMPLO); }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma única vez ao abrir a página
  }, []);

  const carregando = estado.fase === "carregando";

  return (
    <>
      <Topbar marca="V" nome="Validador de Regras de Negócio" area="Gestão" status={status} erro={erro} resumo="Modo demonstração: o resultado exibido é um exemplo." usuario={status?.usuario} />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Gestão" />

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          <form onSubmit={onSubmit}>
            <div className="card p-5 mb-3">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-9 h-9 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0"><IconeIdeia /></div>
                <h2 className="font-bold text-[15px]">Sua ideia de negócio</h2>
              </div>
              <Field label="Descreva a ideia em texto livre" htmlFor="descricao" hint="Quanto mais detalhe sobre cliente, canal, preço e custo, mais completo fica o resultado.">
                <textarea
                  id="descricao"
                  className="input min-h-40 resize-y"
                  required
                  placeholder="Ex.: quero vender um aplicativo de assinatura para academias pequenas gerenciarem agenda e cobrança..."
                  value={dados.descricao}
                  onChange={(e) => setDados({ descricao: e.target.value })}
                />
              </Field>
              <button type="submit" className="btn-primary" disabled={carregando}>{carregando ? "Validando" : "Validar ideia"}</button>
              <button type="button" className="btn-secundario mt-2" disabled={carregando} onClick={preencherExemplo}>Preencher com um exemplo</button>
            </div>
          </form>

          <div className="card p-5 mt-4">
            <p className="text-[13px] text-muted">
              A ideia fica salva neste app até você apagar em Histórico. Nenhuma busca externa é feita: a IA raciocina só sobre o texto que você escreveu.
            </p>
          </div>
        </div>

        <Stage>
          {estado.fase === "vazio" && <Previa itens={PROMESSA.itens} />}
          {estado.fase === "carregando" && <Loading etapas={ETAPAS_CARREGANDO} />}
          {estado.fase === "erro" && <ErrorBox mensagem={estado.mensagem} codigo={estado.codigo} acao={estado.acao} onTentarNovamente={() => validar(estado.dados)} />}
          {estado.fase === "pronto" && <Resultado resultado={estado.resultado} dados={estado.dados} meta={estado.meta} id={estado.id} />}
        </Stage>
      </main>
    </>
  );
}

export function Resultado({ resultado, meta, id }: { resultado: ResultadoValidacao; dados: DadosValidador; meta: Meta; id?: string }) {
  return (
    <article className="reveal">
      <ResultHead titulo="Validação da ideia de negócio" subtitulo="Business Model Canvas e inconsistências entre blocos">
        <Entregar id={id} titulo="Validação da ideia de negócio" texto={() => validacaoParaTexto(resultado)} />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoValidacao resultado={resultado} />

      <SeloIA demo={meta.demo} />
    </article>
  );
}

/** Corpo da validação (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoValidacao({ resultado }: { resultado: ResultadoValidacao }) {
  return (
    <>
      <Section titulo="Quadro de modelo de negócio">
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3.5">
          {BLOCOS.map(({ chave, rotulo }) => (
            <Item key={chave}>
              <h3 className="font-bold mb-1">{rotulo}</h3>
              {resultado.canvas[chave] ? (
                <p className="text-muted text-sm">{resultado.canvas[chave]}</p>
              ) : (
                <p className="text-muted text-sm italic">Sem informação suficiente na descrição.</p>
              )}
            </Item>
          ))}
        </div>
      </Section>

      <Section titulo="Inconsistências encontradas">
        {resultado.inconsistencias.length === 0 ? (
          <Item>
            <p className="text-muted text-sm">
              Não encontramos conflitos entre os blocos preenchidos. Isso pode ser porque a lógica se sustenta, ou porque a descrição ainda não trouxe informação suficiente para comparar os blocos entre si — descreva mais detalhes e valide de novo para uma checagem mais completa.
            </p>
          </Item>
        ) : (
          <div className="flex flex-col gap-3">
            {resultado.inconsistencias.map((inc, i) => (
              <div key={i} className="card shadow-none px-[22px] py-4">
                <p className="text-[13px] font-semibold text-accent-ink mb-1.5">
                  {rotuloDoBloco(inc.blocoA)} × {rotuloDoBloco(inc.blocoB)}
                </p>
                <p className="text-sm">{inc.descricao}</p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

function validacaoParaTexto(resultado: ResultadoValidacao): string {
  const l: string[] = ["Validação da ideia de negócio", "", "Quadro de modelo de negócio:"];
  for (const { chave, rotulo } of BLOCOS) {
    l.push(`- ${rotulo}: ${resultado.canvas[chave] ?? "sem informação suficiente na descrição"}`);
  }
  l.push("", "Inconsistências encontradas:");
  if (resultado.inconsistencias.length === 0) {
    l.push("- Nenhum conflito encontrado entre os blocos preenchidos.");
  } else {
    resultado.inconsistencias.forEach((inc) => l.push(`- ${rotuloDoBloco(inc.blocoA)} × ${rotuloDoBloco(inc.blocoB)}: ${inc.descricao}`));
  }
  return l.join("\n");
}

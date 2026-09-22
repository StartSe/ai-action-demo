"use client";
// "Comece descrevendo seu negócio": o passo 1 do Assistente deixou de abrir com um formulário de
// marcadores para preencher. A pessoa escreve duas frases sobre o negócio (ou clica num exemplo), o
// app monta o atendente e mostra o que decidiu — ela revisa e aplica.
//
// Aplicar NÃO salva: ele só preenche o formulário ao lado, e a pessoa continua saindo do passo 1 pelo
// "Salvar e testar o atendente" de sempre. Cada geração vira uma versão guardada na aba (sessionStorage),
// para comparar duas descrições sem perder a primeira.
//
// O estado mora num hook que devolve DUAS partes (`Cartao` e `Painel`), no mesmo desenho de
// `useConfirmacao` (components/ui.tsx): o cartão vai acima do formulário e o painel do resultado vai na
// coluna da direita, sem que a tela de fora precise saber de nada do que acontece aqui.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Aviso, ErrorBox, Loading, MaisDetalhes, lerErro, useConfirmacao, type ErroLido } from "./ui";
import { Celular, type BolhaChat } from "./Celular";
import { ehModeloDeBase } from "@/lib/base-modelo";
import { ACAO_CONECTAR_IA, PERSONAS_EXEMPLO } from "@/lib/persona-exemplos";
import { rotuloObjetivo, rotuloTom } from "@/lib/rotulos";
import type { PersonaGerada } from "@/lib/types";

/** As três frases do `Loading`: o que está acontecendo, sem contar o que a pessoa não precisa saber. */
const ETAPAS = ["Lendo a descrição", "Escolhendo tom e objetivo", "Montando a base"];

const PLACEHOLDER = "Clínica odontológica em Curitiba, 3 dentistas, atendemos convênios e particular, agendamos por WhatsApp";

/** As versões geradas ficam na ABA, não no banco: são rascunhos, e fechar a aba encerra o assunto. */
const CHAVE_VERSOES = "persona-versoes";

const LIMITE_BRIEF = 1000;

interface Versao {
  persona: PersonaGerada;
  brief: string;
  exemplo: boolean;
}

function lerVersoesSalvas(): Versao[] {
  try {
    const bruto = sessionStorage.getItem(CHAVE_VERSOES);
    if (!bruto) return [];
    const itens = JSON.parse(bruto) as Versao[];
    return Array.isArray(itens) ? itens.filter((v) => v && v.persona) : [];
  } catch {
    return [];
  }
}

export function usePersonaBrief({
  baseAtual,
  temConfigSalva,
  onAplicar,
}: {
  /** A base que está no formulário agora: é ela que diz se aplicar apaga trabalho de alguém. */
  baseAtual: string;
  /** Já existe atendente configurado? Aí o cartão nasce recolhido, para não roubar a tela de quem só veio ajustar. */
  temConfigSalva: boolean;
  onAplicar: (persona: PersonaGerada) => void;
}): { Cartao: ReactNode; Painel: ReactNode } {
  const { confirmar, Dialogo } = useConfirmacao();

  const [brief, setBrief] = useState("");
  const [site, setSite] = useState("");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<ErroLido | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [atual, setAtual] = useState(0);
  const campo = useRef<HTMLTextAreaElement>(null);

  // As versões de uma sessão anterior desta mesma aba (recarregar a página não joga fora o rascunho).
  // O `setTimeout(..., 0)` é o padrão desta tela: a leitura só existe no navegador (nada disso pode
  // rodar na renderização do servidor) e `react-hooks/set-state-in-effect` barra o `setState` direto.
  useEffect(() => {
    setTimeout(() => {
      const salvas = lerVersoesSalvas();
      if (!salvas.length) return;
      setVersoes(salvas);
      setAtual(salvas.length - 1);
      setBrief(salvas[salvas.length - 1]!.brief);
    }, 0);
  }, []);

  function guardar(lista: Versao[]) {
    setVersoes(lista);
    setAtual(lista.length - 1);
    try {
      sessionStorage.setItem(CHAVE_VERSOES, JSON.stringify(lista));
    } catch {
      // Sem espaço na aba, as versões continuam só na tela — nada do que está gerado se perde agora.
    }
  }

  async function gerar() {
    const descricao = brief.trim();
    if (!descricao || gerando) return;
    setGerando(true);
    setErro(null);
    setAviso(null);
    try {
      const r = await fetch("/api/assistente/persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: descricao, site: site.trim() }),
      });
      if (!r.ok) {
        setErro(await lerErro(r));
        return;
      }
      const dados = (await r.json()) as { persona: PersonaGerada; aviso: string | null; demo: boolean };
      setAviso(dados.aviso);
      guardar([...versoes, { persona: dados.persona, brief: descricao, exemplo: dados.demo }]);
    } catch (e) {
      setErro(await lerErro(e));
    } finally {
      setGerando(false);
    }
  }

  async function aplicar(persona: PersonaGerada) {
    // Substituir o que a pessoa escreveu é irreversível pela tela: só o modelo intocado sai sem pergunta.
    if (!ehModeloDeBase(baseAtual)) {
      const ok = await confirmar("Substituir o que já está preenchido? O texto atual do atendente será trocado pelo que foi gerado.", {
        confirmarRotulo: "Substituir",
      });
      if (!ok) return;
    }
    onAplicar(persona);
  }

  const versao = versoes[atual];

  const formulario = (
    <>
      <p className="text-muted text-[13px] mb-3">
        Escreva duas frases sobre o que você faz, para quem e como atende. O atendente vem montado para você revisar — nada é salvo antes de você mandar.
      </p>
      <label className="block text-[13px] font-semibold mb-1.5" htmlFor="persona-brief">
        Sobre o seu negócio
      </label>
      <textarea
        id="persona-brief"
        ref={campo}
        className="input min-h-[92px] resize-y"
        rows={3}
        maxLength={LIMITE_BRIEF}
        placeholder={PLACEHOLDER}
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
      />
      <label className="block text-[13px] font-semibold mt-3 mb-1.5" htmlFor="persona-site">
        Endereço do site (opcional)
      </label>
      <input
        id="persona-site"
        className="input"
        inputMode="url"
        placeholder="www.suaempresa.com.br"
        value={site}
        onChange={(e) => setSite(e.target.value)}
      />
      <p className="text-muted text-[12.5px] mt-1.5">Com o endereço, o atendente também aproveita o que já está escrito no seu site.</p>

      <p className="text-[13px] font-semibold mt-4 mb-2">Ou comece por um exemplo</p>
      <div className="flex flex-wrap gap-2">
        {PERSONAS_EXEMPLO.map((e) => (
          <button
            key={e.chave}
            type="button"
            className="bg-accent-soft text-accent-ink rounded-full px-3.5 py-1.5 text-[13px] font-semibold cursor-pointer border-0 hover:bg-accent-soft/70 transition-colors disabled:opacity-60"
            disabled={gerando}
            onClick={() => {
              setBrief(e.brief);
              campo.current?.focus();
            }}
          >
            {e.rotulo}
          </button>
        ))}
      </div>

      {erro && <div className="mt-3.5"><ErrorBox mensagem={erro.mensagem} acao={erro.acao} /></div>}

      <div className="mt-4">
        {gerando ? (
          <Loading etapas={ETAPAS} />
        ) : (
          <button type="button" className="btn-primary !w-auto max-md:!w-full" disabled={!brief.trim()} onClick={gerar}>
            {versoes.length ? "Gerar de novo" : "Gerar meu atendente"}
          </button>
        )}
      </div>
    </>
  );

  const Cartao = (
    <div className="card p-5 mb-3">
      {temConfigSalva ? (
        <MaisDetalhes titulo="Gerar de novo com uma descrição">{formulario}</MaisDetalhes>
      ) : (
        <>
          <h2 className="font-bold text-[15px] mb-1">Comece descrevendo seu negócio</h2>
          {formulario}
        </>
      )}
      {Dialogo}
    </div>
  );

  const Painel = versao ? (
    <ResultadoPersona
      versao={versao}
      total={versoes.length}
      indice={atual}
      aviso={aviso}
      gerando={gerando}
      onEscolherVersao={setAtual}
      onAplicar={() => aplicar(versao.persona)}
      onGerarDeNovo={gerar}
      onFechar={() => {
        setVersoes([]);
        setAtual(0);
        try {
          sessionStorage.removeItem(CHAVE_VERSOES);
        } catch {
          // Nada a fazer: a tela já está limpa.
        }
      }}
    />
  ) : null;

  return { Cartao, Painel };
}

/**
 * O que foi decidido, a prévia e os campos gerados. No desktop é um cartão da coluna da direita; no
 * celular vira uma folha presa ao rodapé (a pessoa continua vendo o formulário por trás enquanto
 * decide se aplica), por isso a altura máxima e a rolagem própria.
 */
function ResultadoPersona({
  versao,
  total,
  indice,
  aviso,
  gerando,
  onEscolherVersao,
  onAplicar,
  onGerarDeNovo,
  onFechar,
}: {
  versao: Versao;
  total: number;
  indice: number;
  aviso: string | null;
  gerando: boolean;
  onEscolherVersao: (i: number) => void;
  onAplicar: () => void;
  onGerarDeNovo: () => void;
  onFechar: () => void;
}) {
  const p = versao.persona;
  const previa: BolhaChat[] = [
    { papel: "atendente", texto: p.saudacao },
    ...(p.perguntasSugeridas[0] ? [{ papel: "cliente" as const, texto: p.perguntasSugeridas[0] }] : []),
  ];

  return (
    <section
      aria-label="Atendente gerado"
      className="card p-5 mb-3 border-accent max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-20 max-lg:mb-0 max-lg:max-h-[82vh] max-lg:overflow-y-auto max-lg:rounded-b-none max-lg:shadow-[0_-8px_24px_rgba(0,0,0,0.18)]"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h2 className="font-bold text-[15px]">Seu atendente está pronto para revisar</h2>
        <button type="button" className="btn-link text-[13px] lg:hidden" onClick={onFechar}>
          Fechar
        </button>
      </div>

      {total > 1 && (
        <div className="mb-3">
          <label className="block text-[12.5px] text-muted mb-1" htmlFor="persona-versao">
            Versão
          </label>
          <select id="persona-versao" className="input" value={indice} onChange={(e) => onEscolherVersao(Number(e.target.value))}>
            {Array.from({ length: total }, (_, i) => (
              <option key={i} value={i}>
                {`Versão ${i + 1}${i === total - 1 ? " · mais recente" : ""}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {versao.exemplo && (
        <div className="mb-3">
          <Aviso tom="warn" acao={ACAO_CONECTAR_IA}>
            Este é um atendente de exemplo: a inteligência artificial ainda não está conectada, então nada foi lido da sua descrição.
          </Aviso>
        </div>
      )}
      {aviso && indice === total - 1 && (
        <div className="mb-3">
          <Aviso tom="warn">{aviso}</Aviso>
        </div>
      )}

      {p.decisoes.length > 0 && (
        <>
          <p className="text-[13px] font-semibold mb-1.5">O que eu decidi</p>
          <ul className="flex flex-col gap-1.5 mb-4 text-[13px] text-muted">
            {p.decisoes.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true" className="text-accent">
                  •
                </span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <Celular previa nome={p.atendente} negocio={p.negocio} mensagens={previa} />

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        <div>
          <dt className="text-muted text-[12px]">Atendente</dt>
          <dd className="font-semibold">{p.atendente}</dd>
        </div>
        <div>
          <dt className="text-muted text-[12px]">Empresa</dt>
          <dd className="font-semibold">{p.negocio}</dd>
        </div>
        <div>
          <dt className="text-muted text-[12px]">O que ele faz</dt>
          <dd className="font-semibold">{p.objetivoTexto || rotuloObjetivo(p.objetivo).titulo}</dd>
        </div>
        <div>
          <dt className="text-muted text-[12px]">Como ele fala</dt>
          <dd className="font-semibold">{p.tomTexto || rotuloTom(p.tom).titulo}</dd>
        </div>
      </dl>

      <div className="mt-3">
        <MaisDetalhes titulo="O que ele vai saber">
          <p className="text-[12.5px] text-muted mb-2">
            O que ficou entre colchetes é o que faltou na sua descrição: troque pelos dados da empresa antes de salvar.
          </p>
          <pre className="whitespace-pre-wrap text-[12.5px] leading-relaxed bg-bg border border-line rounded-md p-3 max-h-[280px] overflow-y-auto">
            {p.baseConhecimento}
          </pre>
        </MaisDetalhes>
      </div>

      {/* No celular a folha é mais alta do que a tela e rola por dentro: os dois botões ficam presos ao
          rodapé dela, senão "Aplicar" some assim que a pessoa lê a base. */}
      <div className="mt-4 max-lg:sticky max-lg:bottom-0 max-lg:-mx-5 max-lg:px-5 max-lg:pt-3 max-lg:pb-4 max-lg:bg-surface max-lg:border-t max-lg:border-line">
        <div className="flex items-center gap-2.5 flex-wrap">
          <button type="button" className="btn-primary !w-auto max-md:!w-full" onClick={onAplicar} disabled={gerando}>
            Aplicar
          </button>
          <button type="button" className="btn-ghost !w-auto max-md:!w-full" onClick={onGerarDeNovo} disabled={gerando}>
            {gerando ? "Gerando" : "Gerar de novo"}
          </button>
        </div>
        <p className="text-muted text-[12px] mt-2">Aplicar só preenche o formulário. Nada vai para o WhatsApp antes de você salvar.</p>
      </div>
    </section>
  );
}

"use client";
// Cartão das Configurações: o que a empresa valoriza (US-003).
//
// É o único cadastro da tela que não é uma conexão com um serviço de fora — por isso ele fica abaixo
// dos cartões de conexão e tem um texto de apoio que diz para que serve: sem ele, cada vaga aberta
// teria de repetir os mesmos valores, e duas vagas da mesma empresa acabariam avaliando cultura por
// critérios diferentes.
//
// Enquanto ninguém salvou nada, o formulário nasce preenchido com a cultura de exemplo e um aviso de
// que é exemplo. Mostrar os campos vazios seria mais honesto e menos útil: quem abre esta tela pela
// primeira vez precisa ver o formato da resposta esperada (um rótulo curto + uma frase concreta)
// antes de escrever a da própria empresa.
import { useEffect, useState } from "react";
import { Aviso, Field, MaisDetalhes, lerErro } from "./ui";

type ValorCultura = { id: string; nome: string; descricao: string };
type Cultura = { valores: ValorCultura[]; comportamentos: string; naoCombina: string; atualizadoEm: string; exemplo: boolean };

const MAX_VALORES = 6;
const LIMITE_NOME = 40;
const LIMITE_DESCRICAO = 200;
const LIMITE_TEXTO = 1000;
const LIMITE_COLADO = 8000;

function idNovo(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function CulturaEmpresa() {
  const [cultura, setCultura] = useState<Cultura | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [falha, setFalha] = useState("");
  const [colado, setColado] = useState("");
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    fetch("/api/cultura")
      .then((r) => r.json())
      .then((d: { cultura: Cultura }) => setCultura(d.cultura))
      .catch(() => setFalha("Não foi possível ler o que está salvo agora. Atualize a página."));
  }, []);

  function mudar(partes: Partial<Cultura>) {
    setSalvo(false);
    setCultura((atual) => (atual ? { ...atual, ...partes } : atual));
  }

  function mudarValor(id: string, partes: Partial<ValorCultura>) {
    setSalvo(false);
    setCultura((atual) => (atual ? { ...atual, valores: atual.valores.map((v) => (v.id === id ? { ...v, ...partes } : v)) } : atual));
  }

  async function salvar() {
    if (!cultura) return;
    setSalvando(true);
    setFalha("");
    try {
      const corpo = JSON.stringify({ valores: cultura.valores, comportamentos: cultura.comportamentos, naoCombina: cultura.naoCombina });
      const r = await fetch("/api/cultura", { method: "PUT", headers: { "Content-Type": "application/json" }, body: corpo });
      if (!r.ok) throw r;
      const d = (await r.json()) as { cultura: Cultura };
      setCultura(d.cultura);
      setSalvo(true);
    } catch (err) {
      setFalha((await lerErro(err)).mensagem);
    } finally {
      setSalvando(false);
    }
  }

  async function gerar() {
    setGerando(true);
    setFalha("");
    setSalvo(false);
    try {
      const r = await fetch("/api/cultura/gerar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: colado }) });
      if (!r.ok) throw r;
      const d = (await r.json()) as { cultura: Omit<Cultura, "exemplo"> };
      // A proposta preenche o formulário e para por aí: nada é salvo antes de alguém revisar.
      setCultura((atual) => ({ ...d.cultura, exemplo: atual?.exemplo ?? true }));
    } catch (err) {
      setFalha((await lerErro(err)).mensagem);
    } finally {
      setGerando(false);
    }
  }

  return (
    <section id="cultura" className="card p-6 max-md:p-5">
      <h2 className="text-lg font-bold mb-1">Cultura da empresa</h2>
      <p className="text-muted text-sm mb-4 max-w-[640px]">
        Cadastre uma vez o que a sua empresa valoriza. A entrevistadora usa isto para fazer as perguntas de cultura e para dizer, no parecer, o
        quanto o candidato combina com a empresa — em toda vaga, sem você redigitar.
      </p>

      {cultura?.exemplo && (
        <div className="mb-4">
          <Aviso tom="warn">Estes são valores de exemplo. Troque pelos da sua empresa e salve: enquanto isso, toda vaga nova avalia cultura por este exemplo.</Aviso>
        </div>
      )}

      {cultura && (
        <>
          <div className="flex flex-col gap-3 mb-4">
            {cultura.valores.map((valor, i) => (
              <div key={valor.id} className="flex flex-col gap-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    id={`valor-nome-${valor.id}`}
                    className="input flex-1 min-w-0 font-semibold"
                    value={valor.nome}
                    maxLength={LIMITE_NOME}
                    placeholder={`Valor ${i + 1}`}
                    aria-label={`Nome do valor ${i + 1}`}
                    onChange={(e) => mudarValor(valor.id, { nome: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn-link text-[13px] shrink-0"
                    aria-label={`Remover o valor ${valor.nome || i + 1}`}
                    onClick={() => mudar({ valores: cultura.valores.filter((v) => v.id !== valor.id) })}
                  >
                    Remover
                  </button>
                </div>
                <input
                  id={`valor-descricao-${valor.id}`}
                  className="input"
                  value={valor.descricao}
                  maxLength={LIMITE_DESCRICAO}
                  placeholder="Uma frase sobre o que isso significa no dia a dia"
                  aria-label={`O que significa ${valor.nome || `o valor ${i + 1}`}`}
                  onChange={(e) => mudarValor(valor.id, { descricao: e.target.value })}
                />
              </div>
            ))}
          </div>

          {cultura.valores.length < MAX_VALORES ? (
            <button
              type="button"
              className="btn-link text-[13.5px] mb-5"
              onClick={() => mudar({ valores: [...cultura.valores, { id: idNovo(), nome: "", descricao: "" }] })}
            >
              Adicionar valor
            </button>
          ) : (
            <p className="text-muted text-[12.5px] mb-5">São {MAX_VALORES} valores no máximo: mais do que isso e nenhum deles pesa na avaliação.</p>
          )}

          <Field label="O que se espera no dia a dia" htmlFor="comportamentos" hint="Como uma pessoa daqui se comporta quando ninguém está olhando.">
            <textarea
              id="comportamentos"
              className="input min-h-24 resize-y"
              maxLength={LIMITE_TEXTO}
              value={cultura.comportamentos}
              onChange={(e) => mudar({ comportamentos: e.target.value })}
            />
          </Field>

          <Field label="O que não funciona aqui" htmlFor="nao-combina" hint="O comportamento que, por melhor que seja o currículo, não dá certo nesta empresa.">
            <textarea
              id="nao-combina"
              className="input min-h-24 resize-y"
              maxLength={LIMITE_TEXTO}
              value={cultura.naoCombina}
              onChange={(e) => mudar({ naoCombina: e.target.value })}
            />
          </Field>

          <MaisDetalhes titulo="Gerar a partir de um texto">
            <Field label="Cole aqui a página sobre a empresa" htmlFor="texto-cultura" hint="A página “Sobre nós”, o código de cultura, a carta de valores. A IA propõe os campos acima e você revisa antes de salvar.">
              <textarea
                id="texto-cultura"
                className="input min-h-32 resize-y"
                maxLength={LIMITE_COLADO}
                value={colado}
                onChange={(e) => setColado(e.target.value)}
              />
            </Field>
            <button type="button" className="btn-secundario !w-auto max-md:!w-full" disabled={gerando || colado.trim().length < 80} onClick={() => void gerar()}>
              {gerando ? "Lendo o texto..." : "Propor os valores"}
            </button>
          </MaisDetalhes>

          <div className="flex items-center gap-3 flex-wrap mt-1">
            <button type="button" className="btn-primary !w-auto max-md:!w-full" disabled={salvando} onClick={() => void salvar()}>
              {salvando ? "Salvando" : "Salvar"}
            </button>
            {salvo && <span className="text-muted text-[13px]">Salvo. Toda vaga nova já usa estes valores.</span>}
          </div>
        </>
      )}

      {falha && (
        <div className="mt-4">
          <Aviso tom="danger">{falha}</Aviso>
        </div>
      )}
    </section>
  );
}

"use client";
// A ficha do candidato, com a origem de cada informação (US-013).
//
// É a tela que a D5 existe para sustentar: cada valor mostra de onde veio ("CV", "Web", "Você") e,
// quando veio da web, um link para a página que o sustenta. Sem isso a ficha seria mais um texto
// gerado por uma máquina sobre uma pessoa de verdade — e ninguém tem como conferir um texto assim.
//
// A edição manda ao servidor **só o que mudou**, e esse é o ponto mais importante deste arquivo:
// mandar a ficha inteira carimbaria como "editado por você" todo campo que a pessoa apenas leu, e a
// partir daí nenhuma leitura nova de currículo poderia mais corrigi-los (origem `gestor` não é
// sobrescrita por nada, lib/ficha.ts).
import { useState } from "react";
import { Aviso } from "./ui";
import type { EdicaoFicha } from "@/lib/ficha";
import type { CampoFicha, ExperienciaFicha, Ficha, FormacaoFicha, OrigemCampo } from "@/lib/types";

/** A fonte como a tela a recebe (sem o conteúdo da página): `listarFontesResumidas`, lib/candidatos.ts. */
export type FonteNaTela = {
  id: string;
  tipo: "cv" | "linkedin" | "busca" | "pagina";
  url?: string;
  titulo?: string;
  resumo?: string;
  coletadoEm: string;
};

const ROTULO_ORIGEM: Record<OrigemCampo, string> = { cv: "CV", web: "Web", gestor: "Você" };

/** Os tetos de `lib/ficha.ts`, repetidos aqui de propósito: importar o módulo num componente de
 * navegador arrastaria o banco junto (mesma razão já registrada para `lib/curriculo.ts`). */
const LIMITE_RESUMO = 600;
const LIMITE_LINHA = 200;
const LIMITE_DESCRICAO = 400;
const MAX_ITENS = 12;

// ---------------------------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------------------------

/** De onde saiu este valor, ao lado dele. Miúdo de propósito: a informação é o que interessa. */
function Marca({ campo, fontes }: { campo: { origem: OrigemCampo; fonteId?: string }; fontes: FonteNaTela[] }) {
  const fonte = campo.fonteId ? fontes.find((f) => f.id === campo.fonteId) : undefined;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-[11px] font-bold text-muted">{ROTULO_ORIGEM[campo.origem]}</span>
      {campo.origem === "web" && fonte?.url && (
        <a href={fonte.url} target="_blank" rel="noreferrer" className="btn-link text-[11px]" title={fonte.titulo}>
          fonte
        </a>
      )}
    </span>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="font-extrabold text-[17px] mb-3">{titulo}</h2>
      {children}
    </section>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="text-muted text-sm">{children}</p>;
}

/** Um campo curto: rótulo pequeno em cima, valor embaixo, marca de origem ao lado. */
function Linha({ rotulo, campo, fontes }: { rotulo: string; campo?: CampoFicha<string | number>; fontes: FonteNaTela[] }) {
  return (
    <div>
      <h3 className="text-[12.5px] font-bold text-muted mb-0.5">{rotulo}</h3>
      {campo ? (
        <p className="text-sm flex items-baseline gap-2 flex-wrap">
          <span>{campo.valor}</span>
          <Marca campo={campo} fontes={fontes} />
        </p>
      ) : (
        <p className="text-muted text-sm">—</p>
      )}
    </div>
  );
}

/** Uma lista de textos (competências, idiomas): cada item com a própria origem. */
function ListaDeTextos({ itens, fontes, vazio }: { itens?: CampoFicha<string>[]; fontes: FonteNaTela[]; vazio: string }) {
  if (!itens?.length) return <Vazio>{vazio}</Vazio>;
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {itens.map((item, i) => (
        <li key={i} className="flex items-baseline gap-2 flex-wrap">
          <span>{item.valor}</span>
          <Marca campo={item} fontes={fontes} />
        </li>
      ))}
    </ul>
  );
}

function periodo(inicio?: string, fim?: string): string {
  if (inicio && fim) return `${inicio} – ${fim}`;
  return inicio || fim || "";
}

export function FichaCandidato({
  ficha,
  fontes,
  editando,
  salvando,
  erro,
  onSalvar,
  onCancelar,
}: {
  ficha?: Ficha;
  fontes: FonteNaTela[];
  editando: boolean;
  salvando: boolean;
  erro?: string;
  onSalvar: (campos: EdicaoFicha) => void;
  onCancelar: () => void;
}) {
  if (editando) {
    return <FormularioFicha ficha={ficha} salvando={salvando} erro={erro} onSalvar={onSalvar} onCancelar={onCancelar} />;
  }

  const experiencias = ficha?.experiencias ?? [];
  const formacao = ficha?.formacao ?? [];
  const links = ficha?.links ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Secao titulo="Resumo">
        <div className="grid grid-cols-4 gap-4 mb-4 max-md:grid-cols-2">
          <Linha rotulo="Cargo atual" campo={ficha?.cargoAtual} fontes={fontes} />
          <Linha rotulo="Empresa atual" campo={ficha?.empresaAtual} fontes={fontes} />
          <Linha rotulo="Cidade" campo={ficha?.cidade} fontes={fontes} />
          <Linha rotulo="Anos de experiência" campo={ficha?.anosExperiencia} fontes={fontes} />
        </div>
        {ficha?.resumo ? (
          <p className="text-sm">
            {ficha.resumo.valor} <Marca campo={ficha.resumo} fontes={fontes} />
          </p>
        ) : (
          <Vazio>Nenhum resumo ainda. Envie o currículo ou escreva um à mão em &quot;Editar ficha&quot;.</Vazio>
        )}
      </Secao>

      <Secao titulo="Experiência">
        {experiencias.length ? (
          <ul className="flex flex-col gap-3.5">
            {experiencias.map((item, i) => (
              <li key={i}>
                <p className="text-sm font-semibold flex items-baseline gap-2 flex-wrap">
                  <span>{[item.valor.cargo, item.valor.empresa].filter(Boolean).join(" · ")}</span>
                  <Marca campo={item} fontes={fontes} />
                </p>
                {periodo(item.valor.inicio, item.valor.fim) && (
                  <p className="text-muted text-[12.5px]">{periodo(item.valor.inicio, item.valor.fim)}</p>
                )}
                {item.valor.descricao && <p className="text-sm mt-0.5">{item.valor.descricao}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <Vazio>Nenhuma posição registrada.</Vazio>
        )}
      </Secao>

      <Secao titulo="Formação">
        {formacao.length ? (
          <ul className="flex flex-col gap-2.5">
            {formacao.map((item, i) => (
              <li key={i}>
                <p className="text-sm font-semibold flex items-baseline gap-2 flex-wrap">
                  <span>{item.valor.curso}</span>
                  <Marca campo={item} fontes={fontes} />
                </p>
                <p className="text-muted text-[12.5px]">
                  {[item.valor.instituicao, periodo(item.valor.inicio, item.valor.fim)].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Vazio>Nenhuma formação registrada.</Vazio>
        )}
      </Secao>

      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Secao titulo="Competências">
          <ListaDeTextos itens={ficha?.competencias} fontes={fontes} vazio="Nenhuma competência registrada." />
        </Secao>
        <Secao titulo="Idiomas">
          <ListaDeTextos itens={ficha?.idiomas} fontes={fontes} vazio="Nenhum idioma registrado." />
        </Secao>
      </div>

      <Secao titulo="Links">
        {links.length ? (
          <ul className="flex flex-col gap-1.5 text-sm">
            {links.map((item, i) => (
              <li key={i} className="flex items-baseline gap-2 flex-wrap">
                <a href={item.valor} target="_blank" rel="noreferrer" className="btn-link break-all">{item.valor}</a>
                <Marca campo={item} fontes={fontes} />
              </li>
            ))}
          </ul>
        ) : (
          <Vazio>Nenhum endereço registrado.</Vazio>
        )}
      </Secao>

      <Secao titulo="Pretensão e disponibilidade">
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Linha rotulo="Pretensão salarial" campo={ficha?.pretensaoSalarial} fontes={fontes} />
          <Linha rotulo="Disponibilidade" campo={ficha?.disponibilidade} fontes={fontes} />
        </div>
      </Secao>

      <Secao titulo="Observações">
        {ficha?.observacoes ? (
          <p className="text-sm">
            {ficha.observacoes.valor} <Marca campo={ficha.observacoes} fontes={fontes} />
          </p>
        ) : (
          <Vazio>Nada anotado.</Vazio>
        )}
      </Secao>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Edição
// ---------------------------------------------------------------------------------------------

/** A ficha em texto puro, do jeito que os campos do formulário a guardam. */
type Rascunho = {
  resumo: string;
  cargoAtual: string;
  empresaAtual: string;
  cidade: string;
  anosExperiencia: string;
  pretensaoSalarial: string;
  disponibilidade: string;
  observacoes: string;
  experiencias: ExperienciaFicha[];
  formacao: FormacaoFicha[];
  /** Uma por linha: é como se edita uma lista curta sem inventar um editor de listas. */
  competencias: string;
  idiomas: string;
  links: string;
};

const SIMPLES = ["resumo", "cargoAtual", "empresaAtual", "cidade", "anosExperiencia", "pretensaoSalarial", "disponibilidade", "observacoes"] as const;
const POR_LINHA = ["competencias", "idiomas", "links"] as const;

function texto(campo?: CampoFicha<string | number>): string {
  return campo ? String(campo.valor) : "";
}

function linhas(valor: string): string[] {
  return valor.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, MAX_ITENS);
}

function rascunhoDaFicha(ficha?: Ficha): Rascunho {
  return {
    resumo: texto(ficha?.resumo),
    cargoAtual: texto(ficha?.cargoAtual),
    empresaAtual: texto(ficha?.empresaAtual),
    cidade: texto(ficha?.cidade),
    anosExperiencia: texto(ficha?.anosExperiencia),
    pretensaoSalarial: texto(ficha?.pretensaoSalarial),
    disponibilidade: texto(ficha?.disponibilidade),
    observacoes: texto(ficha?.observacoes),
    experiencias: (ficha?.experiencias ?? []).map((i) => ({ ...i.valor })),
    formacao: (ficha?.formacao ?? []).map((i) => ({ ...i.valor })),
    competencias: (ficha?.competencias ?? []).map((i) => i.valor).join("\n"),
    idiomas: (ficha?.idiomas ?? []).map((i) => i.valor).join("\n"),
    links: (ficha?.links ?? []).map((i) => i.valor).join("\n"),
  };
}

/** Só o que a pessoa realmente mexeu — ver o comentário do topo do arquivo. */
export function mudancasDaFicha(inicial: Rascunho, atual: Rascunho): EdicaoFicha {
  const campos: EdicaoFicha = {};

  for (const nome of SIMPLES) {
    if (inicial[nome].trim() !== atual[nome].trim()) campos[nome] = atual[nome];
  }
  for (const nome of POR_LINHA) {
    const antes = linhas(inicial[nome]);
    const depois = linhas(atual[nome]);
    if (antes.join("\n") !== depois.join("\n")) campos[nome] = depois;
  }

  const experiencias = atual.experiencias.filter((e) => e.empresa.trim() || e.cargo.trim());
  if (JSON.stringify(inicial.experiencias) !== JSON.stringify(experiencias)) campos.experiencias = experiencias;

  const formacao = atual.formacao.filter((f) => f.curso.trim());
  if (JSON.stringify(inicial.formacao) !== JSON.stringify(formacao)) campos.formacao = formacao;

  return campos;
}

function CampoTexto({
  rotulo,
  id,
  valor,
  onMudar,
  limite = LIMITE_LINHA,
  apoio,
}: {
  rotulo: string;
  id: string;
  valor: string;
  onMudar: (v: string) => void;
  limite?: number;
  apoio?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">{rotulo}</label>
      <input id={id} className="input" value={valor} maxLength={limite} onChange={(e) => onMudar(e.target.value)} />
      {apoio && <span className="text-muted text-[12px]">{apoio}</span>}
    </div>
  );
}

function CampoLongo({ rotulo, id, valor, onMudar, apoio }: { rotulo: string; id: string; valor: string; onMudar: (v: string) => void; apoio?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">{rotulo}</label>
      <textarea id={id} className="input min-h-24 resize-y" value={valor} maxLength={LIMITE_RESUMO} onChange={(e) => onMudar(e.target.value)} />
      {apoio && <span className="text-muted text-[12px]">{apoio}</span>}
    </div>
  );
}

function FormularioFicha({
  ficha,
  salvando,
  erro,
  onSalvar,
  onCancelar,
}: {
  ficha?: Ficha;
  salvando: boolean;
  erro?: string;
  onSalvar: (campos: EdicaoFicha) => void;
  onCancelar: () => void;
}) {
  const [inicial] = useState(() => rascunhoDaFicha(ficha));
  const [dados, setDados] = useState<Rascunho>(inicial);
  const mudar = (partes: Partial<Rascunho>) => setDados((atual) => ({ ...atual, ...partes }));

  const mexerNaExperiencia = (i: number, partes: Partial<ExperienciaFicha>) =>
    mudar({ experiencias: dados.experiencias.map((e, n) => (n === i ? { ...e, ...partes } : e)) });
  const mexerNaFormacao = (i: number, partes: Partial<FormacaoFicha>) =>
    mudar({ formacao: dados.formacao.map((f, n) => (n === i ? { ...f, ...partes } : f)) });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!salvando) onSalvar(mudancasDaFicha(inicial, dados));
      }}
    >
      <Secao titulo="Resumo">
        <div className="grid grid-cols-2 gap-4 mb-4 max-md:grid-cols-1">
          <CampoTexto rotulo="Cargo atual" id="ficha-cargo" valor={dados.cargoAtual} onMudar={(v) => mudar({ cargoAtual: v })} />
          <CampoTexto rotulo="Empresa atual" id="ficha-empresa" valor={dados.empresaAtual} onMudar={(v) => mudar({ empresaAtual: v })} />
          <CampoTexto rotulo="Cidade" id="ficha-cidade" valor={dados.cidade} onMudar={(v) => mudar({ cidade: v })} />
          <CampoTexto
            rotulo="Anos de experiência"
            id="ficha-anos"
            valor={dados.anosExperiencia}
            limite={10}
            onMudar={(v) => mudar({ anosExperiencia: v })}
          />
        </div>
        <CampoLongo rotulo="Resumo" id="ficha-resumo" valor={dados.resumo} onMudar={(v) => mudar({ resumo: v })} apoio="Duas ou três frases sobre a trajetória." />
      </Secao>

      <Secao titulo="Experiência">
        <div className="flex flex-col gap-4">
          {dados.experiencias.map((item, i) => (
            <div key={i} className="border border-line rounded-card p-4 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
                <CampoTexto rotulo="Cargo" id={`ficha-exp-cargo-${i}`} valor={item.cargo} onMudar={(v) => mexerNaExperiencia(i, { cargo: v })} />
                <CampoTexto rotulo="Empresa" id={`ficha-exp-empresa-${i}`} valor={item.empresa} onMudar={(v) => mexerNaExperiencia(i, { empresa: v })} />
                <CampoTexto rotulo="Início" id={`ficha-exp-inicio-${i}`} valor={item.inicio ?? ""} limite={40} onMudar={(v) => mexerNaExperiencia(i, { inicio: v })} />
                <CampoTexto rotulo="Fim" id={`ficha-exp-fim-${i}`} valor={item.fim ?? ""} limite={40} onMudar={(v) => mexerNaExperiencia(i, { fim: v })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`ficha-exp-descricao-${i}`} className="text-[13px] font-semibold">O que fazia</label>
                <textarea
                  id={`ficha-exp-descricao-${i}`}
                  className="input min-h-20 resize-y"
                  value={item.descricao ?? ""}
                  maxLength={LIMITE_DESCRICAO}
                  onChange={(e) => mexerNaExperiencia(i, { descricao: e.target.value })}
                />
              </div>
              <button
                type="button"
                className="btn-link text-[13px] !text-danger self-start"
                onClick={() => mudar({ experiencias: dados.experiencias.filter((_, n) => n !== i) })}
              >
                Remover esta posição
              </button>
            </div>
          ))}
          {dados.experiencias.length < MAX_ITENS && (
            <button
              type="button"
              className="btn-ghost !w-auto self-start max-md:!w-full"
              onClick={() => mudar({ experiencias: [...dados.experiencias, { empresa: "", cargo: "" }] })}
            >
              Adicionar posição
            </button>
          )}
        </div>
      </Secao>

      <Secao titulo="Formação">
        <div className="flex flex-col gap-4">
          {dados.formacao.map((item, i) => (
            <div key={i} className="border border-line rounded-card p-4 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
                <CampoTexto rotulo="Curso" id={`ficha-form-curso-${i}`} valor={item.curso} onMudar={(v) => mexerNaFormacao(i, { curso: v })} />
                <CampoTexto
                  rotulo="Instituição"
                  id={`ficha-form-instituicao-${i}`}
                  valor={item.instituicao ?? ""}
                  onMudar={(v) => mexerNaFormacao(i, { instituicao: v })}
                />
                <CampoTexto rotulo="Início" id={`ficha-form-inicio-${i}`} valor={item.inicio ?? ""} limite={40} onMudar={(v) => mexerNaFormacao(i, { inicio: v })} />
                <CampoTexto rotulo="Fim" id={`ficha-form-fim-${i}`} valor={item.fim ?? ""} limite={40} onMudar={(v) => mexerNaFormacao(i, { fim: v })} />
              </div>
              <button
                type="button"
                className="btn-link text-[13px] !text-danger self-start"
                onClick={() => mudar({ formacao: dados.formacao.filter((_, n) => n !== i) })}
              >
                Remover esta formação
              </button>
            </div>
          ))}
          {dados.formacao.length < MAX_ITENS && (
            <button
              type="button"
              className="btn-ghost !w-auto self-start max-md:!w-full"
              onClick={() => mudar({ formacao: [...dados.formacao, { curso: "" }] })}
            >
              Adicionar formação
            </button>
          )}
        </div>
      </Secao>

      <Secao titulo="Competências, idiomas e links">
        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <CampoLongo rotulo="Competências" id="ficha-competencias" valor={dados.competencias} onMudar={(v) => mudar({ competencias: v })} apoio="Uma por linha." />
          <CampoLongo rotulo="Idiomas" id="ficha-idiomas" valor={dados.idiomas} onMudar={(v) => mudar({ idiomas: v })} apoio="Uma por linha, com o nível." />
          <CampoLongo rotulo="Links" id="ficha-links" valor={dados.links} onMudar={(v) => mudar({ links: v })} apoio="Um endereço por linha." />
        </div>
      </Secao>

      <Secao titulo="Pretensão, disponibilidade e observações">
        <div className="grid grid-cols-2 gap-4 mb-4 max-md:grid-cols-1">
          <CampoTexto rotulo="Pretensão salarial" id="ficha-pretensao" valor={dados.pretensaoSalarial} onMudar={(v) => mudar({ pretensaoSalarial: v })} />
          <CampoTexto rotulo="Disponibilidade" id="ficha-disponibilidade" valor={dados.disponibilidade} onMudar={(v) => mudar({ disponibilidade: v })} />
        </div>
        <CampoLongo rotulo="Observações" id="ficha-observacoes" valor={dados.observacoes} onMudar={(v) => mudar({ observacoes: v })} />
      </Secao>

      {erro && <Aviso tom="danger">{erro}</Aviso>}

      <div className="flex items-center gap-2.5 flex-wrap">
        <button type="submit" className="btn-primary !w-auto max-md:!w-full" disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar a ficha"}
        </button>
        <button type="button" className="btn-ghost !w-auto max-md:!w-full" onClick={onCancelar}>Cancelar</button>
        <span className="text-muted text-[12.5px]">O que você mudar aqui fica marcado como seu e não é sobrescrito por uma leitura nova.</span>
      </div>
    </form>
  );
}

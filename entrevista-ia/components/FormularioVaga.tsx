"use client";
// O formulário de uma vaga (US-005), usado tanto para abrir (`/vagas/nova`) quanto para editar
// (`/vagas/[id]/editar`).
//
// É **controlado de fora**: quem renderiza guarda o estado e recebe cada mudança. Parece mais
// trabalho do que guardar o estado aqui dentro, mas é o que permite a tela preencher o formulário
// inteiro de uma vez — o que a US-006 faz ao ler uma descrição de vaga colada — sem remontar o
// componente e sem perder o que a pessoa já tinha digitado.
//
// O que fica no fluxo principal é o que muda de vaga para vaga (cargo, salário, desafios,
// requisitos); o que tem padrão bom e raramente muda (tom, número de perguntas, duração) fica atrás
// de "Entrevista", junto das competências culturais.
import type { ReactNode } from "react";
import { Aviso, Field, MaisDetalhes, Row, numero } from "./ui";

export type ValorDaEmpresa = { id: string; nome: string; descricao: string };

/** Uma competência na tela: a caixa marcada é o que vai para a vaga. */
export type CompetenciaEscolhida = {
  id: string;
  nome: string;
  descricao: string;
  origem: "empresa" | "vaga";
  marcada: boolean;
};

/** Tudo em texto, como o formulário guarda: o salário só vira inteiro na hora de enviar. */
export type DadosVaga = {
  cargo: string;
  area: string;
  senioridade: string;
  modelo: string;
  local: string;
  salarioMin: string;
  salarioMax: string;
  salarioACombinar: boolean;
  desafios: string;
  requisitos: string;
  competencias: CompetenciaEscolhida[];
  tom: string;
  numeroPerguntas: number;
  duracaoMin: number;
  perguntaPretensao: boolean;
};

/** A vaga como a rota devolve (só o que o formulário precisa reabrir). */
export type VagaSalva = {
  cargo: string;
  area?: string;
  senioridade?: string;
  modelo?: string;
  local?: string;
  salarioMin?: number;
  salarioMax?: number;
  salarioACombinar: boolean;
  desafios?: string;
  requisitos: string;
  competenciasCulturais: { id: string; nome: string; descricao: string; origem: "empresa" | "vaga" }[];
  tom: string;
  numeroPerguntas: number;
  duracaoMin: number;
  perguntaPretensao: boolean;
};

export const LIMITE_DESAFIOS = 1500;
export const LIMITE_REQUISITOS = 3000;
export const LIMITE_CARGO = 80;
export const MAX_COMPETENCIAS = 10;

const SENIORIDADES = [
  { valor: "estagio", rotulo: "Estágio" },
  { valor: "junior", rotulo: "Júnior" },
  { valor: "pleno", rotulo: "Pleno" },
  { valor: "senior", rotulo: "Sênior" },
  { valor: "lideranca", rotulo: "Liderança" },
];

const MODELOS = [
  { valor: "presencial", rotulo: "Presencial" },
  { valor: "hibrido", rotulo: "Híbrido" },
  { valor: "remoto", rotulo: "Remoto" },
];

/**
 * Os rótulos e a faixa salarial vivem aqui, e não em cada tela, porque a lista, a página da vaga e o
 * formulário precisam dizer a MESMA coisa sobre a mesma vaga: "Híbrido", nunca "hibrido", e
 * "R$ 5.500 a R$ 7.000" ou "A combinar", nunca uma variação por tela.
 */
export function rotuloSenioridade(valor?: string): string {
  return SENIORIDADES.find((s) => s.valor === valor)?.rotulo ?? "";
}

export function rotuloModelo(valor?: string): string {
  return MODELOS.find((m) => m.valor === valor)?.rotulo ?? "";
}

/** A frase da faixa salarial mora em `lib/formato.ts` desde a US-016: a entrevistadora (código de
 * servidor) também precisa dela, e um client component não pode ser a fonte dessa palavra. O
 * reexporte mantém `import { faixaSalarial } from "@/components/FormularioVaga"` valendo nas telas. */
export { faixaSalarial } from "@/lib/formato";

/** Só dígitos, com ponto de milhar: quem digita "5500" vê "5.500" e ninguém precisa pensar em centavos. */
export function mascaraMilhar(texto: string): string {
  const digitos = texto.replace(/\D/g, "").slice(0, 9);
  return digitos ? numero(Number(digitos)) : "";
}

function semMascara(texto: string): number | undefined {
  const digitos = texto.replace(/\D/g, "");
  return digitos ? Number(digitos) : undefined;
}

/** As caixas de competência: as da empresa vêm marcadas, as que já são da vaga permanecem como estão. */
export function montarCompetencias(daEmpresa: ValorDaEmpresa[], daVaga?: VagaSalva["competenciasCulturais"]): CompetenciaEscolhida[] {
  const escolhidas = daVaga ?? null;
  const lista: CompetenciaEscolhida[] = daEmpresa.map((v) => ({
    id: v.id,
    nome: v.nome,
    descricao: v.descricao,
    origem: "empresa",
    // Vaga nova: tudo marcado. Vaga salva: vale o que ela guardou — desmarcar uma competência da
    // empresa numa vaga é uma escolha, e reabrir a vaga não pode desfazê-la.
    marcada: escolhidas ? escolhidas.some((c) => c.id === v.id) : true,
  }));
  for (const c of escolhidas ?? []) {
    if (lista.some((item) => item.id === c.id)) continue;
    // Competência que a vaga tem e a empresa não: própria da vaga, ou um valor que saiu da cultura
    // depois que esta vaga foi aberta. Nos dois casos ela continua valendo para esta vaga.
    lista.push({ id: c.id, nome: c.nome, descricao: c.descricao, origem: c.origem, marcada: true });
  }
  return lista;
}

export function dadosVazios(daEmpresa: ValorDaEmpresa[]): DadosVaga {
  return {
    cargo: "",
    area: "",
    senioridade: "",
    modelo: "",
    local: "",
    salarioMin: "",
    salarioMax: "",
    salarioACombinar: false,
    desafios: "",
    requisitos: "",
    competencias: montarCompetencias(daEmpresa),
    tom: "acolhedor",
    numeroPerguntas: 8,
    duracaoMin: 15,
    perguntaPretensao: true,
  };
}

export function dadosDaVaga(vaga: VagaSalva, daEmpresa: ValorDaEmpresa[]): DadosVaga {
  return {
    cargo: vaga.cargo,
    area: vaga.area ?? "",
    senioridade: vaga.senioridade ?? "",
    modelo: vaga.modelo ?? "",
    local: vaga.local ?? "",
    salarioMin: vaga.salarioMin ? numero(vaga.salarioMin) : "",
    salarioMax: vaga.salarioMax ? numero(vaga.salarioMax) : "",
    salarioACombinar: vaga.salarioACombinar,
    desafios: vaga.desafios ?? "",
    requisitos: vaga.requisitos,
    competencias: montarCompetencias(daEmpresa, vaga.competenciasCulturais),
    tom: vaga.tom,
    numeroPerguntas: vaga.numeroPerguntas,
    duracaoMin: vaga.duracaoMin,
    perguntaPretensao: vaga.perguntaPretensao,
  };
}

/** O que a tela envia: só as competências marcadas, e o salário já como inteiro. */
export function corpoDaVaga(dados: DadosVaga) {
  return {
    cargo: dados.cargo,
    area: dados.area,
    senioridade: dados.senioridade || null,
    modelo: dados.modelo || null,
    local: dados.local,
    salarioMin: semMascara(dados.salarioMin) ?? null,
    salarioMax: semMascara(dados.salarioMax) ?? null,
    salarioACombinar: dados.salarioACombinar,
    desafios: dados.desafios,
    requisitos: dados.requisitos,
    competenciasCulturais: dados.competencias
      .filter((c) => c.marcada && c.nome.trim())
      .map(({ id, nome, descricao, origem }) => ({ id, nome, descricao, origem })),
    tom: dados.tom,
    numeroPerguntas: dados.numeroPerguntas,
    duracaoMin: dados.duracaoMin,
    perguntaPretensao: dados.perguntaPretensao,
  };
}

/** O que `POST /api/vagas/estruturar` devolve ao ler uma descrição colada (US-006): `null` em tudo
 * que a descrição não disse. */
export type VagaEstruturada = {
  cargo: string | null;
  area: string | null;
  senioridade: string | null;
  modelo: string | null;
  local: string | null;
  salarioMin: number | null;
  salarioMax: number | null;
  salarioACombinar: boolean;
  desafios: string | null;
  requisitos: string | null;
  competenciasCulturais: { id: string; nome: string; descricao: string; origem: "empresa" | "vaga" }[];
};

/**
 * As competências depois de uma sugestão: as da empresa passam a valer o que a descrição cobra, e o
 * que só existe nesta vaga entra marcado.
 *
 * Sugestão vazia não desmarca nada: "a descrição não falava de cultura" não é o mesmo que "esta vaga
 * não avalia cultura", e chegar ao formulário com tudo desmarcado faria a entrevista sair sem
 * nenhuma pergunta de cultura sem ninguém ter escolhido isso.
 */
function comSugestoes(atuais: CompetenciaEscolhida[], sugeridas: VagaEstruturada["competenciasCulturais"]): CompetenciaEscolhida[] {
  if (sugeridas.length === 0) return atuais;
  const ids = new Set(sugeridas.map((c) => c.id));
  const lista = atuais.map((c) => (c.origem === "empresa" ? { ...c, marcada: ids.has(c.id) } : c));
  for (const sugerida of sugeridas) {
    if (lista.length >= MAX_COMPETENCIAS) break;
    if (lista.some((c) => c.id === sugerida.id)) continue;
    lista.push({ ...sugerida, marcada: true });
  }
  return lista;
}

/**
 * Escreve no formulário o que a IA leu da descrição colada.
 *
 * Campo que voltou `null` **mantém** o que estava na tela, em vez de apagá-lo: num formulário novo
 * dá no mesmo (ele já estava vazio, e a AC pede que campo não inferido fique vazio), mas quem
 * digitou o cargo antes de colar a descrição não perde o que digitou.
 */
export function aplicarVagaEstruturada(dados: DadosVaga, vaga: VagaEstruturada): DadosVaga {
  const ou = (novo: string | null, atual: string) => novo ?? atual;
  return {
    ...dados,
    cargo: ou(vaga.cargo, dados.cargo),
    area: ou(vaga.area, dados.area),
    senioridade: ou(vaga.senioridade, dados.senioridade),
    modelo: ou(vaga.modelo, dados.modelo),
    local: ou(vaga.local, dados.local),
    salarioMin: vaga.salarioMin ? numero(vaga.salarioMin) : dados.salarioMin,
    salarioMax: vaga.salarioMax ? numero(vaga.salarioMax) : dados.salarioMax,
    // A descrição que anuncia uma faixa desliga "A combinar", e a que diz "a combinar" liga; a que
    // não fala de salário deixa a escolha como estava.
    salarioACombinar: vaga.salarioACombinar || (vaga.salarioMin === null && vaga.salarioMax === null && dados.salarioACombinar),
    desafios: ou(vaga.desafios, dados.desafios),
    requisitos: ou(vaga.requisitos, dados.requisitos),
    competencias: comSugestoes(dados.competencias, vaga.competenciasCulturais),
  };
}

/** A vaga que "Preencher com um exemplo" escreve: a mesma que a demonstração usa, para quem veio de lá reconhecer. */
export const VAGA_DE_EXEMPLO = {
  cargo: "Analista de Customer Success",
  area: "Customer Success",
  senioridade: "pleno",
  modelo: "hibrido",
  local: "São Paulo (SP)",
  salarioMin: "5.500",
  salarioMax: "7.000",
  salarioACombinar: false,
  desafios:
    "Assumir uma carteira de 40 contas de médio porte que hoje está sem dono fixo. Reduzir o cancelamento no primeiro ano, que fechou o último trimestre em 14%. Deixar registrado no sistema de atendimento o que hoje só existe na cabeça de quem atende.",
  requisitos: [
    "2 anos de experiência em atendimento B2B",
    "Comunicação escrita clara e objetiva",
    "Experiência com sistema de atendimento (HubSpot ou similar)",
    "Disponibilidade para viagens ocasionais a clientes",
  ].join("\n"),
} satisfies Omit<DadosVaga, "competencias" | "tom" | "numeroPerguntas" | "duracaoMin" | "perguntaPretensao">;

function idNovo(): string {
  return `vaga-${Math.random().toString(36).slice(2, 10)}`;
}

export function FormularioVaga({
  dados,
  onMudar,
  onSalvar,
  onCancelar,
  salvando,
  erro,
  rotuloSalvar = "Salvar vaga",
  culturaDeExemplo = false,
  acaoCultura,
  children,
}: {
  dados: DadosVaga;
  onMudar: (dados: DadosVaga) => void;
  onSalvar: () => void;
  onCancelar: () => void;
  salvando: boolean;
  erro?: string;
  rotuloSalvar?: string;
  /** Ninguém cadastrou a cultura da empresa ainda: as competências abaixo são de um exemplo. */
  culturaDeExemplo?: boolean;
  acaoCultura: { rotulo: string; url: string };
  /** Espaço no topo do formulário (a descrição colada da US-006). */
  children?: ReactNode;
}) {
  const mudar = (partes: Partial<DadosVaga>) => onMudar({ ...dados, ...partes });
  const mudarCompetencia = (id: string, partes: Partial<CompetenciaEscolhida>) =>
    mudar({ competencias: dados.competencias.map((c) => (c.id === id ? { ...c, ...partes } : c)) });

  const proprias = dados.competencias.filter((c) => c.origem === "vaga");
  const daEmpresa = dados.competencias.filter((c) => c.origem === "empresa");

  return (
    <form
      className="card p-6 max-md:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!salvando) onSalvar();
      }}
    >
      {children}

      <Field label="Cargo" htmlFor="vaga-cargo" hint="O nome que a pessoa vai ler no convite.">
        <input
          id="vaga-cargo"
          className="input"
          value={dados.cargo}
          maxLength={LIMITE_CARGO}
          placeholder="Analista de Customer Success"
          autoFocus
          onChange={(e) => mudar({ cargo: e.target.value })}
        />
      </Field>

      <Row>
        <Field label="Área" htmlFor="vaga-area">
          <input id="vaga-area" className="input" value={dados.area} maxLength={60} placeholder="Customer Success" onChange={(e) => mudar({ area: e.target.value })} />
        </Field>
        <Field label="Senioridade" htmlFor="vaga-senioridade">
          <select id="vaga-senioridade" className="input" value={dados.senioridade} onChange={(e) => mudar({ senioridade: e.target.value })}>
            <option value="">Não informar</option>
            {SENIORIDADES.map((s) => (
              <option key={s.valor} value={s.valor}>{s.rotulo}</option>
            ))}
          </select>
        </Field>
      </Row>

      <Row>
        <Field label="Modelo de trabalho" htmlFor="vaga-modelo">
          <select id="vaga-modelo" className="input" value={dados.modelo} onChange={(e) => mudar({ modelo: e.target.value })}>
            <option value="">Não informar</option>
            {MODELOS.map((m) => (
              <option key={m.valor} value={m.valor}>{m.rotulo}</option>
            ))}
          </select>
        </Field>
        <Field label="Local" htmlFor="vaga-local">
          <input id="vaga-local" className="input" value={dados.local} maxLength={80} placeholder="São Paulo (SP)" onChange={(e) => mudar({ local: e.target.value })} />
        </Field>
      </Row>

      <div className="mb-4">
        <span className="text-[13px] font-semibold">Faixa salarial</span>
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3 mt-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-muted text-[13px] shrink-0">R$</span>
            <input
              id="vaga-salario-min"
              className="input"
              inputMode="numeric"
              value={dados.salarioMin}
              disabled={dados.salarioACombinar}
              placeholder="5.500"
              aria-label="Salário mínimo, em reais"
              onChange={(e) => mudar({ salarioMin: mascaraMilhar(e.target.value) })}
            />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-muted text-[13px] shrink-0">até R$</span>
            <input
              id="vaga-salario-max"
              className="input"
              inputMode="numeric"
              value={dados.salarioMax}
              disabled={dados.salarioACombinar}
              placeholder="7.000"
              aria-label="Salário máximo, em reais"
              onChange={(e) => mudar({ salarioMax: mascaraMilhar(e.target.value) })}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-[13px] mt-2.5 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4"
            checked={dados.salarioACombinar}
            onChange={(e) => mudar({ salarioACombinar: e.target.checked })}
          />
          A combinar
        </label>
      </div>

      <Field label="Desafios dos primeiros meses" htmlFor="vaga-desafios" hint="O que essa pessoa precisa resolver nos primeiros meses.">
        <textarea
          id="vaga-desafios"
          className="input min-h-24 resize-y"
          maxLength={LIMITE_DESAFIOS}
          value={dados.desafios}
          placeholder="Assumir uma carteira de 40 contas que hoje está sem dono fixo."
          onChange={(e) => mudar({ desafios: e.target.value })}
        />
      </Field>

      <Field label="Requisitos" htmlFor="vaga-requisitos" hint="Um por linha. É por eles que a entrevistadora pergunta e monta o parecer.">
        <textarea
          id="vaga-requisitos"
          className="input min-h-32 resize-y"
          maxLength={LIMITE_REQUISITOS}
          value={dados.requisitos}
          placeholder={"2 anos de experiência em atendimento B2B\nComunicação escrita clara e objetiva"}
          onChange={(e) => mudar({ requisitos: e.target.value })}
        />
      </Field>

      <MaisDetalhes titulo="Entrevista">
        <div className="mb-5">
          <h3 className="font-bold text-[14px] mb-0.5">Competências culturais</h3>
          <p className="text-muted text-[12.5px] mb-2.5">O que a entrevistadora avalia além do técnico. As da sua empresa já vêm marcadas.</p>

          {culturaDeExemplo && (
            <div className="mb-3">
              <Aviso tom="warn" acao={acaoCultura}>
                Ninguém cadastrou ainda o que a sua empresa valoriza. As competências abaixo são um exemplo.
              </Aviso>
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {daEmpresa.map((c) => (
              <label key={c.id} className="flex items-start gap-2.5 text-[13px] cursor-pointer">
                <input type="checkbox" className="w-4 h-4 mt-0.5 shrink-0" checked={c.marcada} onChange={(e) => mudarCompetencia(c.id, { marcada: e.target.checked })} />
                <span className="min-w-0">
                  <span className="font-semibold">{c.nome}</span>
                  {c.descricao && <span className="text-muted"> — {c.descricao}</span>}
                </span>
              </label>
            ))}
          </div>

          {proprias.length > 0 && (
            <div className="flex flex-col gap-3 mt-3.5">
              {proprias.map((c, i) => (
                <div key={c.id} className="flex flex-col gap-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      className="w-4 h-4 shrink-0"
                      checked={c.marcada}
                      aria-label={`Avaliar ${c.nome || `a competência ${i + 1} desta vaga`}`}
                      onChange={(e) => mudarCompetencia(c.id, { marcada: e.target.checked })}
                    />
                    <input
                      className="input flex-1 min-w-0 font-semibold"
                      value={c.nome}
                      maxLength={40}
                      placeholder={`Competência ${i + 1} desta vaga`}
                      aria-label={`Nome da competência ${i + 1} desta vaga`}
                      onChange={(e) => mudarCompetencia(c.id, { nome: e.target.value })}
                    />
                    <button
                      type="button"
                      className="btn-link text-[13px] shrink-0"
                      aria-label={`Remover ${c.nome || `a competência ${i + 1} desta vaga`}`}
                      onClick={() => mudar({ competencias: dados.competencias.filter((item) => item.id !== c.id) })}
                    >
                      Remover
                    </button>
                  </div>
                  <input
                    className="input"
                    value={c.descricao}
                    maxLength={200}
                    placeholder="Uma frase sobre o que isso significa nesta vaga"
                    aria-label={`O que significa ${c.nome || `a competência ${i + 1} desta vaga`}`}
                    onChange={(e) => mudarCompetencia(c.id, { descricao: e.target.value })}
                  />
                </div>
              ))}
            </div>
          )}

          {dados.competencias.length < MAX_COMPETENCIAS && (
            <button
              type="button"
              className="btn-link text-[13.5px] mt-3"
              onClick={() => mudar({ competencias: [...dados.competencias, { id: idNovo(), nome: "", descricao: "", origem: "vaga", marcada: true }] })}
            >
              Adicionar competência desta vaga
            </button>
          )}
        </div>

        <Row>
          <Field label="Tom da entrevista" htmlFor="vaga-tom">
            <select id="vaga-tom" className="input" value={dados.tom} onChange={(e) => mudar({ tom: e.target.value })}>
              <option value="acolhedor">Acolhedor</option>
              <option value="objetivo">Objetivo</option>
            </select>
          </Field>
          <Field label="Perguntas principais" htmlFor="vaga-perguntas">
            <select id="vaga-perguntas" className="input" value={dados.numeroPerguntas} onChange={(e) => mudar({ numeroPerguntas: Number(e.target.value) })}>
              {[6, 7, 8, 9, 10, 11, 12].map((n) => (
                <option key={n} value={n}>{n} perguntas</option>
              ))}
            </select>
          </Field>
        </Row>

        <Field label="Duração estimada" htmlFor="vaga-duracao" hint="De 10 a 20 minutos, com tempo para pensar e aprofundar as respostas.">
          <select id="vaga-duracao" className="input" value={dados.duracaoMin} onChange={(e) => mudar({ duracaoMin: Number(e.target.value) })}>
            {[10, 15, 20].map((n) => (
              <option key={n} value={n}>{n} minutos</option>
            ))}
          </select>
        </Field>

        <label className="flex items-center gap-2 text-[13px] cursor-pointer">
          <input type="checkbox" className="w-4 h-4" checked={dados.perguntaPretensao} onChange={(e) => mudar({ perguntaPretensao: e.target.checked })} />
          Perguntar a pretensão salarial
        </label>
        <p className="text-muted text-[12.5px] mt-1 mb-4">
          {dados.salarioACombinar
            ? "Sem faixa definida, é a resposta do candidato que abre a conversa sobre salário."
            : "A resposta aparece no parecer ao lado da faixa desta vaga."}
        </p>
      </MaisDetalhes>

      {erro && (
        <div className="mb-4">
          <Aviso tom="danger">{erro}</Aviso>
        </div>
      )}

      <div className="flex items-center gap-2.5 flex-wrap">
        <button type="submit" className="btn-primary !w-auto max-md:!w-full" disabled={salvando}>
          {salvando ? "Salvando..." : rotuloSalvar}
        </button>
        <button type="button" className="btn-ghost !w-auto max-md:!w-full" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

"use client";
// O formulário de um candidato (US-008), usado em `/candidatos/novo`.
//
// É **controlado de fora**, como o da vaga: quem renderiza guarda o estado e recebe cada mudança. O
// motivo é o mesmo — a US-009 preenche esta ficha com o que a IA leu do currículo, e uma tela que
// precisa escrever nos campos não pode deixar o estado dentro do componente.
//
// O fluxo principal tem duas coisas só: o nome e o currículo. Tudo que existe para a pesquisa na web
// achar a pessoa certa (e-mail, telefone, cidade, perfil, termo de busca) fica atrás de
// "Para a pesquisa na web": é o tipo de campo que ninguém preenche no cadastro e todo mundo preenche
// quando a pesquisa não encontrou quem devia.
import { Aviso, Dropzone, Field, MaisDetalhes, Row } from "./ui";

/** Tudo em texto, como o formulário guarda. O currículo viaja separado: é um `File`, não um campo. */
export type DadosCandidato = {
  nome: string;
  email: string;
  telefone: string;
  cidade: string;
  linkedinUrl: string;
  termoBusca: string;
};

export const LIMITE_NOME = 120;
export const LIMITE_EMAIL = 160;
export const LIMITE_TELEFONE = 40;
export const LIMITE_CIDADE = 80;
export const LIMITE_LINKEDIN = 300;
export const LIMITE_TERMO_BUSCA = 120;

/** O mesmo teto de `lib/curriculo.ts`, aqui em megabytes: a tela recusa antes de subir 20 MB para
 * receber a mesma recusa do servidor depois da espera. */
export const LIMITE_CV_MB = 5;
export const TIPOS_CV = ".pdf,.docx,.txt";

export function dadosVaziosCandidato(): DadosCandidato {
  return { nome: "", email: "", telefone: "", cidade: "", linkedinUrl: "", termoBusca: "" };
}

/** O que a tela envia: os campos e o arquivo no mesmo `formData`, porque o currículo vai junto. */
export function corpoDoCandidato(dados: DadosCandidato, curriculo: File | null): FormData {
  const form = new FormData();
  for (const [chave, valor] of Object.entries(dados)) form.append(chave, valor);
  if (curriculo) form.append("curriculo", curriculo);
  return form;
}

export function FormularioCandidato({
  dados,
  onMudar,
  curriculo,
  onCurriculo,
  onSalvar,
  onCancelar,
  salvando,
  erro,
  rotuloSalvar = "Cadastrar candidato",
}: {
  dados: DadosCandidato;
  onMudar: (dados: DadosCandidato) => void;
  curriculo: File | null;
  onCurriculo: (arquivo: File | null) => void;
  onSalvar: () => void;
  onCancelar: () => void;
  salvando: boolean;
  erro?: string;
  rotuloSalvar?: string;
}) {
  const mudar = (partes: Partial<DadosCandidato>) => onMudar({ ...dados, ...partes });
  const grande = Boolean(curriculo && curriculo.size > LIMITE_CV_MB * 1024 * 1024);

  return (
    <form
      className="card p-6 max-md:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!salvando && !grande) onSalvar();
      }}
    >
      <Field label="Nome completo" htmlFor="candidato-nome" hint="É o nome que aparece no convite e no parecer.">
        <input
          id="candidato-nome"
          className="input"
          value={dados.nome}
          maxLength={LIMITE_NOME}
          placeholder="Bruno Alves"
          autoFocus
          onChange={(e) => mudar({ nome: e.target.value })}
        />
      </Field>

      <div className="mb-4">
        <span className="text-[13px] font-semibold">Currículo</span>
        <p className="text-muted text-[12.5px] mt-0.5 mb-2">Opcional. A IA lê o arquivo e preenche a ficha; você revisa depois.</p>
        <Dropzone
          id="candidato-curriculo"
          accept={TIPOS_CV}
          tiposLabel="PDF, DOCX ou TXT"
          maxSizeMB={LIMITE_CV_MB}
          arquivo={curriculo}
          onArquivo={onCurriculo}
        />
        {curriculo && (
          <button type="button" className="btn-link text-[13px] mt-2" onClick={() => onCurriculo(null)}>
            Remover o arquivo
          </button>
        )}
      </div>

      <MaisDetalhes titulo="Para a pesquisa na web">
        <Row>
          <Field label="E-mail" htmlFor="candidato-email">
            <input id="candidato-email" className="input" type="email" value={dados.email} maxLength={LIMITE_EMAIL} placeholder="bruno.alves@exemplo.com" onChange={(e) => mudar({ email: e.target.value })} />
          </Field>
          <Field label="Telefone" htmlFor="candidato-telefone">
            <input id="candidato-telefone" className="input" value={dados.telefone} maxLength={LIMITE_TELEFONE} placeholder="(11) 98888-1020" onChange={(e) => mudar({ telefone: e.target.value })} />
          </Field>
        </Row>

        <Field label="Cidade" htmlFor="candidato-cidade">
          <input id="candidato-cidade" className="input" value={dados.cidade} maxLength={LIMITE_CIDADE} placeholder="São Paulo (SP)" onChange={(e) => mudar({ cidade: e.target.value })} />
        </Field>

        <Field label="Perfil no LinkedIn" htmlFor="candidato-linkedin">
          <input id="candidato-linkedin" className="input" value={dados.linkedinUrl} maxLength={LIMITE_LINKEDIN} placeholder="linkedin.com/in/nome-da-pessoa" onChange={(e) => mudar({ linkedinUrl: e.target.value })} />
        </Field>

        <Field label="Termo de busca" htmlFor="candidato-termo" hint="Empresa atual, cargo ou cidade, para achar a pessoa certa.">
          <input id="candidato-termo" className="input" value={dados.termoBusca} maxLength={LIMITE_TERMO_BUSCA} placeholder="Customer Success · Órbita Software" onChange={(e) => mudar({ termoBusca: e.target.value })} />
        </Field>
      </MaisDetalhes>

      {grande && (
        <div className="mb-4">
          <Aviso tom="danger">O currículo passa de {LIMITE_CV_MB} MB. Escolha um arquivo menor.</Aviso>
        </div>
      )}

      {erro && !grande && (
        <div className="mb-4">
          <Aviso tom="danger">{erro}</Aviso>
        </div>
      )}

      <div className="flex items-center gap-2.5 flex-wrap">
        <button type="submit" className="btn-primary !w-auto max-md:!w-full" disabled={salvando || grande}>
          {salvando ? "Salvando..." : rotuloSalvar}
        </button>
        <button type="button" className="btn-ghost !w-auto max-md:!w-full" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

"use client";
// Cadastro essencial; a pesquisa complementar é oferecida após a leitura do CV.
import { Aviso, Dropzone, Field } from "./ui";

/** Tudo em texto, como o formulário guarda. O currículo viaja separado: é um `File`, não um campo. */
export type DadosCandidato = {
  nome: string;
  email: string;
  telefone: string;
  cidade: string;
  linkedinUrl: string;
  termoBusca: string;
  anotacao: string;
};

export const LIMITE_NOME = 120;
export const LIMITE_EMAIL = 160;
export const LIMITE_TELEFONE = 40;
export const LIMITE_CIDADE = 80;
export const LIMITE_LINKEDIN = 300;
export const LIMITE_TERMO_BUSCA = 200;

/** O mesmo teto de `lib/curriculo.ts`, aqui em megabytes: a tela recusa antes de subir 20 MB para
 * receber a mesma recusa do servidor depois da espera. */
export const LIMITE_CV_MB = 5;
export const TIPOS_CV = ".pdf,.docx,.txt";

export function dadosVaziosCandidato(): DadosCandidato {
  return { nome: "", email: "", telefone: "", cidade: "", linkedinUrl: "", termoBusca: "", anotacao: "" };
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
          required
          autoComplete="name"
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

      <Field label="LinkedIn (opcional)" htmlFor="candidato-linkedin" hint="Ajuda a encontrar o perfil certo na pesquisa complementar.">
        <input id="candidato-linkedin" className="input" value={dados.linkedinUrl} maxLength={LIMITE_LINKEDIN} placeholder="linkedin.com/in/nome-da-pessoa" onChange={(e) => mudar({ linkedinUrl: e.target.value })} />
      </Field>
      <Field label="Anotação (opcional)" htmlFor="candidato-anotacao" hint="Fica na ficha do candidato como uma observação sua.">
        <textarea id="candidato-anotacao" className="input min-h-24 resize-y" value={dados.anotacao} maxLength={1500} placeholder="Ex.: indicação da equipe, pontos para conversar ou disponibilidade." onChange={(e) => mudar({ anotacao: e.target.value })} />
      </Field>
      <p className="text-sm text-muted mb-5">Depois de salvar, você pode buscar mais informações na web com uma sugestão baseada no nome e no currículo.</p>

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

import type { Ficha, CampoFicha } from "@/lib/types";
import type { FonteNaTela } from "./FichaCandidato";
const CAMPOS: Record<string, string> = {
  resumo: "Resumo profissional", cargoAtual: "Cargo atual", empresaAtual: "Empresa atual", cidade: "Cidade", anosExperiencia: "Anos de experiência", pretensaoSalarial: "Pretensão salarial", disponibilidade: "Disponibilidade", observacoes: "Observações", experiencias: "Experiência", formacao: "Formação", competencias: "Competências", idiomas: "Idiomas", links: "Links profissionais",
};
function texto(valor: unknown): string {
  if (typeof valor === "string" || typeof valor === "number") return String(valor);
  if (!valor || typeof valor !== "object") return "";
  const v = valor as Record<string, unknown>;
  return [v.cargo, v.empresa, v.curso, v.instituicao, [v.inicio, v.fim].filter(Boolean).join(" – "), v.descricao].filter(Boolean).join(" · ");
}
export function DadosEncontrados({ ficha, fontes }: { ficha: Ficha; fontes: FonteNaTela[] }) {
  const campos = Object.entries(CAMPOS).flatMap(([chave, rotulo]) => {
    const dado = ficha[chave as keyof Ficha];
    if (!dado) return [];
    const itens = (Array.isArray(dado) ? dado : [dado]) as CampoFicha<unknown>[];
    const validos = itens.filter((item) => texto(item.valor));
    return validos.length ? [{ chave, rotulo, itens: validos }] : [];
  });
  return (
    <div className="my-5 rounded-field border border-line overflow-hidden">
      <p className="bg-accent-soft px-4 py-3 text-sm font-semibold">{campos.length} {campos.length === 1 ? "categoria encontrada" : "categorias encontradas"} · Ainda não aplicadas à ficha</p>
      <dl className="divide-y divide-line">
        {campos.map(({ chave, rotulo, itens }) => <div key={chave} className="p-4 grid grid-cols-[170px_minmax(0,1fr)] max-md:grid-cols-1 gap-2 text-sm">
          <dt className="font-bold">{rotulo}</dt>
          <dd className="space-y-2 min-w-0">{itens.map((item, i) => {
            const fonte = fontes.find((f) => f.id === item.fonteId);
            return <div key={i}><p className="whitespace-pre-line break-words">{texto(item.valor)}</p>{fonte?.url && <a className="btn-link text-xs" href={fonte.url} target="_blank" rel="noreferrer">Conferir fonte ↗</a>}</div>;
          })}</dd>
        </div>)}
      </dl>
      {!campos.length && <p className="p-4 text-sm text-muted">A busca encontrou possíveis perfis, mas nenhum dado adicional para a ficha.</p>}
    </div>
  );
}

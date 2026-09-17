"use client";
// "Entendemos seu produto" (US-006): a ficha em blocos editáveis, no desenho do mockup.
//
// Cada bloco de lista edita um array por índice, com "+ Adicionar" e "Remover" por item — o mesmo
// molde dos critérios editáveis de app/page.tsx, que já provou funcionar aqui. Salvar é explícito:
// a ficha é a verdade da empresa e só vale depois que uma pessoa olhou, então nada é gravado
// enquanto o gestor digita.
import { useState } from "react";
import { Aviso, ErrorBox, Field, SeloIA, type ErroLido } from "@/components/ui";
import type { Meta } from "@/lib/ai";

export type Conhecimento = {
  resumo: string;
  publico: string;
  beneficios: string[];
  diferenciais: string[];
  objecoes: string[];
  precoFaixa?: string;
  concorrentes: string[];
};

export const CONHECIMENTO_VAZIO: Conhecimento = {
  resumo: "", publico: "", beneficios: [], diferenciais: [], objecoes: [], precoFaixa: "", concorrentes: [],
};

type CampoLista = "beneficios" | "diferenciais" | "objecoes" | "concorrentes";

/** Um bloco de lista: título, uma linha de ajuda e um campo por item. */
function BlocoLista({
  titulo,
  ajuda,
  itens,
  placeholder,
  onMudar,
}: {
  titulo: string;
  ajuda: string;
  itens: string[];
  placeholder: string;
  onMudar: (novos: string[]) => void;
}) {
  return (
    <div className="mb-5">
      <h3 className="font-bold text-[14px] mb-0.5">{titulo}</h3>
      <p className="text-muted text-[12.5px] mb-2">{ajuda}</p>
      <div className="flex flex-col gap-2">
        {itens.map((item, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              className="input"
              value={item}
              maxLength={120}
              placeholder={placeholder}
              aria-label={`${titulo}, item ${i + 1}`}
              onChange={(e) => onMudar(itens.map((v, j) => (j === i ? e.target.value : v)))}
            />
            <button
              type="button"
              className="btn-link !text-danger shrink-0 text-[13px]"
              aria-label={`Remover item ${i + 1} de ${titulo}`}
              onClick={() => onMudar(itens.filter((_, j) => j !== i))}
            >
              Remover
            </button>
          </div>
        ))}
        {itens.length < 6 && (
          <button type="button" className="btn-link text-[13px] self-start" onClick={() => onMudar([...itens, ""])}>
            + Adicionar
          </button>
        )}
      </div>
    </div>
  );
}

export function FichaProduto({
  conhecimento,
  metaIA,
  gerando,
  salvando,
  erro,
  onMudar,
  onGerar,
  onSalvar,
}: {
  conhecimento: Conhecimento;
  metaIA: Meta | null;
  gerando: boolean;
  salvando: boolean;
  erro: ErroLido | null;
  onMudar: (c: Conhecimento) => void;
  onGerar: () => void;
  onSalvar: () => void;
}) {
  const [salvo, setSalvo] = useState(false);
  const mudar = (campos: Partial<Conhecimento>) => {
    setSalvo(false);
    onMudar({ ...conhecimento, ...campos });
  };
  const mudarLista = (campo: CampoLista) => (novos: string[]) => mudar({ [campo]: novos } as Partial<Conhecimento>);
  const vazia = !conhecimento.resumo && !conhecimento.beneficios.length;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-1 max-md:flex-col max-md:gap-2">
        <div>
          <h2 className="font-bold text-[15px]">Entendemos seu produto</h2>
          <p className="text-muted text-[13px]">Corrija o que estiver errado: é isto que o cliente simulado e a avaliação usam.</p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {metaIA && <SeloIA demo={metaIA.demo} />}
          <button type="button" className="btn-ghost !w-auto" onClick={onGerar} disabled={gerando}>
            {gerando ? "Lendo o material..." : vazia ? "Gerar ficha" : "Gerar de novo"}
          </button>
        </div>
      </div>

      {metaIA?.demo && (
        <div className="mt-3.5">
          <Aviso tom="warn" acao={{ rotulo: "Conectar a IA", url: "/setup#openrouter" }}>
            Esta ficha é um exemplo. Conecte a IA para ela ler os seus materiais.
          </Aviso>
        </div>
      )}

      {erro && <div className="mt-3.5"><ErrorBox mensagem={erro.mensagem} codigo={erro.codigo as never} acao={erro.acao} /></div>}

      {vazia && !gerando && !erro ? (
        <p className="text-muted text-sm mt-4">
          Nenhuma ficha ainda. Adicione material acima e clique em “Gerar ficha” — ou escreva a ficha você mesmo, começando pelo resumo.
        </p>
      ) : null}

      <div className="mt-5">
        <Field label="Resumo" htmlFor="ficha-resumo" hint="O que é o produto e que problema ele resolve.">
          <textarea
            id="ficha-resumo"
            className="input min-h-20"
            maxLength={600}
            value={conhecimento.resumo}
            placeholder="Ex.: Plataforma que reúne produção, estoque e compras em um lugar só."
            onChange={(e) => mudar({ resumo: e.target.value })}
          />
        </Field>

        <div className="mt-3 mb-5">
          <Field label="Público" htmlFor="ficha-publico" hint="Quem compra este produto.">
            <input
              id="ficha-publico"
              className="input"
              maxLength={240}
              value={conhecimento.publico}
              placeholder="Ex.: Gerentes de operações de indústrias de médio porte."
              onChange={(e) => mudar({ publico: e.target.value })}
            />
          </Field>
        </div>

        <BlocoLista titulo="Principais benefícios" ajuda="Ganhos concretos para quem compra." itens={conhecimento.beneficios} placeholder="Ex.: Reduz o retrabalho em 30%" onMudar={mudarLista("beneficios")} />
        <BlocoLista titulo="Diferenciais" ajuda="O que separa este produto dos concorrentes." itens={conhecimento.diferenciais} placeholder="Ex.: Implantação em 30 dias" onMudar={mudarLista("diferenciais")} />
        <BlocoLista titulo="Objeções prováveis" ajuda="O que o cliente vai dizer para não comprar. O cliente simulado usa estas." itens={conhecimento.objecoes} placeholder="Ex.: Já temos um sistema e trocar dá trabalho" onMudar={mudarLista("objecoes")} />

        <div className="mb-5">
          <Field label="Faixa de preço" htmlFor="ficha-preco" hint="Opcional. Deixe vazio se não quiser que apareça na conversa.">
            <input
              id="ficha-preco"
              className="input"
              maxLength={120}
              value={conhecimento.precoFaixa ?? ""}
              placeholder="Ex.: A partir de R$ 4.500 por mês"
              onChange={(e) => mudar({ precoFaixa: e.target.value })}
            />
          </Field>
        </div>

        <BlocoLista titulo="Concorrentes" ajuda="Quem mais o cliente está avaliando." itens={conhecimento.concorrentes} placeholder="Ex.: Controle por planilha" onMudar={mudarLista("concorrentes")} />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          className="btn-primary !w-auto"
          disabled={!conhecimento.resumo.trim() || salvando}
          onClick={() => { setSalvo(true); onSalvar(); }}
        >
          {salvando ? "Salvando..." : "Salvar ficha"}
        </button>
        {salvo && !salvando && !erro && <span className="text-[13px] text-ok font-semibold">Ficha salva. O produto está pronto para treinar.</span>}
      </div>
    </div>
  );
}

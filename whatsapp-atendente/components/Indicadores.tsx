"use client";
// Os quatro números do atendimento em cartões: Início (US-016) e Relatórios (US-017) desenham os
// mesmos, com o mesmo formato e a mesma comparação, mudando só o período e a frase do "em relação a".
//
// Nada é calculado aqui: tudo chega de `GET /api/metricas` (lib/metricas.ts é a fonte única, ver as
// definições no topo daquele arquivo). Este arquivo só escolhe rótulo, formato e cor.
import { Destaque } from "./ui";
import { tempoDeResposta } from "@/lib/rotulos";
import { rotuloMotivo } from "@/lib/transferencia";
import { numero } from "@/lib/formato";
import type { Metricas } from "@/lib/types";

/**
 * O rótulo de cada número, num lugar só: os cartões e o resumo em texto do "Exportar" (US-018) dizem
 * exatamente a mesma coisa, e quem renomear um indicador renomeia os dois de uma vez.
 */
const ROTULOS = {
  conversas: "Conversas",
  resolvidasIA: "Resolvidas pela IA",
  passadasPessoa: "Passadas para uma pessoa",
  tempoMedioMs: "Tempo médio de resposta",
  motivos: "Por que pediu ajuda",
  naoEntregues: "Mensagens que não chegaram",
};

/**
 * Os números em linhas de texto, como o "Copiar resumo" de Relatórios os cola. Depois dos quatro
 * cartões vêm as duas linhas que a tela também mostra quando têm o que dizer: por que o atendente
 * pediu ajuda (uma linha só, na mesma ordem das barras) e quantas mensagens não chegaram ao cliente.
 */
export function numerosEmTexto(metricas: Metricas): string[] {
  const linhas = [
    `${ROTULOS.conversas}: ${numero(metricas.conversas)}`,
    `${ROTULOS.resolvidasIA}: ${numero(metricas.resolvidasIA)}`,
    `${ROTULOS.passadasPessoa}: ${numero(metricas.passadasPessoa)}`,
    `${ROTULOS.tempoMedioMs}: ${tempoDeResposta(metricas.tempoMedioMs)}`,
  ];
  if (metricas.motivos.length > 0) {
    linhas.push(`${ROTULOS.motivos}: ${metricas.motivos.map((m) => `${rotuloMotivo(m.motivo)} (${numero(m.total)})`).join("; ")}`);
  }
  if (metricas.naoEntregues > 0) linhas.push(`${ROTULOS.naoEntregues}: ${numero(metricas.naoEntregues)}`);
  return linhas;
}

/** Enquanto os números não chegam, os quatro cartões já ocupam o lugar deles, sem a tela saltar. */
function Esqueleto() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="card px-5 py-[18px]" aria-hidden="true">
          <span className="skeleton block !h-[36px] w-[70px]" />
          <span className="skeleton block w-3/4 mt-3" />
          <span className="skeleton block w-1/2 mt-2" />
        </div>
      ))}
    </>
  );
}

/**
 * `contexto` é a frase da comparação, por extenso ("em relação a ontem"). `rotuloConversas` muda entre
 * "Conversas hoje" (Início) e "Conversas" (Relatórios, que já tem o período escrito no seletor).
 */
export function Indicadores({ metricas, contexto, rotuloConversas = ROTULOS.conversas }: { metricas: Metricas | null; contexto: string; rotuloConversas?: string }) {
  return (
    <div className="grid gap-4 grid-cols-2 min-[1240px]:grid-cols-4">
      {metricas === null ? (
        <Esqueleto />
      ) : (
        <>
          <div className="card px-5 py-[18px]">
            <Destaque
              semMargem
              valor={numero(metricas.conversas)}
              rotulo={rotuloConversas}
              variacao={{ percentual: metricas.variacao.conversas, contexto }}
            />
          </div>
          <div className="card px-5 py-[18px]">
            <Destaque
              semMargem
              tom="ok"
              valor={numero(metricas.resolvidasIA)}
              rotulo={ROTULOS.resolvidasIA}
              variacao={{ percentual: metricas.variacao.resolvidasIA, contexto }}
            />
          </div>
          <div className="card px-5 py-[18px]">
            <Destaque
              semMargem
              valor={numero(metricas.passadasPessoa)}
              rotulo={ROTULOS.passadasPessoa}
              variacao={{ percentual: metricas.variacao.passadasPessoa, contexto }}
            />
          </div>
          <div className="card px-5 py-[18px]">
            <Destaque
              semMargem
              valor={tempoDeResposta(metricas.tempoMedioMs)}
              rotulo={ROTULOS.tempoMedioMs}
              // Aqui cair é bom: uma queda no tempo de resposta é verde, não vermelha.
              variacao={{ percentual: metricas.variacao.tempoMedioMs, contexto, cairEhBom: true }}
            />
          </div>
        </>
      )}
    </div>
  );
}

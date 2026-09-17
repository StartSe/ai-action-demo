// O feedback que o vendedor lê no fim do treino (US-019).
//
// A mesma tela aparece em dois lugares — logo depois da conversa, dentro da sala (`SalaVoz`), e
// quando ele volta pelo histórico (`/simular/<código>/meus-resultados/<conversa>`) — e as duas
// precisam dizer exatamente a mesma coisa: quem era o cliente, como foi, o que fazer diferente e
// como treinar de novo. Por isso ela mora aqui, e não duplicada nos dois arquivos.
//
// Três regras moldam o que entra:
//
// 1. **Nada de gestor.** `entregar` fica desligado ("Baixar PDF" e "Copiar link" levam a `/imprimir`
//    e a `/r`, que são rotas privadas) e não há menu, configuração nem recado de administração.
// 2. **A revelação do cliente acontece aqui e só aqui** (com "Minhas conversas"): antes da conversa
//    saber que era "o Cético" viraria decoreba (D2); depois dela, é o que explica a reação que o
//    vendedor levou.
// 3. **O feedback termina em ação.** Quem acabou de ler o que fazer diferente tem, na mesma tela, o
//    botão de treinar de novo — respeitando o limite de tentativas do gestor — e o caminho para as
//    outras conversas dele.
import type { ReactNode } from "react";
import { ResultadoSessao } from "@/app/page";
import type { AvaliacaoSessao } from "@/lib/avaliacao";
import type { Meta } from "@/lib/ai";
import type { Conversa } from "@/lib/types";

/**
 * O que se conta do cliente depois da conversa. `perfil` é a linha de `frasePerfil` (lib/personas.ts),
 * com o nome do personagem; sem ela (um resultado gravado antes desta história, um catálogo de
 * personas que mudou) o rótulo do tipo assume o lugar do título, e nada some da tela.
 */
export type ClienteRevelado = { tipoDeCliente: string; perfil?: string; comportamento?: string };

/** O balanço de tentativas de quem está lendo, como o servidor o conhece no momento da leitura. */
export type Tentativas = { podeTreinar: boolean; tentativas: number; maxTentativas: number | null };

export type ResultadoDaSessao = {
  conversa: Conversa;
  avaliacao: AvaliacaoSessao;
  meta: Meta;
  id?: string;
  titulo: string;
};

function Cartao({ children }: { children: ReactNode }) {
  return <div className="card p-5 max-md:p-4 mb-5">{children}</div>;
}

/** Quem era o cliente, em uma linha que explica o perfil — não só o nome do tipo. */
export function RevelacaoCliente({ cliente }: { cliente: ClienteRevelado }) {
  return (
    <Cartao>
      <div className="text-muted text-[12.5px] font-semibold uppercase tracking-[0.04em] mb-1">O cliente com quem você falou</div>
      <div className="text-[17px] font-extrabold tracking-[-0.01em]">{cliente.perfil || cliente.tipoDeCliente}</div>
      <p className="text-muted text-[13.5px] mt-1">
        {[cliente.perfil ? cliente.tipoDeCliente : "", cliente.comportamento].filter(Boolean).join(" · ")}
      </p>
    </Cartao>
  );
}

/**
 * As duas saídas do feedback. "Treinar novamente" some quando o gestor limitou as tentativas e elas
 * acabaram — com a frase que diz por quê, porque um botão que some sem explicação parece defeito.
 */
export function AcoesDoVendedor({ codigo, tentativas }: { codigo: string; tentativas: Tentativas }) {
  const { podeTreinar, tentativas: feitas, maxTentativas } = tentativas;
  return (
    <div className="mt-7 flex flex-col items-center gap-3">
      {podeTreinar ? (
        // `?pronto=1` é a mesma confirmação de visita da identificação: sem ele, quem vem daqui cai
        // de novo no balanço do treino em vez de ir direto para a próxima conversa.
        <a className="btn-primary" href={`/simular/${codigo}?pronto=1`}>
          Treinar novamente
        </a>
      ) : (
        <p className="text-muted text-[13.5px] text-center">
          {`Você usou as ${feitas} ${feitas === 1 ? "conversa" : "conversas"} deste treino. Fale com quem enviou o link se precisar de mais uma chance.`}
        </p>
      )}
      {podeTreinar && maxTentativas !== null && (
        <p className="text-muted text-[13px] text-center">{`Você já treinou ${feitas} de ${maxTentativas} ${maxTentativas === 1 ? "vez" : "vezes"}.`}</p>
      )}
      <a className="btn-link text-[13.5px]" href={`/simular/${codigo}/meus-resultados`}>
        Ver minhas outras conversas
      </a>
    </div>
  );
}

/**
 * O feedback completo: quem era o cliente, a avaliação e o que fazer agora.
 *
 * `demoTexto` muda entre os dois lugares só porque a frase natural muda ("a conversa que você acabou
 * de ter" x "a conversa que você teve") — o conteúdo é o mesmo.
 */
export function FeedbackVendedor({
  codigo,
  cliente,
  resultado,
  tentativas,
  demoTexto,
}: {
  codigo: string;
  cliente?: ClienteRevelado | null;
  resultado: ResultadoDaSessao;
  tentativas: Tentativas;
  demoTexto: string;
}) {
  return (
    <>
      {cliente && <RevelacaoCliente cliente={cliente} />}

      <ResultadoSessao
        conversa={resultado.conversa}
        avaliacao={resultado.avaliacao}
        meta={resultado.meta}
        id={resultado.id}
        titulo={resultado.titulo}
        entregar={false}
        copiarFrase
        demoTexto={demoTexto}
      />

      <AcoesDoVendedor codigo={codigo} tentativas={tentativas} />
    </>
  );
}

/**
 * A tela de quem não vê nota: o gestor desligou o feedback ao criar o treino, ou a conversa terminou
 * antes da primeira fala. Nenhum número aparece aqui — nem a nota, nem os momentos, nem a rubrica —,
 * mas as saídas continuam sendo as mesmas, porque quem fechou a conversa quer saber o que fazer
 * agora do mesmo jeito.
 */
export function ConversaRegistrada({ codigo, titulo, descricao, tentativas }: { codigo: string; titulo: string; descricao: string; tentativas: Tentativas }) {
  return (
    <div className="card p-7 max-md:p-[22px]">
      <h1 className="text-[22px] leading-[1.2] font-extrabold tracking-[-0.02em] mb-2">{titulo}</h1>
      <p className="text-muted">{descricao}</p>
      <AcoesDoVendedor codigo={codigo} tentativas={tentativas} />
    </div>
  );
}

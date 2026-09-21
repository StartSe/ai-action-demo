// Integrações que este app precisa. O setup (Configurações) é gerado a partir desta lista.
import { CHAVE_NIVEL, NIVEL_PADRAO, OPCOES_NIVEL } from "./modelos-do-app";
import { openrouter, NOTIFICACOES, type Integracao } from "./setup-comum";

/**
 * A IA lê o corredor, interroga a ficha e conduz a conversa de abertura; ela nunca calcula.
 *
 * O cartão ganha um campo a mais do que o da suíte: o **nível de qualidade**. Ele existe porque as
 * tarefas deste app não são iguais — entender um dono de negócio falando solto e montar o rascunho
 * inteiro é bem mais difícil do que escrever dois parágrafos sobre números prontos —, e porque
 * quem paga a conta precisa poder baixá-la sem editar nome de modelo à mão. Ver lib/modelos-do-app.ts.
 */
const IA = openrouter({ beneficio: "Conversa, monta o rascunho do seu negócio e explica o corredor" });

const OPENROUTER: Integracao = {
  ...IA,
  campos: [
    ...IA.campos,
    {
      chave: CHAVE_NIVEL,
      rotulo: "Qualidade das respostas",
      tipo: "select",
      opcional: true,
      padrao: NIVEL_PADRAO,
      opcoes: OPCOES_NIVEL,
      ajuda: "Os três primeiros níveis consomem crédito da sua conta. Sem crédito, o app cai sozinho para um modelo gratuito.",
    },
  ],
};

/** Avisa quando um item cai abaixo da margem-alvo (rotina semanal, ver lib/rotinas-do-app.ts). */
const AVISOS: Integracao = { ...NOTIFICACOES, beneficio: "Avisa você quando um item sai do lucro" };

export const INTEGRACOES: Integracao[] = [OPENROUTER, AVISOS];

// Rascunho da camada 2 do lembrete e do resgate: o roteiro dos dois propósitos
// (RF-306, RF-601 a RF-604, US-194).
//
// **A camada 2 é editável e mora no banco** (`playbook_versions.body_script`),
// como o roteiro de descoberta (`roteiro-de-descoberta.ts`). Estas constantes
// são o rascunho de referência: o texto que a tela de playbooks oferece e o que
// as provas da compilação usam como camada 2 desses dois propósitos. A
// publicação continua sendo de `agent-publish`, um agente por propósito (T-01).
//
// **Cada roteiro cita só as ferramentas do seu propósito** (docs/PRD.md seção
// 9): o lembrete tem `tool-confirm-meeting`, `tool-availability` e
// `tool-reschedule`; o resgate tem `tool-availability` e `tool-reschedule` (a
// qualificação antes de encerrar é regra da camada 1). O teste confere cada `tool-*` citado contra
// `ferramentasPrevistasDoProposito`.
//
// **A reunião em jogo vem do contexto da chamada** (`contexto_do_lead`, que
// `call-init` preenche com o motivo da ligação e o horário no fuso do lead).
// O roteiro manda ler o motivo de lá, e nunca pedir nem dizer identificador.
//
// **O resgate pergunta, não acusa (T-17).** O roteiro não afirma que a pessoa
// faltou; a fala do motivo sai de `_shared/speech/resgate.ts`, que o teste
// varre.
//
// Não repete regra da casa: aviso de gravação, regras travadas e qualificação
// antes de encerrar vêm da camada 1. Módulo portável: sem Deno, sem rede.

export const ROTEIRO_DE_LEMBRETE_PROVISORIO = [
  '1. Depois da abertura, diga o motivo da ligação como está no contexto do lead: com quem é a conversa, o dia e a hora no horário da pessoa.',
  '2. Pergunte se está tudo certo para ela participar.',
  '3. Se ela confirmar, chame tool-confirm-meeting e leia a frase devolvida.',
  '4. Se ela pedir outro horário, chame tool-availability, leia as opções e, com a escolha, chame tool-reschedule com action reschedule e a posição escolhida.',
  '5. Se ela pedir para cancelar, pergunte se prefere um horário novo; se não quiser, chame tool-reschedule com action cancel e o motivo nas palavras dela.',
  '6. Seja breve: é uma ligação de lembrete. Tire só dúvidas simples sobre a conversa marcada e encerre agradecendo.',
].join('\n')

export const ROTEIRO_DE_RESGATE_PROVISORIO = [
  '1. Depois da abertura, diga o motivo da ligação como está no contexto do lead: a conversa que estava marcada, com quem e quando.',
  '2. Pergunte como ficou para a pessoa, sem supor o que aconteceu. Nunca diga que ela deixou de ir: ouça o que ela conta.',
  '3. Se ainda fizer sentido para ela, chame tool-availability, leia as opções e, com a escolha, chame tool-reschedule com action reschedule e a posição escolhida.',
  '4. Se ela não quiser um horário novo, chame tool-reschedule com action cancel e o motivo nas palavras dela, agradeça e não insista.',
].join('\n')

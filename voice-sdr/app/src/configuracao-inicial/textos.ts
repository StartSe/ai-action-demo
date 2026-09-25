// O texto do tutorial com o nome que a conta deu à assistente.
//
// As frases moram em `@/copy/inicio` e são função do nome; quem sabe o nome é
// a identidade gravada. Componente que cita a assistente chama este gancho, e
// o que não cita continua lendo `inicio`, a versão sem nome.

import { textosDoInicio } from '@/copy/inicio'
import { useNomeDaAssistente } from '@/sarah/nome-da-assistente'

export function useTextosDoInicio(): ReturnType<typeof textosDoInicio> {
  return textosDoInicio(useNomeDaAssistente())
}

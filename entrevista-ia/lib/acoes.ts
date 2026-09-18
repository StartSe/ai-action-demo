// Ações ("o que fazer agora") que a tela oferece junto de um aviso ou erro. Módulo puro, sem node:*,
// para o Client Component (app/page.tsx, components/Sala.tsx) e os módulos do servidor (lib/voz.ts)
// usarem a MESMA constante: assim o rótulo e o destino não divergem entre o aviso da tela e a `acao`
// devolvida por uma rota. Também mantém o caminho de Configurações fora de app/page.tsx, onde
// scripts/verificar-jargao.mjs o acusaria como jargão escrito na tela.
export const ACAO_VOZ = { rotulo: "Conferir a voz em Configurações", url: "/setup#elevenlabs" };
export const ACAO_LIGACAO = { rotulo: "Conferir a ligação em Configurações", url: "/setup#elevenlabs-ligacao" };
export const ACAO_CULTURA = { rotulo: "Cadastrar a cultura da empresa", url: "/setup#cultura" };

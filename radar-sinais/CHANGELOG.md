# Notas de versão

## 0.2.0 — 2026-09-20

- Escolha entre OpenRouter e ChatGPT em Conectar IA, com login por código, seleção de modelo e desconexão da conta ChatGPT.
- Síntese e monitoramentos usam o provedor escolhido, sem troca automática entre contas em caso de erro.
- Remoção seletiva de dados de demonstração em Configurações e Radares anteriores, preservando resultados reais, conta, temas, integrações e agendamentos.
- Mapa de exemplo oculto ao conectar IA; após a limpeza, exemplos permanecem ocultos ao recarregar ou desconectar.
- Histórico encontra o último radar real mesmo quando há muitos exemplos mais recentes.
- Conector oficial do ChatGPT incluído no pacote de produção, com sessão isolada no disco persistente.
- Versão identificada no pacote, no catálogo e em `/api/health`.

Validação: 31 testes automatizados, lint, build de produção e navegação em desktop e celular. Login completo e geração com conta ChatGPT real não foram realizados; testes desses fluxos usam respostas simuladas. Detalhes em `../tasks/radar-sinais-dados-ia.md`.

## 0.1.0

- Radar estratégico com fontes de pesquisa, síntese por OpenRouter, grafo interativo, histórico e monitoramentos.

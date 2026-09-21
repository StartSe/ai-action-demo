# Changelog

## 1.1.0 — 2026-09-21

- Captura agêntica por instrução: usa leituras autorizadas do Zapier, preserva fontes raw e organiza a wiki em segundo plano.
- Fila persistente com progresso, resultados, cancelamento, retomada após falha e repetição de instruções recentes.
- Recorrências diárias, em dias úteis ou semanais, com horário, fuso, edição e pausa. O servidor executa sem depender de uma aba aberta.
- Primeiro acesso guiado com teste da IA, conexão e permissões de coleta do Zapier, regras, voz opcional e primeira instrução.
- Compatibilidade com ferramentas individuais do Zapier e o modo agêntico com descoberta e executor de leitura.

## 1.0.2 — 2026-09-21

- Isola exemplos fictícios do contexto de IA quando existem memórias próprias.
- Permite limpar exemplos em Regras da memória, preservando fontes usadas por documentos pessoais.

## 1.0.1 — 2026-09-21

- Atualiza transcrição para Scribe v2, conforme a remoção do Scribe v1 anunciada pela ElevenLabs.
- Adiciona testes dos contratos de transcrição e síntese, limites de texto e erros sem exposição de credenciais.

## 1.0.0 — 2026-09-21

- Observatório da memória com grafo, núcleo animado, busca global e experiência responsiva.
- Captura de texto, Markdown, CSV e JSON; raw imutável; wiki conectada e artefatos rastreáveis.
- Organização por regras editáveis, versões, restauração e manutenção de links ao renomear páginas.
- Chat com contexto recuperado, histórico, insights e geração de briefings e planos.
- ChatGPT pela assinatura, usando Codex App Server e login por dispositivo; OpenRouter como alternativa explícita.
- Zapier MCP com descoberta de ferramentas, proposta de ações, confirmação e incorporação dos resultados como fontes.
- ElevenLabs para transcrição e reprodução de respostas.
- Exportação de um cofre Markdown compatível com Obsidian, conta protegida e credenciais cifradas.
- Imagem standalone e publicação pelo fluxo GHCR → catálogo → Blueprint Render, com disco persistente.

# Notas de versão

## 0.4.0 — 22/09/2026

- Criação e edição de radares em modal com palavras-chave, contexto, fontes e páginas; seletor compacto e alternância na tela inicial.
- Planejamento de buscas por IA antes da coleta, com fallback explícito e consultas auditáveis; focos, hipóteses de hype e artigos importantes orientam pesquisa e conversa.
- Acompanhamento diário ativado ao conectar IA para radares elegíveis; fila persistente, trabalho em segundo plano e histórico de cada tentativa, inclusive falhas e interrupções.
- Novo balão conversacional com memória persistente por radar, fontes e análises recentes no contexto e referências ao mapa.
- Conversa em tempo real com ElevenLabs dentro do balão, verificação de permissões, microfone e transcrição. O mesmo motor responde por texto e voz.
- SearchAPI reunida a Exa e Tavily em Busca na Web. Removida a seção Preferências da pesquisa de Configurações; limpeza de exemplos continua no histórico.



## 0.3.0 — 2026-09-20

- Radares nomeados com temas, fontes, páginas e histórico separados; seletor persistente, criação e renomeação. O histórico passa a se chamar **Análises deste radar**.
- Migração transacional dos resultados e agendas existentes por temas e setor, preservando identificadores e links. Rascunhos de configuração são mantidos durante a sessão ao alternar radares.
- Artigos da StartSe incluídos por padrão, com consulta pública direcionada e priorização nas buscas por site.
- SearchAPI disponível nas integrações, com busca Google por tema, período e site.
- Cadastro de páginas específicas com leitura direta via Bright Data MCP (`scrape_as_markdown`) ou Firecrawl, inclusive parâmetros da URL; falhas individuais aparecem na proveniência.
- Chat flutuante com uma analista de grafos e sinais. Contexto recuperado da análise salva, referências validadas e botões para destacar pontos no mapa.
- Tela cheia com grafo em destaque e painel translúcido de leituras/sinais que pode ser exibido ou ocultado. Grafos pequenos exibem os rótulos dos pontos.
- Remoção de notificações, canais de e-mail/Slack e conexões de e-mail. Monitoramentos continuam executando e salvando análises no app, inclusive agendas legadas, sem entrega externa.
- Versão atualizada no pacote, catálogo e health check; imagem sem dependências ou credenciais de envio de e-mail.

Validação: 39 testes automatizados, lint, TypeScript, build de produção com Webpack, verificadores de padrão/jargão/paleta e navegação em desktop/celular com serviços simulados. Nenhuma credencial paga foi usada. Detalhes em `../tasks/radar-sinais-0.3.0.md`.

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

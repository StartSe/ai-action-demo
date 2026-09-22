# Radar de Sinais 0.4.0

## Escopo e evidências

| Pedido | Implementação | Verificação |
| --- | --- | --- |
| Busca diária em segundo plano após conectar ferramentas | `agendas-radar.ts`, `instrumentation.ts`: agenda às 08:00 para radares com temas e IA conectada; fontes habilitadas do cadastro; pausas preservadas | Testes de ativação/idempotência; servidor standalone executou uma agenda vencida sem navegador aberto |
| Acompanhar o histórico | Fila SQLite, estados pendente/executando/sucesso/falha/interrompida, origem, horários e resultado; painel com consulta a cada cinco segundos | Testes de falha, pausa, lease e isolamento; retomada de uma fila pendente após reiniciar o servidor; navegador navega para outra tela durante a execução |
| Chat semelhante às referências, voz dentro do balão | Boas-vindas com marca, sugestões, compositor compacto, ondas de voz, diálogo ElevenLabs via agente privado; pausar microfone/encerrar/voltar ao chat | Desktop 1440×1000 e celular 390×844; protocolo WebSocket simulado, entrada PCM, ferramenta, resposta e encerramento; microfone desativado e liberado |
| Memória por radar e identificação discreta | Conversa SQLite por `radarId`, com `Você está no radar …`; contexto da análise aberta e até cinco recentes, mais 24 mensagens | Testes e navegador recuperam a conversa ao recarregar e após nova análise; outro radar não recebe memória; reinício preservou quatro mensagens |
| Leituras, sinais e artigos na conversa | `contextoRadar` recupera dados salvos e destaques; referências são validadas antes da gravação | Testes verificam leituras, fontes, exclusão de URLs inventadas e nós válidos |
| SearchAPI na Busca na Web | Cartão único com SearchAPI, Exa e Tavily; mesmo identificador legado `exa`; aliases de hash mantidos | API e navegador verificam SearchAPI no cartão e ausência de cartão isolado |
| Remover Preferências da pesquisa | Seção removida de Configurações; limpeza de demonstração mantida no histórico | Verificação no navegador |
| Foco, hype e artigos importantes participam do motor | Destaques persistentes alimentam planejador, síntese e conversa; artigos podem ser relidos com Firecrawl/Bright Data | Testes de isolamento/validação e prioridades no plano; navegador marca sinal e artigo; proveniência registra buscas |
| Criar/editar e alternar radares | Modal acessível, palavras-chave, contexto, fontes, páginas e agenda; seletor compacto; cartões selecionam o início por radar | Testes de cadastro atômico; navegador cria, edita, alterna e verifica isolamento; rolagem do modal e Escape conferidos |
| Nova versão | Pacote, lockfile, catálogo e health em 0.4.0 | Build e health standalone |

## Validação local

- `npm test`: 57 testes aprovados (provedores externos simulados).
- `npm run lint`: aprovado.
- `npm run build -- --webpack`: aprovado; permanece o aviso preexistente de análise estática de `module.createRequire` no cliente ChatGPT.
- `bash scripts/verificar-padrao.sh radar-sinais` e `node scripts/verificar-jargao.mjs radar-sinais`: aprovados.
- `tests/browser.mjs`: fluxo completo com captura de microfone falsa e WebSocket simulado. Executado também contra `.next/standalone/server.js` com `tests/fixtures/services.mjs`.
- Reinício do standalone: fila manual pendente concluída, agenda vencida concluída automaticamente, memória preservada. Dados isolados em `/tmp/radar04-browser-data`.
- Capturas locais em `/tmp/radar04-{modal-desktop,modal-mobile,chat-welcome-desktop,chat-desktop,chat-mobile,voice-desktop,home-mobile,setup-mobile}.png`.

## Operação

O agendador exige servidor Node/Docker ativo e volume persistente. Não depende de navegador aberto. Instalações serverless curtas não executam esse agendador continuamente. Cada nova agenda usa 08:00 em São Paulo; agendas antigas mantêm sua configuração. Três falhas consecutivas pausam o acompanhamento e aparecem no histórico.

A voz exige uma chave real ElevenLabs com permissões de vozes e Agents, voz selecionada e microfone em HTTPS/localhost. A validação automatizada usa provedores simulados; não foi realizada uma ligação paga com uma conta real. O áudio não é armazenado pelo app; a configuração do agente desabilita gravação de áudio. Perguntas e respostas fundamentadas são gravadas na memória do radar.

A extração `components/ResultadoRadar.tsx` elimina exports de componentes utilitários de `app/radar/page.tsx`, recusados pelos tipos de rotas do Next.js atual após executar o servidor de desenvolvimento.

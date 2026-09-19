# Build Agentflows — entrega

Objetivo: nova aplicação simplificada de Agentflows v2 no padrão da suíte, implementada em worktree, integrada na main e enviada ao origin; worktree removida ao concluir.

## Critérios implementados

- App Next independente com infraestrutura da suíte: conta, sessão, configurações cifradas, IA, MCP, histórico, rotinas, Docker e disco persistente no Render.
- Editor visual: dez blocos, conexões direcionadas, configuração por etapa, criação/exclusão, importação/exportação, teste e publicação.
- Motor: estado compartilhado, referências entre etapas, geração de IA, agente com escolha dinâmica de ferramentas, HTTP, ferramentas MCP, condições, repetição limitada, aprovação retomável, cancelamento e rastreio.
- Integração: versão publicada estável, endpoint HTTP com Bearer, ferramentas MCP para executar/consultar/decidir; revogação e limite de chamadas.
- Modo demonstração não executa ações externas. Falhas reais não são convertidas em sucesso demonstrativo.
- Limitações do recorte simplificado documentadas explicitamente em build-agentflows/README.md.

## Evidência de validação

- Testes de domínio exercitam publicação independente do rascunho, condições e estado, checkpoints, retomada única, cancelamento, repetição, referências ausentes, falhas externas, agente com ferramentas simuladas e interrupção por reinício.
- Teste de navegador e HTTP em standalone, com conta real de teste e banco isolado: autenticação, editor, execução, publicação, HTTP e MCP autenticados, aprovação, revogação, status/setup, desktop 1400 px e celular 390 px. Sem erros de JavaScript ou overflow horizontal.
- Revisão visual das capturas de editor e configurações, desktop e celular; refinamentos de status de IA e dimensões do quadro.
- Compilação de produção, TypeScript, lint (apenas aviso herdado de img no setup), padrão, paleta e jargão.

Serviços de IA e ferramentas foram testados com respostas simuladas; nenhuma credencial de cliente foi usada. A funcionalidade real exige conectar provedores em Configurações.

Verificação global da suíte após incorporar a main: o novo app passa integralmente; a verificação global detecta divergências já presentes na main em `entrevista-ia/lib/mcp-cliente.ts`, arquivos de infraestrutura de `radar-sinais` e de `videos-campanha`. Não são alterações desta entrega. O catálogo e o deploy foram regenerados preservando as mudanças concorrentes.

A autoria pelo quadro também foi exercitada no navegador: adicionar/configurar bloco de estado, remover conexão, desenhar duas conexões, salvar, executar, exportar e importar.

Checkpoint também verificado com reinício real do servidor standalone: aprovação aguardando foi preservada no disco e retomou até a conclusão após subir o novo processo.

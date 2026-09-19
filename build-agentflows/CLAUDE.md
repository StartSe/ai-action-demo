# Build Agentflows — decisões

Aplicação nova em 18/09/2026 na branch feat/build-agentflows. Camada de produto própria (`independente: true`); infraestrutura copiada literalmente de pdi-time. Editor React Flow é a única dependência adicional de produção, necessária para conexões, arraste, navegação e zoom no grafo. Sem código ou assets copiados do Flowise; inspiração documentada em README.

Não alterar INFRA sem seguir PADRAO.md. `scripts/verificar-padrao.sh build-agentflows` deve passar. O termo `webhook` tem exceção no verificador de jargão porque aparece somente no contrato HTTP dentro de “Dados para a equipe técnica”, recolhido por padrão. Nome comercial mantém a grafia solicitada Build Agentflows.

O motor executa uma única saída por bloco; bifurcação escolhe caminho. Repetições usam visitas limitadas. A versão publicada é snapshot independente do rascunho. Aprovação persiste no mesmo SQLite da suíte; claim condicional evita decisão duplicada. Reinício nunca repete chamadas externas automaticamente. Testes não usam credenciais reais.

Limites de texto: hero 7 palavras, apoio 11; ajuda por campo em no máximo uma linha, detalhes técnicos recolhidos; cartões de integração em uma linha de benefício. Cor calculada em tasks/paleta-segmentos.json no segmento Gestão.

Verificações: npm test, npm run lint, npm run build; scripts/verificar-padrao.sh build-agentflows; scripts/verificar-jargao.mjs build-agentflows. Servidor standalone e navegador com conta de teste em diretório temporário, sem usar dados da instalação.

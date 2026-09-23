# Prospecção por empresa — correção 0.6.1

## Problema e causas

As capturas fornecidas mostram cinco perfis pertinentes na primeira pesquisa da StartSe e cinco pessoas sem relação com a empresa após as atualizações. A análise do código encontrou:

- O nome da empresa era apenas um termo de busca. Não havia validação do vínculo antes de persistir a pessoa; `adicionarPessoasDaConta` preenchia a empresa do lead com o nome da conta pesquisada.
- A busca sem personas perdia os cargos de descoberta usados antes. A consulta com operadores de busca era também enviada à categoria semântica `people` da Exa.
- O enriquecimento era limitado aos primeiros resultados, antes de verificar relevância. Retornos irrelevantes podiam consumir as vagas enquanto perfis corretos apareciam depois.
- A deduplicação por produto escondia pessoas encontradas anteriormente, sem informar que tinham sido reencontradas.
- Respostas estruturadas longas da Bright Data eram cortadas no meio do JSON. Isso impedia a leitura dos campos atuais, inclusive de empresa. O teste com perfil longo reproduziu o problema antes da correção.
- Exa Contents/Tavily Extract aceitavam o primeiro resultado sem exigir correspondência ao LinkedIn solicitado.

Não foi possível consultar logs do ambiente das capturas; estas são causas verificadas no código e por reprodução automatizada, não atribuição de uma resposta específica de fornecedor.

## Comportamento entregue

A descoberta por empresa usa busca web focada, Exa People em linguagem natural e as demais fontes conectadas, em rodadas de até duas fontes. Cargo de descoberta tem valores padrão quando não há personas; uma estratégia adicional busca a empresa sem cargo se faltarem resultados.

Vínculo explícito no cabeçalho ou em campos de empresa atual é obrigatório antes de salvar. Menções no corpo só ajudam a priorizar leitura. Dados atuais de empresa prevalecem sobre um título indexado antigo. A verificação ocorre entre rodadas; vínculos inválidos levam à continuação da descoberta. O limite final é aplicado depois da verificação. A empresa do lead vem da evidência, sem copiar o alvo da consulta. Isso também protege a exploração de pessoas de contas no modo de oportunidades.

O fluxo mantém `list_dataset_fields` + `search_dataset` e prioriza `web_data_linkedin_person_profile` para candidatos selecionados. JSON estruturado permanece íntegro; somente o contexto textual enviado à análise é limitado. Entradas antigas de cache com JSON truncado são ignoradas e lidas novamente. Cancelamento, cache válido, limites por fornecedor e publicação de parciais continuam ativos.

Contatos já cadastrados no mesmo produto aparecem com acesso à ficha existente, preservando status comercial e sem duplicação. A exclusão de contato/prospecção limpa essas referências. URLs regionais e variantes de idioma são unificadas. A lista de pessoas da empresa também usa foto pública ou iniciais.

## Validação

- 125 testes automatizados, incluindo 11 verificações novas de empresa/consulta/identidade e fluxo completo com SQLite isolado.
- Casos: cinco irrelevantes antes de cinco corretos; primeira estratégia sem resultados pertinentes e recuperação na seguinte; mudança de empresa identificada na leitura; zero vínculos; pesquisa repetida preservando seleção; leitura de outro perfil rejeitada; dataset com filtro de empresa, Person Profile obrigatório, perfil longo e cache legado truncado.
- Build de produção, TypeScript durante o build, lint sem erros (aviso preexistente de imagem no setup), verificadores de padrão/jargão e `git diff --check`.
- Navegador desktop/celular: resultados parciais, cinco pessoas na empresa, repetição com fichas existentes, ausência de vínculo, recarga, avatar/iniciais, foto indisponível, transição para lista final e cancelamento. Respostas de andamento simuladas; APIs de login e health locais reais.

Os testes de integração usam respostas simuladas dos fornecedores. Não havia credenciais reais locais para uma consulta autenticada de ponta a ponta. A evidência de vínculo depende da atualização e da cobertura das fontes; um cabeçalho indexado não garante vínculo em tempo real. O usuário não conhece o endereço da instalação, portanto não foi possível identificar/verificar a instância das capturas. Publicação de imagem e catálogo não equivale a redeploy confirmado dessa instalação.

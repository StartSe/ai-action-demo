# Histórico de versões

## 0.3.0 — 2026-09-22

- Mensagens seguidas do mesmo cliente recebem **uma resposta só**: o atendente espera 3 s depois da última, e o aviso repetido do canal não vira mensagem duplicada.
- Quando alguém da equipe assume a conversa enquanto a IA escreve, a resposta pronta é descartada — o cliente nunca recebe duas vozes ao mesmo tempo.
- O atendente diz **por que** precisou de uma pessoa (o cliente pediu, a base não tinha a informação, está fora do que ele faz, reclamação ou falha), e a falha da IA nunca deixa o cliente sem resposta.
- Cada mensagem enviada mostra se **chegou e se foi lida** (relógio, um tique, dois tiques, dois tiques coloridos), e a que não chegou tem "Tentar de novo".
- As telas se atualizam **em tempo real**: mensagem nova, mudança de status e entrega aparecem sem recarregar, com uma consulta de reserva quando a conexão cai.
- O atendente recebe **áudio, foto, vídeo, documento, figurinha, localização e contato**, e mostra cada um na conversa em vez de dizer que o cliente não escreveu nada.
- E **entende** o que não é texto: transcreve o áudio, descreve a foto e lê o PDF antes de responder — e, quando não entende, avisa em vez de inventar.
- **O atendente montado a partir de duas frases sobre o negócio** (com o endereço do site, quando houver): o formulário chega preenchido para revisar, e nada de preço ou prazo é inventado.
- Saudação própria, perguntas de teste da empresa e o passo Configurar em cinco blocos com índice.
- **Ferramentas com interruptor**: coletar contato, consultar a agenda e consultar os sistemas da empresa ligam e desligam por cartão.
- **"Por que respondeu assim"** em cada resposta: o que o atendente leu, o que consultou, o modelo e o tempo. Mais seis cenários de teste com veredito no passo Testar.
- **Conversa longa sem perder o começo**: um resumo rolante entra no lugar das mensagens antigas.
- **O que o atendente lembra de cada cliente**, entre conversas: no painel do contato, editável e apagável — e o que uma pessoa corrigir não é reescrito pela IA.
- **Quem atende** se troca em um clique no alto da conversa, e responder já assume o atendimento.
- **Notas internas** (amarelas, que o cliente nunca vê), inclusive com a IA no comando e em conversa resolvida.
- **Respostas rápidas com "/"**: as frases de sempre, com `{nome}` e `{atendente}` trocados na hora de inserir.
- **Etiquetas** por conversa, com filtro na lista e diálogo para organizar.
- **Quem está esperando há muito tempo**: contador no cabeçalho, título da aba, destaque na lista e um toque opcional.
- Relatórios: **por que o atendente pediu ajuda** (barras por motivo, com o próximo passo), motivo da transferência na planilha e aviso de mensagens que não chegaram.
- Painel do contato revisado: identidade à vista e quatro blocos que lembram como você os deixou.

## 0.2.0 — 2026-09-21

- Versão discreta no cabeçalho, inclusive no celular, e no final de Configurações, sempre a partir do `package.json`.
- Cabeçalho reorganizado em telas menores para manter nome, versão e navegação visíveis.
- Blocos “Rotinas”, “Usar dentro do seu assistente” e “Ajustes do servidor” ocultos em Configurações.
- Integrações, rotinas já cadastradas e acesso por assistentes externos continuam funcionando.

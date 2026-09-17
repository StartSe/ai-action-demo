/**
 * Política de rate limit das ações custosas (US-011), aplicada sempre via
 * enforceRateLimit (mesmo helper do upload, que usa 15/min). Janela fixa de
 * 60s. Contexto dos valores: prática Beta com ~100 usuários numa única VM de
 * 8 vCPUs — o objetivo é impedir que um usuário ou script monopolize a fila
 * e os recursos, sem atrapalhar o uso interativo normal.
 */

// Treino é o job mais pesado (minutos de CPU, só 4 slots na fila training):
// 5/min cobre cliques legítimos de ajuste/retry sem deixar um script encher a
// fila — mais que isso já significaria automação, não uso da UI.
export const TRAINING_RATE_LIMIT = { limit: 5, windowSec: 60 };

// Predição individual é síncrona e leve (1 linha por chamada), mas ocupa o
// worker: 30/min acomoda testes manuais rápidos e integrações modestas —
// volume maior deve ir para o lote.
export const PREDICT_RATE_LIMIT = { limit: 30, windowSec: 60 };

// Lote processa um arquivo inteiro por chamada (até 10MB parseados no
// worker): 5/min limita o pior caso por origem, e quem precisa de mais linhas
// cabe num arquivo maior em vez de mais chamadas.
export const PREDICT_BATCH_RATE_LIMIT = { limit: 5, windowSec: 60 };

// Cada transformação do Prepare gera nova versão + parquet no worker: 20/min
// mantém fluido o ajuste interativo de tipos coluna a coluna sem permitir um
// loop de script regravando parquets sem parar.
export const TRANSFORM_RATE_LIMIT = { limit: 20, windowSec: 60 };

// Falhas de autenticação da API pública e do MCP (US-021 da prática): conta
// por IP de origem SOMENTE as respostas 401 (chave ausente, inválida ou de
// deployment despublicado) — requisições autenticadas não entram. 10/min por
// IP cobre uma integração mal configurada tentando algumas vezes e denuncia
// script adivinhando chaves. O que acontece ao estourar depende de
// API_AUTH_FAIL_MODE (src/lib/api-auth-failures.ts): report só grava
// api.auth_bruteforce_suspected; enforce responde 429 com Retry-After.
export const API_AUTH_FAIL_RATE_LIMIT = { limit: 10, windowSec: 60 };

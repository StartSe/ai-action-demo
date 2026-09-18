/**
 * Formatação de números de telefone para a tela. O WhatsApp (e a z-api) trabalha só com dígitos
 * colados — `5511987654321` —, e esse é o valor que fica gravado em `conversas.numero`; nenhuma tela
 * deve mostrar o número cru. Arquivo sem "use client" e sem node:sqlite: pode ser importado tanto por
 * Client quanto por Server Components.
 */

/**
 * `5511987654321` → `+55 11 98765-4321`. Também entende números brasileiros de 8 dígitos (fixos) e
 * números internacionais, que saem como `+<país> <resto>`. Quando não reconhece o formato (número
 * interno como "simulador", texto vazio, tamanho fora do esperado), devolve o valor recebido sem
 * mudar nada — mostrar algo errado é pior do que mostrar o número como ele foi guardado.
 */
export function formatarTelefone(numero: string): string {
  const original = numero ?? "";
  // Número interno ("simulador", "assistente-ia") ou apelido: volta como veio.
  if (!original || /[a-zA-Z]/.test(original)) return original;
  const digitos = original.replace(/\D/g, "");
  if (!digitos) return original;

  // Brasil: 55 + DDD (2) + número (8 ou 9 dígitos).
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    const ddd = digitos.slice(2, 4);
    const resto = digitos.slice(4);
    const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4);
    const fim = resto.length === 9 ? resto.slice(5) : resto.slice(4);
    return `+55 ${ddd} ${meio}-${fim}`;
  }

  // Outros países: separa só o código do país (1 a 3 dígitos, aproximação suficiente para a tela).
  if (digitos.length >= 8 && digitos.length <= 15) {
    const pais = digitos.length > 11 ? digitos.slice(0, 3) : digitos.slice(0, 2);
    return `+${pais} ${digitos.slice(pais.length)}`;
  }

  return original;
}

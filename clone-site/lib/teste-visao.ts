// Teste de leitura de imagem do cartão "Qualidade da página gerada" (/setup): monta um PNG mínimo aqui
// mesmo (sem arquivo no repositório e sem dependência nova) e manda ao modelo escolhido. Se ele responder,
// o modelo lê imagens; se recusar, `lerCaptura` já devolve a frase certa com o botão para trocar o modelo.
import { deflateSync } from "node:zlib";
import { ErroIA } from "./ai";
import { lerCaptura } from "./gerador";

const LADO = 48;
/** Verde escuro à esquerda, branco à direita: uma divisão que qualquer modelo com visão descreve. */
const ESQUERDA: [number, number, number] = [0x0f, 0x76, 0x6e];
const DIREITA: [number, number, number] = [0xff, 0xff, 0xff];

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function bloco(tipo: string, dados: Buffer): Buffer {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, "ascii"), dados]);
  const soma = Buffer.alloc(4);
  soma.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, soma]);
}

/** PNG 48x48 RGB, metade colorida e metade branca, como data URL. */
export function pngDeTeste(): string {
  const linhas: Buffer[] = [];
  for (let y = 0; y < LADO; y++) {
    const linha = Buffer.alloc(1 + LADO * 3); // 1 byte de filtro (0) + pixels
    for (let x = 0; x < LADO; x++) {
      const [r, g, b] = x < LADO / 2 ? ESQUERDA : DIREITA;
      linha[1 + x * 3] = r;
      linha[2 + x * 3] = g;
      linha[3 + x * 3] = b;
    }
    linhas.push(linha);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(LADO, 0);
  ihdr.writeUInt32BE(LADO, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 2; // RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco("IHDR", ihdr),
    bloco("IDAT", deflateSync(Buffer.concat(linhas))),
    bloco("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** Manda o PNG ao modelo escolhido e devolve a frase que o cartão de /setup exibe. */
export async function testarLeituraDeImagem(): Promise<{ ok: boolean; mensagem: string }> {
  try {
    const resposta = await lerCaptura({
      system: "Você descreve imagens em poucas palavras, em português do Brasil.",
      prompt: "Responda em no máximo cinco palavras: o que aparece nesta imagem?",
      imagem: pngDeTeste(),
      maxTokens: 40,
    });
    const texto = resposta.replace(/\s+/g, " ").trim().slice(0, 80);
    return { ok: true, mensagem: `Este modelo lê imagens. Ao ver o teste, ele respondeu: “${texto}”.` };
  } catch (err) {
    if (err instanceof ErroIA) return { ok: false, mensagem: err.message };
    console.error(err);
    return { ok: false, mensagem: "Não foi possível testar a leitura de imagem agora. Tente de novo em um minuto." };
  }
}

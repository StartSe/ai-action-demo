// O currículo enviado no cadastro do candidato (US-008): o que é aceito, quanto pode pesar e como o
// texto sai de dentro do arquivo.
//
// Mora aqui, e não na rota, porque a mesma regra vale para o formulário, para o assistente (MCP) e
// para qualquer porta que venha depois. E porque a decisão mais delicada desta história é de produto,
// não de código: **um currículo ilegível não impede o cadastro**. O arquivo fica guardado do mesmo
// jeito, o texto fica vazio e quem cadastrou recebe um aviso com o caminho de saída (colar o texto),
// em vez de um erro que joga fora o que a pessoa acabou de preencher.
import { extractText } from "unpdf";

/** O teto do arquivo. Acima disto a resposta é uma recusa: guardar 20 MB de digitalização no banco
 * atrasaria toda leitura da tabela, e um currículo desse tamanho é quase sempre um engano. */
export const LIMITE_CV_BYTES = 5 * 1024 * 1024;
export const TIPOS_CV = ".pdf,.docx,.txt";

/** Abaixo disso o que saiu do arquivo é cabeçalho e número de página, não currículo. */
const MINIMO_TEXTO_UTIL = 120;

export const AVISO_SEM_TEXTO = "Não conseguimos ler o texto deste arquivo. Ele pode ser uma digitalização (só imagem): guardamos o arquivo, mas para a IA preencher a ficha cole o texto do currículo aqui embaixo.";
export const AVISO_DOCX = "Formato ainda não lido: guardamos o arquivo .docx, mas por enquanto só conseguimos ler PDF e TXT. Cole o texto do currículo aqui embaixo.";

export type LeituraCurriculo = {
  nome: string;
  tipo: string;
  dados: Uint8Array;
  /** Vazio quando não deu para ler — nunca `undefined`, para quem grava não ter dois casos. */
  texto: string;
  /** A frase que a tela mostra quando o arquivo entrou mas o texto não veio. */
  aviso?: string;
};

export type ResultadoLeitura = { ok: true; leitura: LeituraCurriculo } | { ok: false; erro: string };

type Formato = "pdf" | "docx" | "txt";

/** A extensão manda; o tipo enviado pelo navegador é o desempate (um `.pdf` renomeado é raro, um
 * navegador que manda `application/octet-stream` num arquivo bom, não). */
function formato(arquivo: File): Formato | null {
  const nome = (arquivo.name || "").toLowerCase();
  if (nome.endsWith(".pdf")) return "pdf";
  if (nome.endsWith(".docx")) return "docx";
  if (nome.endsWith(".txt")) return "txt";
  if (arquivo.type === "application/pdf") return "pdf";
  if (arquivo.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (arquivo.type.startsWith("text/")) return "txt";
  return null;
}

/** Espaços repetidos e linhas em branco de sobra saem: é isso que vai para o modelo montar a ficha. */
function limpar(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Lê o currículo enviado. Só recusa o que não dá para guardar (tamanho, formato desconhecido,
 * arquivo vazio); tudo mais entra, com aviso quando o texto não veio.
 */
export async function lerCurriculo(arquivo: File): Promise<ResultadoLeitura> {
  if (!arquivo.size) return { ok: false, erro: "O arquivo do currículo chegou vazio. Tente enviar de novo." };
  if (arquivo.size > LIMITE_CV_BYTES) {
    return { ok: false, erro: "O currículo passa de 5 MB. Envie um arquivo menor ou cole o texto do currículo." };
  }

  const tipo = formato(arquivo);
  if (!tipo) {
    return { ok: false, erro: "Envie o currículo em PDF, DOCX ou TXT. Outros formatos não são aceitos; você também pode colar o texto." };
  }

  const dados = new Uint8Array(await arquivo.arrayBuffer());
  const base = { nome: arquivo.name || `curriculo.${tipo}`, tipo: arquivo.type || "application/octet-stream", dados };

  if (tipo === "txt") {
    const texto = limpar(new TextDecoder().decode(dados));
    return { ok: true, leitura: { ...base, texto, aviso: texto.length < MINIMO_TEXTO_UTIL ? AVISO_SEM_TEXTO : undefined } };
  }

  // `.docx` continua em aberto no PRD (ler exigiria mais uma dependência). Até a decisão sair, o
  // arquivo é guardado e a tela pede o texto colado — recusar o formato faria a pessoa refazer o
  // cadastro por causa de uma escolha que ainda não foi tomada.
  if (tipo === "docx") return { ok: true, leitura: { ...base, texto: "", aviso: AVISO_DOCX } };

  let texto = "";
  try {
    // Com `mergePages`, `text` já vem como uma string só: aqui ninguém precisa saber de páginas.
    const extraido = await extractText(dados, { mergePages: true });
    texto = limpar(String(extraido.text || ""));
  } catch (err) {
    // PDF protegido ou corrompido não é erro do usuário no meio de um cadastro: guarda e avisa.
    console.error("Não foi possível ler o texto deste PDF de currículo.", err);
  }

  return { ok: true, leitura: { ...base, texto, aviso: texto.length < MINIMO_TEXTO_UTIL ? AVISO_SEM_TEXTO : undefined } };
}

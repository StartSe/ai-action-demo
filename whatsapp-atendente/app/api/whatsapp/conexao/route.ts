// Estado da conexão do número real da empresa, para o cartão "Conectar o WhatsApp" de Configurações
// (e, na US-011, para o passo 3 do Assistente). A tela chama esta rota a cada 5 s enquanto espera o
// QR Code ser lido, e com `?qr=1` a cada 20 s para trocar a imagem do código — separar as duas coisas
// é o que evita uma ida à z-api pela imagem a cada 5 segundos.
//
// Quatro estados possíveis, e nada além disso chega à tela:
//   sem_credenciais → os três valores da instância ainda não foram colados
//   aguardando      → instância viva, número ainda não conectado (é a hora do QR Code)
//   conectado       → número respondendo pelo WhatsApp da empresa
//   problema        → a z-api recusou ou não respondeu; `mensagem` é a frase de negócio já traduzida
import { aiEnabled } from "@/lib/ai";
import { limparTestesSeConfigurado } from "@/lib/conversas";
import { ErroWhatsApp } from "@/lib/erro-whatsapp";
import { provedorAtivo, ultimaRecebida, type UltimaRecebida } from "@/lib/whatsapp";
import { desconectar, garantirWebhooks, lerConexao, qrCode, statusInstancia } from "@/lib/zapi";
import { baseUrl } from "@/lib/setup-comum";
import { responderErro } from "@/app/api/erros";

export const dynamic = "force-dynamic";

export type EstadoConexao = "sem_credenciais" | "aguardando" | "conectado" | "problema";

export type RespostaConexao = {
  provedor: "zapi" | "meta" | null;
  estado: EstadoConexao;
  numero?: string;
  nome?: string;
  desde?: string;
  qr?: string;
  mensagem?: string;
  ultimaRecebida?: UltimaRecebida | null;
};

async function estadoAtual(comQr: boolean): Promise<RespostaConexao> {
  const provedor = provedorAtivo();
  if (!provedor) return { provedor: null, estado: "sem_credenciais" };

  // Na Meta não existe sessão para cair nem QR Code para ler: ter as credenciais salvas é tudo o que
  // dá para saber sem gastar uma chamada, e o teste do número continua no botão "Testar conexão".
  if (provedor === "meta") {
    return { provedor: "meta", estado: "conectado", ultimaRecebida: ultimaRecebida() };
  }

  const estado = await statusInstancia();
  if (estado.conectado) {
    // Rede de segurança do mesmo gesto que o aviso de conexão faz (app/webhook/zapi/route.ts): quando o
    // app já está configurado, as conversas de teste saem de cena uma única vez. Aqui cobre quem conectou
    // o número sem o aviso chegar (endereço ainda não cadastrado, app fora do ar naquele instante).
    limparTestesSeConfigurado({ iaConectada: aiEnabled(), numeroConectado: true });
    const conexao = lerConexao();
    return {
      provedor: "zapi",
      estado: "conectado",
      numero: conexao?.numero,
      nome: conexao?.nome,
      desde: conexao?.em,
      ultimaRecebida: ultimaRecebida(),
    };
  }
  // "Sem sessão" não é falha: é exatamente a espera pelo QR Code.
  if (estado.erro && estado.codigo !== "sem_sessao") {
    return { provedor: "zapi", estado: "problema", mensagem: estado.erro };
  }
  if (!comQr) return { provedor: "zapi", estado: "aguardando" };

  try {
    const qr = await qrCode();
    return { provedor: "zapi", estado: "aguardando", qr: qr ?? undefined };
  } catch (err) {
    if (err instanceof ErroWhatsApp) {
      if (err.codigo === "sem_sessao") return { provedor: "zapi", estado: "aguardando" };
      return { provedor: "zapi", estado: "problema", mensagem: err.message };
    }
    throw err;
  }
}

export async function GET(req: Request) {
  const comQr = new URL(req.url).searchParams.has("qr");
  // O cartão de conexão é a única tela que fica consultando a z-api, então é daqui que sai a conferência
  // de que a instância está mesmo avisando este app (ver garantirWebhooks): ela só chama a z-api quando o
  // endereço dos avisos mudou, e não segura a resposta — quem espera o QR Code não pode esperar por isso.
  garantirWebhooks(baseUrl(req)).catch((err) => console.error("Falha ao conferir os avisos da z-api:", err));
  try {
    return Response.json(await estadoAtual(comQr));
  } catch (err) {
    return responderErro(err, "Não foi possível saber como está a conexão do número agora. Tente de novo em alguns minutos.");
  }
}

/** Botão "Desconectar" do cartão: derruba a sessão e devolve o estado já recalculado (com QR Code). */
export async function DELETE() {
  try {
    await desconectar();
    return Response.json(await estadoAtual(true));
  } catch (err) {
    return responderErro(err, "Não foi possível desconectar o número agora. Tente de novo em alguns minutos.");
  }
}

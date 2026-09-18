"use client";
// Cartão adicional das Configurações: o interruptor do feedback por e-mail (US-020).
//
// Uma linha, e é isso de propósito. A decisão é binária — o vendedor recebe o feedback na caixa de
// entrada ou só o lê na tela — e um gestor que quer desligar isso não deveria precisar procurar. O
// *como* enviar (a conta de e-mail) continua no cartão de notificações, onde já está para toda a
// suíte; aqui fica só o *se* enviar, que é decisão deste app.
import { useEffect, useState } from "react";
import { Aviso } from "./ui";

type Dados = { ligado: boolean; motivoCanal: string | null };

export function EnvioFeedbackEmail() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState("");

  // Busca inicial em forma de corrente: a regra react-hooks/set-state-in-effect acusa a chamada
  // direta de uma função que mexe em estado no corpo do efeito, mesmo sendo assíncrona.
  useEffect(() => {
    fetch("/api/envio-feedback")
      .then((r) => r.json())
      .then((d: Dados) => setDados(d))
      .catch(() => setFalha("Não foi possível ler esta configuração agora. Atualize a página."));
  }, []);

  async function trocar(ligado: boolean) {
    setSalvando(true);
    setFalha("");
    // O estado muda na tela antes da resposta: uma caixa de seleção que demora a marcar parece travada.
    setDados((atual) => (atual ? { ...atual, ligado } : atual));
    try {
      const r = await fetch("/api/envio-feedback", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ligado }),
      });
      if (!r.ok) {
        setDados((atual) => (atual ? { ...atual, ligado: !ligado } : atual));
        setFalha("Não foi possível salvar esta escolha agora. Tente de novo.");
      }
    } catch {
      setDados((atual) => (atual ? { ...atual, ligado: !ligado } : atual));
      setFalha("Não foi possível salvar esta escolha agora. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="card p-6 max-md:p-5">
      <h2 className="text-lg font-bold mb-1">Feedback por e-mail</h2>
      <p className="text-muted text-sm mb-4 max-w-[640px]">
        Além de ver o resultado na tela, o vendedor pode receber a nota, o que fez bem e o que fazer diferente no e-mail com que entrou no
        treino — para reler antes da próxima conversa com um cliente de verdade.
      </p>

      <label className="flex items-start gap-2.5 text-[14px] cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 mt-0.5"
          checked={dados?.ligado ?? true}
          disabled={!dados || salvando}
          onChange={(e) => void trocar(e.target.checked)}
        />
        <span>Enviar o feedback por e-mail ao vendedor assim que a conversa for avaliada</span>
      </label>

      {dados && !dados.ligado && (
        <p className="text-muted text-sm mt-3">O feedback continua na tela de quem treina e no seu painel. Nada é enviado por e-mail.</p>
      )}

      {dados?.ligado && dados.motivoCanal && (
        <div className="mt-3">
          <Aviso tom="warn">Falta conectar uma conta de e-mail em Notificações, acima. Enquanto isso, o feedback fica só na tela.</Aviso>
        </div>
      )}

      {falha && (
        <div className="mt-3">
          <Aviso tom="danger">{falha}</Aviso>
        </div>
      )}
    </section>
  );
}

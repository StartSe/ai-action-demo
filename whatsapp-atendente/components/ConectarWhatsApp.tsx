import Link from "next/link";

/** Passo a passo para ligar o número de WhatsApp de verdade ao webhook deste app. */
export function ConectarWhatsApp({ url, verifyToken }: { url: string; verifyToken: string }) {
  return (
    <div className="bg-bg border border-line rounded-[10px] p-4 text-[13px]">
      <p className="mb-2">
        URL do webhook: <code className="bg-white border border-line px-2 py-0.5 rounded-md text-[12.5px] break-all">{url || "carregando..."}</code>
      </p>
      <p className="mb-2">
        Verify token: <code className="bg-white border border-line px-2 py-0.5 rounded-md text-[12.5px] break-all">{verifyToken || "carregando..."}</code>
      </p>
      <ol className="list-decimal pl-5 space-y-1.5">
        <li>Crie um app em <strong>developers.facebook.com</strong> e adicione o produto <strong>WhatsApp</strong>.</li>
        <li>Copie o token de acesso (temporário ou permanente) e o <strong>Phone number ID</strong> do número.</li>
        <li>Em <Link href="/setup" className="btn-link">Configurações</Link>, cole o token e o phone number ID nesta integração.</li>
        <li>Em Configuração &gt; Webhooks, cole a URL acima, informe o mesmo verify token mostrado acima e assine o campo <strong>messages</strong>.</li>
      </ol>
    </div>
  );
}

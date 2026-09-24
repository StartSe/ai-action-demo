import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-[70vh] flex flex-col items-center justify-center text-center gap-3 px-6">
      <h1 className="text-2xl font-extrabold">Este painel não existe mais</h1>
      <p className="text-muted max-w-[420px]">Ele pode ter sido apagado ou o endereço está incorreto. Gere um novo painel para continuar.</p>
      <Link href="/" className="btn-primary mt-2">Voltar para o início</Link>
    </main>
  );
}

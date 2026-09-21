"use client";

import Image from "next/image";
import { useState } from "react";
import { iniciaisDoNome, urlAvatarPublico } from "@/lib/avatar-pessoa";

export function AvatarPessoa({ nome, url }: { nome: string; url?: string | null }) {
  const [falhou, setFalhou] = useState<string | null>(null);
  const foto = urlAvatarPublico(url);
  return <span className="relative size-11 shrink-0 rounded-full overflow-hidden bg-accent-soft text-accent-ink ring-1 ring-line grid place-items-center text-sm font-bold" aria-hidden="true">
    {foto && falhou !== foto
      ? <Image src={foto} alt="" width={44} height={44} unoptimized loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" onError={() => setFalhou(foto)} />
      : iniciaisDoNome(nome)}
  </span>;
}

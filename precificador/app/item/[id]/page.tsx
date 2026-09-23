"use client";
// A tela inteira mora em components/Bancada.tsx (ver a nota em app/page.tsx).
import { use } from "react";
import { Bancada } from "@/components/Bancada";

export default function Page({ params }: PageProps<"/item/[id]">) {
  const { id } = use(params);
  return <Bancada id={id} />;
}

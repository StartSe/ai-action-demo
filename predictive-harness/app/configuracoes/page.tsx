import { Suspense } from "react";
import { Configuracoes } from "@/components/Configuracoes";
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Configuracoes />
    </Suspense>
  );
}

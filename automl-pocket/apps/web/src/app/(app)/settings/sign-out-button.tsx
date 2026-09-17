"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      await authClient.signOut();
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <Button variant="outline" onClick={handleSignOut} disabled={isPending}>
      {isPending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <LogOut className="size-4" aria-hidden />
      )}
      Sair da conta
    </Button>
  );
}

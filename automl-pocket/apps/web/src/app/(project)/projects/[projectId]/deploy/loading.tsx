import { Skeleton } from "@/components/ui/skeleton";

// Skeleton do grid de endpoints da aba Deploy durante o RSC
export default function DeployLoading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-10" aria-busy>
      <Skeleton className="h-7 w-80 max-w-full" />
      <Skeleton className="mt-2 h-4 w-64" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 shadow-sm"
          >
            <Skeleton className="size-16 rounded-xl" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-5 w-28 rounded-4xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

// Skeleton da listagem de datasets enquanto o RSC busca os dados
export default function DatasetsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8" aria-busy>
      <Skeleton className="h-8 w-44" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-muted/40 px-4 py-3">
          <Skeleton className="h-3.5 w-1/2" />
        </div>
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b border-border/60 px-4 py-3.5 last:border-b-0"
          >
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="ml-auto h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

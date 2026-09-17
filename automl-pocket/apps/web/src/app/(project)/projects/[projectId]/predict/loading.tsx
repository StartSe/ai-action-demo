import { Skeleton } from "@/components/ui/skeleton";

// Skeleton do Predict (painel de campos + área de configuração) durante o RSC
export default function PredictLoading() {
  return (
    <div className="flex h-full overflow-hidden bg-card" aria-busy>
      <aside className="flex w-80 shrink-0 flex-col border-r border-border">
        <div className="flex flex-col gap-3 border-b border-border p-4">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-52" />
          </div>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="flex items-center gap-2.5 py-1">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-12 rounded" />
            </div>
          ))}
        </div>
      </aside>

      <div className="flex flex-1 flex-col items-center gap-4 overflow-hidden px-6 py-10">
        <Skeleton className="h-6 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <Skeleton className="mt-4 h-40 w-full max-w-xl rounded-xl" />
        <Skeleton className="h-10 w-48" />
      </div>
    </div>
  );
}

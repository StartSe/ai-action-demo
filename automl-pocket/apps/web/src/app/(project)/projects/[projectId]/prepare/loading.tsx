import { Skeleton } from "@/components/ui/skeleton";

// Skeleton da grade do Prepare enquanto o RSC busca dataset e colunas
// (mesmo desenho do PreparePending, sem o polling)
export default function PrepareLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden" aria-busy>
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-2.5">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="ml-auto h-8 w-64" />
      </div>

      <div className="flex-1 overflow-hidden bg-card p-0">
        <div className="flex border-b border-border">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="flex h-[92px] w-46 shrink-0 flex-col gap-2 border-r border-border px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3.5 w-12" />
              </div>
              <Skeleton className="mt-auto h-8 w-full" />
            </div>
          ))}
        </div>
        {Array.from({ length: 14 }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex border-b border-border/60">
            {Array.from({ length: 6 }).map((_, colIndex) => (
              <div
                key={colIndex}
                className="flex h-[34px] w-46 shrink-0 items-center border-r border-border/60 px-2.5"
              >
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

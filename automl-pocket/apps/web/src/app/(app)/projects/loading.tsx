import { Skeleton } from "@/components/ui/skeleton";

// Skeleton da lista de projetos enquanto o RSC busca os dados
export default function ProjectsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8" aria-busy>
      <div className="flex flex-wrap items-center gap-4">
        <Skeleton className="h-8 w-40" />
        <div className="ml-auto flex items-center gap-3">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>

      <Skeleton className="mt-6 h-9 w-72" />

      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
          >
            <Skeleton className="h-36 rounded-none border-b border-border" />
            <div className="flex flex-col gap-2.5 p-4">
              <Skeleton className="h-4 w-2/3" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-3.5 w-28" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

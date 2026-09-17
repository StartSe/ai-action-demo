import { AppSidebar } from "@/components/app/app-sidebar";
import { requireSession } from "@/lib/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireSession();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar user={{ name: user.name, email: user.email }} />
      <main className="h-full min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

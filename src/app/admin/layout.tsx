import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAdmin = !!user && user.app_metadata?.role === "admin";

  if (!isAdmin) {
    // Not authenticated or not admin — render children without shell.
    // Middleware already blocks non-admin access to all routes except /admin/login,
    // so children here will always be the login page.
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <nav className="border-b bg-background">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-lg font-bold">
              Vitae Studio
            </Link>
            <Link
              href="/admin"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              הזמנות
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {user.email}
            </span>
            <form action="/api/admin/logout" method="POST">
              <Button variant="ghost" size="sm" type="submit">
                יציאה
              </Button>
            </form>
          </div>
        </div>
      </nav>
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}

function Button({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: string;
  size?: string;
}) {
  return (
    <button
      className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
      {...props}
    >
      {children}
    </button>
  );
}

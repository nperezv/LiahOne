import { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Redirect, useLocation } from "wouter";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { MobileNav } from "@/components/mobile-nav";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/lib/auth";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Cargando...
      </div>
    );
  }

  if (!isAuthenticated) {
    const next = `${window.location.pathname}${window.location.search}`;
    const redirectTarget = next.startsWith("/login") ? "/login" : `/login?next=${encodeURIComponent(next)}`;
    return <Redirect to={redirectTarget} />;
  }

  if (user?.requirePasswordChange && window.location.pathname !== "/profile") {
    return <Redirect to="/profile?forcePasswordChange=1" />;
  }

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  const isDashboardRoot =
    location === "/dashboard" ||
    location === "/secretary-dashboard" ||
    /^\/presidency\/[^/]+$/.test(location);
  const showBackButton = !isDashboardRoot;

  const handleGoBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    setLocation("/dashboard");
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <AppHeader
            user={user ? { name: user.name, role: user.role, avatarUrl: user.avatarUrl } : undefined}
            onLogout={logout}
          />
          <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
            {showBackButton && (
              <div className="flex justify-end px-4 pt-4 md:px-6 md:pt-6">
                <Button
                  variant="outline"
                  onClick={handleGoBack}
                  className="rounded-full"
                  data-testid="button-layout-back-panel"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> Volver al panel
                </Button>
              </div>
            )}
            {children}
          </main>
          {isMobile && <MobileNav />}
        </div>
      </div>
    </SidebarProvider>
  );
}

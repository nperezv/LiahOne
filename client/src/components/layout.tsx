import { ReactNode } from "react";
import { Redirect } from "wouter";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { useAuth } from "@/lib/auth";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, isAuthenticated, logout } = useAuth();

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

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <AppHeader
            user={user ? { name: user.name, role: user.role, avatarUrl: user.avatarUrl } : undefined}
            onLogout={logout}
          />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

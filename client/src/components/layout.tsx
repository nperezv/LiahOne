import { ReactNode, useEffect, useRef } from "react";
import { Redirect, useLocation } from "wouter";
import { SidebarProvider } from "@/components/ui/sidebar";
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
  const isMobile = useIsMobile();
  const [location] = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);
  const scrollingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;

    mainEl.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location]);

  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;

    const handleScroll = () => {
      if (!mainEl.classList.contains("is-scrolling")) {
        mainEl.classList.add("is-scrolling");
      }
      document.documentElement.classList.add("app-is-scrolling");

      if (scrollingTimeoutRef.current) {
        window.clearTimeout(scrollingTimeoutRef.current);
      }

      scrollingTimeoutRef.current = window.setTimeout(() => {
        mainEl.classList.remove("is-scrolling");
        document.documentElement.classList.remove("app-is-scrolling");
      }, 90);
    };

    mainEl.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      mainEl.removeEventListener("scroll", handleScroll);
      if (scrollingTimeoutRef.current) {
        window.clearTimeout(scrollingTimeoutRef.current);
      }
      mainEl.classList.remove("is-scrolling");
      document.documentElement.classList.remove("app-is-scrolling");
    };
  }, []);

  if (isLoading) {
    return (
      <div className="app-loader-shell flex h-screen items-center justify-center" aria-busy="true" aria-live="polite">
        <img
          src="/icons/compass.svg"
          alt=""
          className="app-splash-logo app-compass-spin"
          decoding="async"
          loading="eager"
        />
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

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <AppHeader
            user={user ? { name: user.name, role: user.role, avatarUrl: user.avatarUrl } : undefined}
            onLogout={logout}
          />
          <main ref={mainRef} className="app-scroll-container flex-1 overflow-y-auto pb-20 md:pb-0">
            <div key={location} className="app-page-content app-route-fade">
              {children}
            </div>
          </main>
          {isMobile && <MobileNav />}
        </div>
      </div>
    </SidebarProvider>
  );
}

import { ReactNode, useEffect, useRef } from "react";
import { Redirect, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { gsap } from "gsap";
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
  const scrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;

    mainEl.scrollTo({ top: 0, left: 0, behavior: "auto" });

    // Ardena card cascade & settling animation on route change ("se acomodan las cards")
    const animTimer = window.setTimeout(() => {
      // 1. Headings drop in smoothly
      const headings = mainEl.querySelectorAll("h1, .phead, .page-header");
      if (headings.length > 0) {
        gsap.fromTo(
          headings,
          { opacity: 0, y: -8 },
          {
            opacity: 1,
            y: 0,
            duration: 0.4,
            ease: "power2.out",
            clearProps: "transform,opacity",
          }
        );
      }

      // 2. Visible cards, widgets, metrics, and primary section items
      const candidateCards = Array.from(
        mainEl.querySelectorAll<HTMLElement>(
          ".glass-card, [data-slot='card'], [data-card], .card, .kpi, .app-card, main .space-y-6 > div, main .space-y-4 > div, main .grid > div"
        )
      ).filter((el) => {
        const parentCard = el.parentElement?.closest(
          ".glass-card, [data-slot='card'], [data-card], .card, .kpi, .app-card"
        );
        if (parentCard && parentCard !== el) return false;
        if (el.closest("nav") || el.offsetHeight < 28) return false;
        const rect = el.getBoundingClientRect();
        return rect.top < window.innerHeight + 80 && rect.bottom > 0;
      });

      if (candidateCards.length > 0) {
        const cardsToAnimate = candidateCards.slice(0, 10);
        gsap.fromTo(
          cardsToAnimate,
          {
            opacity: 0,
            y: 18,
            scale: 0.985,
          },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.52,
            ease: "power3.out",
            stagger: 0.045,
            clearProps: "transform,opacity",
          }
        );
      }
    }, 45);

    return () => window.clearTimeout(animTimer);
  }, [location]);

  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;

    const handleScroll = () => {
      if (!scrollRafRef.current) {
        scrollRafRef.current = window.requestAnimationFrame(() => {
          if (!mainEl.classList.contains("is-scrolling")) {
            mainEl.classList.add("is-scrolling");
          }
          document.documentElement.classList.add("app-is-scrolling");
          scrollRafRef.current = null;
        });
      }

      if (scrollingTimeoutRef.current) {
        window.clearTimeout(scrollingTimeoutRef.current);
      }

      scrollingTimeoutRef.current = window.setTimeout(() => {
        mainEl.classList.remove("is-scrolling");
        document.documentElement.classList.remove("app-is-scrolling");
      }, 160);
    };

    mainEl.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      mainEl.removeEventListener("scroll", handleScroll);
      if (scrollingTimeoutRef.current) {
        window.clearTimeout(scrollingTimeoutRef.current);
      }
      if (scrollRafRef.current) {
        window.cancelAnimationFrame(scrollRafRef.current);
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
    "--sidebar-width-icon": "3.25rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <AppHeader
            user={user ? { name: user.displayName || user.name, role: user.role, avatarUrl: user.avatarUrl } : undefined}
            onLogout={logout}
          />
          <main ref={mainRef} className="app-scroll-container flex-1 overflow-y-auto pb-20 md:pb-0">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location}
                initial={{ opacity: 0.3, y: 4, filter: "blur(2px)" }}
                animate={{
                  opacity: 1,
                  y: 0,
                  filter: "blur(0px)",
                  transition: {
                    duration: 0.24,
                    ease: [0.16, 1, 0.3, 1],
                  },
                }}
                exit={{
                  opacity: 0,
                  transition: {
                    duration: 0.08,
                    ease: "easeIn",
                  },
                }}
                className="app-page-content w-full min-h-full"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
          {isMobile && <MobileNav />}
        </div>
      </div>
    </SidebarProvider>
  );
}

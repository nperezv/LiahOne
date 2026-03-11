import { Suspense, lazy, useEffect, useState } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import {
  applyTheme,
  getStoredTheme,
  listenThemeChange,
  watchSystemTheme,
  type ThemePreference,
} from "@/lib/theme";

const LoginPage = lazy(() => import("@/pages/login"));
const WelcomePage = lazy(() => import("@/pages/welcome"));
const RequestAccessPage = lazy(() => import("@/pages/request-access"));
const DashboardPage = lazy(() => import("@/pages/dashboard"));
const SacramentalMeetingPage = lazy(() => import("@/pages/sacramental-meeting"));
const WardCouncilPage = lazy(() => import("@/pages/ward-council"));
const LeadershipPage = lazy(() => import("@/pages/leadership"));
const PresidencyMeetingsPage = lazy(() => import("@/pages/presidency-meetings"));
const PresidencyManageOrganizationPage = lazy(() => import("@/pages/presidency-manage-organization"));
const PresidencyMeetingReportPage = lazy(() => import("@/pages/presidency-meeting-report"));
const BudgetPage = lazy(() => import("@/pages/budget"));
const WelfarePage = lazy(() => import("@/pages/welfare"));
const InterviewsPage = lazy(() => import("@/pages/interviews"));
const OrganizationInterviewsPage = lazy(() => import("@/pages/organization-interviews"));
const GoalsPage = lazy(() => import("@/pages/goals"));
const BirthdaysPage = lazy(() => import("@/pages/birthdays"));
const ActivitiesPage = lazy(() => import("@/pages/activities"));
const CalendarPage = lazy(() => import("@/pages/calendar"));
const AgendaPage = lazy(() => import("@/pages/agenda"));
const ReportsPage = lazy(() => import("@/pages/reports"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const AssignmentsPage = lazy(() => import("@/pages/assignments"));
const ProfilePage = lazy(() => import("@/pages/profile"));
const AdminUsersPage = lazy(() => import("@/pages/admin-users"));
const NotificationsPage = lazy(() => import("@/pages/notifications"));
const DirectoryPage = lazy(() => import("@/pages/directory"));
const SecretaryDashboardPage = lazy(() => import("@/pages/secretary-dashboard"));
const ResourcesLibraryPage = lazy(() => import("@/pages/resources-library"));
const DonationsPage = lazy(() => import("@/pages/donations"));
const InventoryPage = lazy(() => import("@/pages/inventory"));
const InventoryNewPage = lazy(() => import("@/pages/inventory-new"));
const InventoryDetailPage = lazy(() => import("@/pages/inventory-detail"));
const InventoryAuditPage = lazy(() => import("@/pages/inventory-audit"));
const InventoryScanPage = lazy(() => import("@/pages/inventory-scan"));
const InventoryRegisterHubPage = lazy(() => import("@/pages/inventory-register"));
const InventoryListPage = lazy(() => import("@/pages/inventory-list"));
const InventoryPublicPage = lazy(() => import("@/pages/inventory-public"));
const InventoryLocationsPage = lazy(() => import("@/pages/inventory-locations"));
const InventoryLocationDetailPage = lazy(() => import("@/pages/inventory-location-detail"));
const InventoryHistoryPage = lazy(() => import("@/pages/inventory-history"));

function RouteLoadingFallback() {
  return (
    <div className="app-loader-shell flex h-screen items-center justify-center">
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

function LoginRoute() {
  const { isAuthenticated, login, verifyLogin } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const nextParam = params.get("next");
  const safeNext = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : null;

  if (isAuthenticated) {
    return <Redirect to={safeNext ?? "/dashboard"} />;
  }

  return <LoginPage onLogin={(credentials) => login(credentials)} onVerify={verifyLogin} />;
}

function ProtectedRoutes() {
  return (
    <Layout>
      <Switch>
        <Route path="/dashboard">
          <DashboardPage />
        </Route>
        <Route path="/sacramental-meeting">
          <SacramentalMeetingPage />
        </Route>
        <Route path="/ward-council">
          <WardCouncilPage />
        </Route>
        <Route path="/leadership">
          <LeadershipPage />
        </Route>
        <Route path="/presidency/:org/manage">
          <PresidencyManageOrganizationPage />
        </Route>
        <Route path="/presidency/:org/meeting/:meetingId/report">
          <PresidencyMeetingReportPage />
        </Route>
        <Route path="/presidency/:org">
          <PresidencyMeetingsPage />
        </Route>
        <Route path="/budget">
          <BudgetPage />
        </Route>
        <Route path="/welfare">
          <WelfarePage />
        </Route>
        <Route path="/interviews">
          <InterviewsPage />
        </Route>
        <Route path="/organization-interviews">
          <OrganizationInterviewsPage />
        </Route>
        <Route path="/goals">
          <GoalsPage />
        </Route>
        <Route path="/birthdays">
          <BirthdaysPage />
        </Route>
        <Route path="/activities">
          <ActivitiesPage />
        </Route>
        <Route path="/calendar">
          <CalendarPage />
        </Route>
        <Route path="/agenda">
          <AgendaPage />
        </Route>
        <Route path="/reports">
          <ReportsPage />
        </Route>
        <Route path="/settings">
          <SettingsPage />
        </Route>
        <Route path="/assignments">
          <AssignmentsPage />
        </Route>
        <Route path="/profile">
          <ProfilePage />
        </Route>
        <Route path="/notifications">
          <NotificationsPage />
        </Route>
        <Route path="/directory">
          <DirectoryPage />
        </Route>
        <Route path="/secretary-dashboard">
          <SecretaryDashboardPage />
        </Route>
        <Route path="/resources-library">
          <ResourcesLibraryPage />
        </Route>
        <Route path="/inventory">
          <InventoryPage />
        </Route>
        <Route path="/inventory/new">
          <InventoryNewPage />
        </Route>
        <Route path="/inventory/scan">
          <InventoryScanPage />
        </Route>
        <Route path="/inventory/register">
          <InventoryRegisterHubPage />
        </Route>
        <Route path="/inventory/list">
          <InventoryListPage />
        </Route>
        <Route path="/inventory/audit">
          <InventoryAuditPage />
        </Route>
        <Route path="/inventory/history">
          <InventoryHistoryPage />
        </Route>
        <Route path="/inventory/locations">
          <InventoryLocationsPage />
        </Route>
        <Route path="/inventory/locations/:locationCode">
          <InventoryLocationDetailPage />
        </Route>
        <Route path="/inventory/:assetCode">
          <InventoryDetailPage />
        </Route>
        <Route path="/a/:assetCode">
          <InventoryPublicPage />
        </Route>
        <Route path="/loc/:locationCode">
          <InventoryLocationDetailPage />
        </Route>
        <Route path="/admin/users">
          <AdminUsersPage />
        </Route>
        <Route path="/:rest*">
          <Redirect to="/dashboard" />
        </Route>
      </Switch>
    </Layout>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Switch>
        <Route path="/welcome" component={WelcomePage} />
        <Route path="/login" component={LoginRoute} />
        <Route path="/request-access" component={RequestAccessPage} />
        <Route path="/donar" component={DonationsPage} />
        <Route path="/">
          <Redirect to="/welcome" />
        </Route>
        <Route component={ProtectedRoutes} />
      </Switch>
    </Suspense>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [isSplashClosing, setIsSplashClosing] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    getStoredTheme()
  );

  useEffect(() => {
    applyTheme(themePreference);
    if (themePreference !== "system") return;
    return watchSystemTheme(() => applyTheme("system"));
  }, [themePreference]);

  useEffect(() => {
    const stopListening = listenThemeChange((preference) =>
      setThemePreference(preference)
    );
    return () => stopListening();
  }, []);

  useEffect(() => {
    let timeout: number | null = null;
    let dismissed = false;
    let closeTimeout: number | null = null;

    const dismissSplash = () => {
      if (dismissed) return;
      dismissed = true;
      setIsSplashClosing(true);
      closeTimeout = window.setTimeout(() => {
        setShowSplash(false);
      }, 220);
    };

    if (document.readyState === "complete") {
      dismissSplash();
    } else {
      window.addEventListener("load", dismissSplash, { once: true });
      timeout = window.setTimeout(dismissSplash, 1200);
    }

    return () => {
      if (timeout) {
        window.clearTimeout(timeout);
      }
      if (closeTimeout) {
        window.clearTimeout(closeTimeout);
      }
      window.removeEventListener("load", dismissSplash);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);

    const shouldUseTransition = (url?: string | URL | null) => {
      if (!url) return false;
      const current = new URL(window.location.href);
      const next = new URL(url.toString(), current.origin);
      if (next.origin !== current.origin) return false;
      return `${next.pathname}${next.search}${next.hash}` !== `${current.pathname}${current.search}${current.hash}`;
    };

    const runWithTransition = (callback: () => void) => {
      if (typeof document !== "undefined" && "startViewTransition" in document) {
        (document as any).startViewTransition(callback);
      } else {
        callback();
      }
    };

    window.history.pushState = function pushState(data: any, unused: string, url?: string | URL | null) {
      if (!shouldUseTransition(url)) {
        return originalPushState(data, unused, url);
      }
      runWithTransition(() => {
        originalPushState(data, unused, url);
      });
    };

    window.history.replaceState = function replaceState(data: any, unused: string, url?: string | URL | null) {
      if (!shouldUseTransition(url)) {
        return originalReplaceState(data, unused, url);
      }
      runWithTransition(() => {
        originalReplaceState(data, unused, url);
      });
    };

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          {showSplash && (
            <div className={`app-splash ${isSplashClosing ? "is-closing" : ""}`} aria-hidden="true">
              <div className="app-splash-content">
                <img src="/icons/compass.svg" alt="" className="app-splash-logo app-compass-spin" />
              </div>
            </div>
          )}
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

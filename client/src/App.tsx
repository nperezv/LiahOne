import { useEffect, useState } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import logoImage from "@assets/liahonapplogo2.svg";
import {
  applyTheme,
  getStoredTheme,
  listenThemeChange,
  watchSystemTheme,
  type ThemePreference,
} from "@/lib/theme";

import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import WelcomePage from "@/pages/welcome";
import RequestAccessPage from "@/pages/request-access";
import DashboardPage from "@/pages/dashboard";
import SacramentalMeetingPage from "@/pages/sacramental-meeting";
import WardCouncilPage from "@/pages/ward-council";
import LeadershipPage from "@/pages/leadership";
import PresidencyMeetingsPage from "@/pages/presidency-meetings";
import PresidencyManageOrganizationPage from "@/pages/presidency-manage-organization";
import PresidencyMeetingReportPage from "@/pages/presidency-meeting-report";
import BudgetPage from "@/pages/budget";
import InterviewsPage from "@/pages/interviews";
import OrganizationInterviewsPage from "@/pages/organization-interviews";
import GoalsPage from "@/pages/goals";
import BirthdaysPage from "@/pages/birthdays";
import ActivitiesPage from "@/pages/activities";
import CalendarPage from "@/pages/calendar";
import ReportsPage from "@/pages/reports";
import SettingsPage from "@/pages/settings";
import AssignmentsPage from "@/pages/assignments";
import ProfilePage from "@/pages/profile";
import AdminUsersPage from "@/pages/admin-users";
import NotificationsPage from "@/pages/notifications";
import DirectoryPage from "@/pages/directory";
import SecretaryDashboardPage from "@/pages/secretary-dashboard";
import ResourcesLibraryPage from "@/pages/resources-library";
import DonationsPage from "@/pages/donations";

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
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);
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
    const timeout = window.setTimeout(() => {
      setShowSplash(false);
    }, 900);

    return () => window.clearTimeout(timeout);
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
            <div className="app-splash" aria-hidden="true">
              <div className="app-splash-content">
                <img src={logoImage} alt="" className="app-splash-logo" />
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

import { useEffect } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";

import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import WelcomePage from "@/pages/welcome";
import RequestAccessPage from "@/pages/request-access";
import DashboardPage from "@/pages/dashboard";
import SacramentalMeetingPage from "@/pages/sacramental-meeting";
import WardCouncilPage from "@/pages/ward-council";
import PresidencyMeetingsPage from "@/pages/presidency-meetings";
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
      <Route path="/">
        <Redirect to="/welcome" />
      </Route>
      <Route component={ProtectedRoutes} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    // Apply dark mode globally
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

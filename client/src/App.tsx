import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { Switch, Route, useLocation } from "wouter";
import { AlertCircle } from "lucide-react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PaymentProvider } from "@/contexts/PaymentContext";
import { ChatProvider } from "@/contexts/ChatContext";
import { TenantProvider, useTenant } from "@/contexts/TenantContext";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/LandingPage";
import RequestAccessPage from "@/pages/RequestAccessPage";
import Inventory from "@/pages/Inventory";
import VehicleDetail from "@/pages/VehicleDetail";
import EmbedWidget from "@/pages/EmbedWidget";
import Login from "@/pages/Login";
import InviteAccept from "@/pages/InviteAccept";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import ErrorBoundary from "@/components/ErrorBoundary";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Manager = lazy(() => import("@/pages/Manager"));
const Sales = lazy(() => import("@/pages/Sales"));
const SuperAdminDashboard = lazy(() => import("@/pages/SuperAdminDashboard"));
const N8nIntegration = lazy(() => import("@/pages/N8nIntegration"));
const CallAnalysis = lazy(() => import("@/pages/CallAnalysis"));
const SequenceAnalytics = lazy(() => import("@/pages/SequenceAnalytics"));
const SalesAutoPosting = lazy(() => import("@/pages/SalesAutoPosting"));
const SalesConversations = lazy(() => import("@/pages/SalesConversations"));
const ContactsPage = lazy(() => import("@/pages/ContactsPage"));
const FbInbox = lazy(() => import("@/pages/FbInbox"));
const FbAutomationSettings = lazy(() => import("@/pages/FbAutomationSettings"));
const FbAuditConsole = lazy(() => import("@/pages/FbAuditConsole"));
const MarketplaceBlast = lazy(() => import("@/pages/MarketplaceBlast"));
const MarketplaceBlastVehicle = lazy(() => import("@/pages/MarketplaceBlastVehicle"));
const SavedAppraisals = lazy(() => import("@/pages/SavedAppraisals"));
const AppointmentsPage = lazy(() => import("@/pages/AppointmentsPage"));
const AppointmentDetailPage = lazy(() => import("@/pages/AppointmentDetailPage"));
const NotificationsPage = lazy(() => import("@/pages/NotificationsPage"));
const ManagerEmailSettingsPage = lazy(() => import("@/pages/ManagerEmailSettingsPage"));
const AppointmentCalendarPage = lazy(() => import("@/pages/AppointmentCalendarPage"));
const FollowUpTasksPage = lazy(() => import("@/pages/FollowUpTasksPage"));
const AutopostQueue = lazy(() => import("@/pages/AutopostQueue"));
const AutopostQueueManager = lazy(() => import("@/pages/AutopostQueueManager"));
const Admin = lazy(() => import("@/pages/Admin"));

function PageLoadingFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        <span className="text-sm font-medium">Loading...</span>
      </div>
    </div>
  );
}

function withSuspense(Component: ComponentType) {
  return function SuspendedRouteComponent() {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <Component />
      </Suspense>
    );
  };
}

const DashboardRoute = withSuspense(Dashboard);
const ManagerRoute = withSuspense(Manager);
const SalesRoute = withSuspense(Sales);
const SuperAdminDashboardRoute = withSuspense(SuperAdminDashboard);
const N8nIntegrationRoute = withSuspense(N8nIntegration);
const CallAnalysisRoute = withSuspense(CallAnalysis);
const SequenceAnalyticsRoute = withSuspense(SequenceAnalytics);
const SalesAutoPostingRoute = withSuspense(SalesAutoPosting);
const SalesConversationsRoute = withSuspense(SalesConversations);
const ContactsPageRoute = withSuspense(ContactsPage);
const FbInboxRoute = withSuspense(FbInbox);
const FbAutomationSettingsRoute = withSuspense(FbAutomationSettings);
const FbAuditConsoleRoute = withSuspense(FbAuditConsole);
const MarketplaceBlastRoute = withSuspense(MarketplaceBlast);
const MarketplaceBlastVehicleRoute = withSuspense(MarketplaceBlastVehicle);
const SavedAppraisalsRoute = withSuspense(SavedAppraisals);
const AppointmentsPageRoute = withSuspense(AppointmentsPage);
const AppointmentDetailPageRoute = withSuspense(AppointmentDetailPage);
const NotificationsPageRoute = withSuspense(NotificationsPage);
const ManagerEmailSettingsPageRoute = withSuspense(ManagerEmailSettingsPage);
const AppointmentCalendarPageRoute = withSuspense(AppointmentCalendarPage);
const FollowUpTasksPageRoute = withSuspense(FollowUpTasksPage);
const AutopostQueueRoute = withSuspense(AutopostQueue);
const AutopostQueueManagerRoute = withSuspense(AutopostQueueManager);
const AdminRoute = withSuspense(Admin);

function RedirectToRequestAccess() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/request-access");
  }, [setLocation]);

  return null;
}

function MarketingRouter() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/request-access" component={RequestAccessPage} />
      {/* Back-compat for older links */}
      <Route path="/demo" component={RedirectToRequestAccess} />
      <Route path="/get-demo" component={RedirectToRequestAccess} />
      <Route path="/login" component={Login} />
      <Route path="/dashboard" component={DashboardRoute} />
      <Route path="/n8n-integration" component={N8nIntegrationRoute} />
      <Route path="/manager">{() => <ErrorBoundary><ManagerRoute /></ErrorBoundary>}</Route>
      <Route path="/manager/appraisals" component={SavedAppraisalsRoute} />
      <Route path="/manager/appointments" component={AppointmentsPageRoute} />
      <Route path="/manager/calendar" component={AppointmentCalendarPageRoute} />
      <Route path="/manager/follow-up-tasks" component={FollowUpTasksPageRoute} />
      <Route path="/manager/autopost-queue" component={AutopostQueueManagerRoute} />
      <Route path="/manager/autopost/queue" component={AutopostQueueRoute} />
      <Route path="/manager/appointments/:id" component={AppointmentDetailPageRoute} />
      <Route path="/manager/notifications" component={NotificationsPageRoute} />
      <Route path="/manager/notifications/settings" component={ManagerEmailSettingsPageRoute} />
      <Route path="/sales" component={SalesRoute} />
      <Route path="/sales/auto-posting" component={SalesAutoPostingRoute} />
      <Route path="/sales/conversations" component={SalesConversationsRoute} />
      <Route path="/sales/fb-inbox" component={FbInboxRoute} />
      <Route path="/sales/fb-automation" component={FbAutomationSettingsRoute} />
      <Route path="/sales/fb-audit" component={FbAuditConsoleRoute} />
      <Route path="/sales/marketplace-blast" component={MarketplaceBlastRoute} />
      <Route path="/marketplace-blast" component={MarketplaceBlastRoute} />
      <Route path="/marketplace-blast/vehicle/:id" component={MarketplaceBlastVehicleRoute} />
      <Route path="/contacts" component={ContactsPageRoute} />
      <Route path="/admin" component={AdminRoute} />
      <Route path="/super-admin" component={SuperAdminDashboardRoute} />
      <Route path="/call-analysis" component={CallAnalysisRoute} />
      <Route path="/sequence-analytics" component={SequenceAnalyticsRoute} />
      <Route path="/invite/:token" component={InviteAccept} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password/:token" component={ResetPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/terms-of-service" component={TermsOfService} />
      <Route component={NotFound} />
    </Switch>
  );
}

function DealershipRouter() {
  return (
    <Switch>
      <Route path="/" component={Inventory} />
      <Route path="/vehicle/:id" component={VehicleDetail} />
      <Route path="/request-access" component={RequestAccessPage} />
      {/* Back-compat for older links */}
      <Route path="/demo" component={RedirectToRequestAccess} />
      <Route path="/get-demo" component={RedirectToRequestAccess} />
      <Route path="/login" component={Login} />
      <Route path="/dashboard" component={DashboardRoute} />
      <Route path="/n8n-integration" component={N8nIntegrationRoute} />
      <Route path="/manager">{() => <ErrorBoundary><ManagerRoute /></ErrorBoundary>}</Route>
      <Route path="/manager/appraisals" component={SavedAppraisalsRoute} />
      <Route path="/manager/appointments" component={AppointmentsPageRoute} />
      <Route path="/manager/calendar" component={AppointmentCalendarPageRoute} />
      <Route path="/manager/follow-up-tasks" component={FollowUpTasksPageRoute} />
      <Route path="/manager/autopost-queue" component={AutopostQueueManagerRoute} />
      <Route path="/manager/autopost/queue" component={AutopostQueueRoute} />
      <Route path="/manager/appointments/:id" component={AppointmentDetailPageRoute} />
      <Route path="/manager/notifications" component={NotificationsPageRoute} />
      <Route path="/manager/notifications/settings" component={ManagerEmailSettingsPageRoute} />
      <Route path="/sales" component={SalesRoute} />
      <Route path="/sales/auto-posting" component={SalesAutoPostingRoute} />
      <Route path="/sales/conversations" component={SalesConversationsRoute} />
      <Route path="/sales/fb-inbox" component={FbInboxRoute} />
      <Route path="/sales/fb-automation" component={FbAutomationSettingsRoute} />
      <Route path="/sales/fb-audit" component={FbAuditConsoleRoute} />
      <Route path="/sales/marketplace-blast" component={MarketplaceBlastRoute} />
      <Route path="/marketplace-blast" component={MarketplaceBlastRoute} />
      <Route path="/marketplace-blast/vehicle/:id" component={MarketplaceBlastVehicleRoute} />
      <Route path="/contacts" component={ContactsPageRoute} />
      <Route path="/admin" component={AdminRoute} />
      <Route path="/super-admin" component={SuperAdminDashboardRoute} />
      <Route path="/call-analysis" component={CallAnalysisRoute} />
      <Route path="/sequence-analytics" component={SequenceAnalyticsRoute} />
      <Route path="/invite/:token" component={InviteAccept} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password/:token" component={ResetPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/embed" component={EmbedWidget} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/terms-of-service" component={TermsOfService} />
      <Route component={NotFound} />
    </Switch>
  );
}

function UnknownTenantHost() {
  const { subdomain } = useTenant();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-xl rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-4 flex items-center gap-3 text-foreground">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <h1 className="text-2xl font-semibold">Unknown tenant host</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {subdomain
            ? `The host ${subdomain}.lotview.ai is not mapped to an active dealership.`
            : "This host is not mapped to an active dealership."}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Apex and www stay on the LotView marketing site. Active dealership hosts go to the tenant app. Invalid hosts fail closed here instead of falling through to marketing.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="https://lotview.ai" className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Go to lotview.ai
          </a>
          <a href="/request-access" className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium text-foreground">
            Request access
          </a>
        </div>
      </div>
    </div>
  );
}

function AppRouter() {
  const { isMarketingSite, isLoading, routingStatus } = useTenant();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-primary/20 rounded-lg" />
          <div className="h-4 w-24 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (routingStatus === 'unknown-tenant') {
    return <UnknownTenantHost />;
  }

  return isMarketingSite ? <MarketingRouter /> : <DealershipRouter />;
}

// Wrap the whole app for unexpected crashes
function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="olympic-theme">
      <QueryClientProvider client={queryClient}>
        <TenantProvider>
          <PaymentProvider>
            <ChatProvider>
              <TooltipProvider>
                <ImpersonationBanner />
                <AppRouter />
                <Toaster />
              </TooltipProvider>
            </ChatProvider>
          </PaymentProvider>
        </TenantProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;

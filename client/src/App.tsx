import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
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
import Admin from "@/pages/Admin";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Manager from "@/pages/Manager";
import Sales from "@/pages/Sales";
import SuperAdminDashboard from "@/pages/SuperAdminDashboard";
import N8nIntegration from "@/pages/N8nIntegration";
import InviteAccept from "@/pages/InviteAccept";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import CallAnalysis from "@/pages/CallAnalysis";
import SequenceAnalytics from "@/pages/SequenceAnalytics";
import SalesAutoPosting from "@/pages/SalesAutoPosting";
import SalesConversations from "@/pages/SalesConversations";
import ContactsPage from "@/pages/ContactsPage";
import FbInbox from "@/pages/FbInbox";
import FbAutomationSettings from "@/pages/FbAutomationSettings";
import FbAuditConsole from "@/pages/FbAuditConsole";
import MarketplaceBlast from "@/pages/MarketplaceBlast";
import MarketplaceBlastVehicle from "@/pages/MarketplaceBlastVehicle";
import SavedAppraisals from "@/pages/SavedAppraisals";
import AppointmentsPage from "@/pages/AppointmentsPage";
import AppointmentDetailPage from "@/pages/AppointmentDetailPage";
import NotificationsPage from "@/pages/NotificationsPage";
import ManagerEmailSettingsPage from "@/pages/ManagerEmailSettingsPage";
import AppointmentCalendarPage from "@/pages/AppointmentCalendarPage";
import FollowUpTasksPage from "@/pages/FollowUpTasksPage";
import AutopostQueue from "@/pages/AutopostQueue";
import AutopostQueueManager from "@/pages/AutopostQueueManager";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import ErrorBoundary from "@/components/ErrorBoundary";

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
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/n8n-integration" component={N8nIntegration} />
      <Route path="/manager">{() => <ErrorBoundary><Manager /></ErrorBoundary>}</Route>
      <Route path="/manager/appraisals" component={SavedAppraisals} />
      <Route path="/manager/appointments" component={AppointmentsPage} />
      <Route path="/manager/calendar" component={AppointmentCalendarPage} />
      <Route path="/manager/follow-up-tasks" component={FollowUpTasksPage} />
      <Route path="/manager/autopost-queue" component={AutopostQueueManager} />
      <Route path="/manager/autopost/queue" component={AutopostQueue} />
      <Route path="/manager/appointments/:id" component={AppointmentDetailPage} />
      <Route path="/manager/notifications" component={NotificationsPage} />
      <Route path="/manager/notifications/settings" component={ManagerEmailSettingsPage} />
      <Route path="/sales" component={Sales} />
      <Route path="/sales/auto-posting" component={SalesAutoPosting} />
      <Route path="/sales/conversations" component={SalesConversations} />
      <Route path="/sales/fb-inbox" component={FbInbox} />
      <Route path="/sales/fb-automation" component={FbAutomationSettings} />
      <Route path="/sales/fb-audit" component={FbAuditConsole} />
      <Route path="/sales/marketplace-blast" component={MarketplaceBlast} />
      <Route path="/marketplace-blast" component={MarketplaceBlast} />
      <Route path="/marketplace-blast/vehicle/:id" component={MarketplaceBlastVehicle} />
      <Route path="/contacts" component={ContactsPage} />
      <Route path="/admin" component={Admin} />
      <Route path="/super-admin" component={SuperAdminDashboard} />
      <Route path="/call-analysis" component={CallAnalysis} />
      <Route path="/sequence-analytics" component={SequenceAnalytics} />
      <Route path="/invite/:token" component={InviteAccept} />
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
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/n8n-integration" component={N8nIntegration} />
      <Route path="/manager">{() => <ErrorBoundary><Manager /></ErrorBoundary>}</Route>
      <Route path="/manager/appraisals" component={SavedAppraisals} />
      <Route path="/manager/appointments" component={AppointmentsPage} />
      <Route path="/manager/calendar" component={AppointmentCalendarPage} />
      <Route path="/manager/follow-up-tasks" component={FollowUpTasksPage} />
      <Route path="/manager/autopost-queue" component={AutopostQueueManager} />
      <Route path="/manager/autopost/queue" component={AutopostQueue} />
      <Route path="/manager/appointments/:id" component={AppointmentDetailPage} />
      <Route path="/manager/notifications" component={NotificationsPage} />
      <Route path="/manager/notifications/settings" component={ManagerEmailSettingsPage} />
      <Route path="/sales" component={Sales} />
      <Route path="/sales/auto-posting" component={SalesAutoPosting} />
      <Route path="/sales/conversations" component={SalesConversations} />
      <Route path="/sales/fb-inbox" component={FbInbox} />
      <Route path="/sales/fb-automation" component={FbAutomationSettings} />
      <Route path="/sales/fb-audit" component={FbAuditConsole} />
      <Route path="/sales/marketplace-blast" component={MarketplaceBlast} />
      <Route path="/marketplace-blast" component={MarketplaceBlast} />
      <Route path="/marketplace-blast/vehicle/:id" component={MarketplaceBlastVehicle} />
      <Route path="/contacts" component={ContactsPage} />
      <Route path="/admin" component={Admin} />
      <Route path="/super-admin" component={SuperAdminDashboard} />
      <Route path="/call-analysis" component={CallAnalysis} />
      <Route path="/sequence-analytics" component={SequenceAnalytics} />
      <Route path="/invite/:token" component={InviteAccept} />
      <Route path="/embed" component={EmbedWidget} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/terms-of-service" component={TermsOfService} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppRouter() {
  const { isMarketingSite, isLoading } = useTenant();

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

  return isMarketingSite ? <MarketingRouter /> : <DealershipRouter />;
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


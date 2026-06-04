import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ClarityShell } from "@/components/clarity/ClarityShell";
import { AuthProvider } from "@/hooks/use-auth";
import { OrgProvider } from "@/hooks/use-org";
import { RequireAuth } from "@/components/auth/RequireAuth";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import CommandCenter from "./pages/CommandCenter";
import ExecutiveCommand from "./pages/ExecutiveCommand";
import TodaysOpportunities from "./pages/TodaysOpportunities";
import DenialIntelligence from "./pages/DenialIntelligence";
import DenialDetail from "./pages/DenialDetail";
import WorkQueues from "./pages/WorkQueues";
import AppealsWorkbench from "./pages/AppealsWorkbench";
import AppealPacket from "./pages/AppealPacket";
import EvidenceVault from "./pages/EvidenceVault";
import RevenueLeak from "./pages/RevenueLeak";
import PayerIntel from "./pages/PayerIntel";
import PayerRequirements from "./pages/PayerRequirements";
import Playbooks from "./pages/Playbooks";
import RecoveryPipeline from "./pages/RecoveryPipeline";
import RecoveryForecast from "./pages/RecoveryForecast";
import TeamOperations from "./pages/TeamOperations";
import ExecutiveReporting from "./pages/ExecutiveReporting";
import Ingestion from "./pages/Ingestion";
import AuditTrace from "./pages/AuditTrace";
import ClaimsWorkbench from "./pages/ClaimsWorkbench";
import TransparencyCenter from "./pages/TransparencyCenter";
import TransparencyDetail from "./pages/TransparencyDetail";
import RecoveryIntelligence from "./pages/RecoveryIntelligence";
import OutcomeLog from "./pages/OutcomeLog";
import ExecutivePipeline from "./pages/ExecutivePipeline";
import SLAManagement from "./pages/SLAManagement";
import Escalations from "./pages/Escalations";
import WorkloadManagement from "./pages/WorkloadManagement";
import RecoveryOpsDashboard from "./pages/RecoveryOpsDashboard";
import PayerOperations from "./pages/PayerOperations";
import RecoveryFactory from "./pages/RecoveryFactory";
import ImportCenter from "./pages/ImportCenter";
import ImportHistory from "./pages/ImportHistory";
import ExceptionQueue from "./pages/ExceptionQueue";
import ExceptionDetail from "./pages/ExceptionDetail";
import RemittanceIntake from "./pages/RemittanceIntake";
import ExecutiveHome from "./pages/ExecutiveHome";
import ExecutiveRecovery from "./pages/ExecutiveRecovery";
import ExecutivePayers from "./pages/ExecutivePayers";
import ExecutivePlaybooks from "./pages/ExecutivePlaybooks";
import ExecutiveValue from "./pages/ExecutiveValue";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedShell = () => (
  <RequireAuth>
    <OrgProvider>
      <ClarityShell>
        <Routes>
          <Route path="/" element={<CommandCenter />} />
          <Route path="/command" element={<ExecutiveCommand />} />
          <Route path="/today" element={<TodaysOpportunities />} />
          <Route path="/pipeline" element={<RecoveryPipeline />} />
          <Route path="/forecast" element={<RecoveryForecast />} />
          <Route path="/team" element={<TeamOperations />} />
          <Route path="/playbooks" element={<Playbooks />} />
          <Route path="/denials" element={<DenialIntelligence />} />
          <Route path="/denials/:claimId" element={<DenialDetail />} />
          <Route path="/queues" element={<WorkQueues />} />
          <Route path="/queues/:queueId" element={<WorkQueues />} />
          <Route path="/claims" element={<ClaimsWorkbench />} />
          <Route path="/claims/:claimId" element={<ClaimsWorkbench />} />
          <Route path="/appeals" element={<AppealsWorkbench />} />
          <Route path="/packet" element={<AppealPacket />} />
          <Route path="/packet/:claimId" element={<AppealPacket />} />
          <Route path="/evidence" element={<EvidenceVault />} />
          <Route path="/leak" element={<RevenueLeak />} />
          <Route path="/payers" element={<PayerIntel />} />
          <Route path="/payer-requirements" element={<PayerRequirements />} />
          <Route path="/reports" element={<ExecutiveReporting />} />
          <Route path="/transparency" element={<TransparencyCenter />} />
          <Route path="/transparency/:claimId" element={<TransparencyDetail />} />
          <Route path="/recovery-intel" element={<RecoveryIntelligence />} />
          <Route path="/outcomes" element={<OutcomeLog />} />
          <Route path="/ops" element={<RecoveryOpsDashboard />} />
          <Route path="/pipeline-exec" element={<ExecutivePipeline />} />
          <Route path="/sla" element={<SLAManagement />} />
          <Route path="/escalations" element={<Escalations />} />
          <Route path="/workload" element={<WorkloadManagement />} />
          <Route path="/payer-ops" element={<PayerOperations />} />
          <Route path="/factory" element={<RecoveryFactory />} />
          <Route path="/factory/import" element={<ImportCenter />} />
          <Route path="/factory/history" element={<ImportHistory />} />
          <Route path="/factory/exceptions" element={<ExceptionQueue />} />
          <Route path="/factory/exceptions/:exceptionId" element={<ExceptionDetail />} />
          <Route path="/factory/remittance" element={<RemittanceIntake />} />
          <Route path="/ingest" element={<Ingestion />} />
          <Route path="/audit" element={<AuditTrace />} />
          <Route path="/executive" element={<ExecutiveHome />} />
          <Route path="/executive/recovery" element={<ExecutiveRecovery />} />
          <Route path="/executive/payers" element={<ExecutivePayers />} />
          <Route path="/executive/playbooks" element={<ExecutivePlaybooks />} />
          <Route path="/executive/value" element={<ExecutiveValue />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ClarityShell>
    </OrgProvider>
  </RequireAuth>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/*" element={<ProtectedShell />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ClarityShell } from "@/components/clarity/ClarityShell";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
            <Route path="/ingest" element={<Ingestion />} />
            <Route path="/audit" element={<AuditTrace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ClarityShell>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ClarityShell } from "@/components/clarity/ClarityShell";
import CommandCenter from "./pages/CommandCenter";
import DenialIntelligence from "./pages/DenialIntelligence";
import DenialDetail from "./pages/DenialDetail";
import WorkQueues from "./pages/WorkQueues";
import Appeals from "./pages/Appeals";
import RevenueLeak from "./pages/RevenueLeak";
import PayerIntel from "./pages/PayerIntel";
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
            <Route path="/denials" element={<DenialIntelligence />} />
            <Route path="/denials/:claimId" element={<DenialDetail />} />
            <Route path="/queues" element={<WorkQueues />} />
            <Route path="/queues/:queueId" element={<WorkQueues />} />
            <Route path="/claims" element={<ClaimsWorkbench />} />
            <Route path="/claims/:claimId" element={<ClaimsWorkbench />} />
            <Route path="/appeals" element={<Appeals />} />
            <Route path="/leak" element={<RevenueLeak />} />
            <Route path="/payers" element={<PayerIntel />} />
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

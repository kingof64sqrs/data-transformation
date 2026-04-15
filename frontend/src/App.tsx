import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BaseLayout from './components/layout/BaseLayout';
import CommandCenter from './pages/CommandCenter';
import PipelineOrchestration from './pages/PipelineOrchestration';
import RawVaultExplorer from './pages/RawVaultExplorer';
import CanonicalExplorer from './pages/CanonicalExplorer';
import IdentityGraph from './pages/IdentityGraph';
import ReviewWorkbench from './pages/ReviewWorkbench';
import MasterRecords from './pages/MasterRecords';
import DataLineage from './pages/DataLineage';
import Settings from './pages/Settings';
import { ToastProvider } from './components/ui/Toast';
import AIAssistantPanel from './components/ui/AIAssistantPanel';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Router>
          <BaseLayout>
            <Routes>
              <Route path="/" element={<CommandCenter />} />
              <Route path="/pipeline" element={<PipelineOrchestration />} />
              <Route path="/raw-vault" element={<RawVaultExplorer />} />
              <Route path="/canonical" element={<CanonicalExplorer />} />
              <Route path="/identity-graph" element={<IdentityGraph />} />
              <Route path="/review" element={<ReviewWorkbench />} />
              <Route path="/master-records" element={<MasterRecords />} />
              <Route path="/lineage" element={<DataLineage />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </BaseLayout>
          <AIAssistantPanel />
        </Router>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;

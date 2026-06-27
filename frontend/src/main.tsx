import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import './App.css'

import { MerchantsDashboard }   from './pages/MerchantsDashboard'
import { MerchantWorkspacePage } from './pages/MerchantWorkspacePage'
import { DecisionReportPage }    from './pages/DecisionReportPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Merchant dashboard — list + search + custom JSON */}
        <Route path="/" element={<MerchantsDashboard />} />

        {/* Merchant workspace — profile, snapshot, decisions table, run button */}
        <Route path="/merchants/:merchantId" element={<MerchantWorkspacePage />} />

        {/* Immutable decision report — O(1) fetch by composite key */}
        <Route path="/merchants/:merchantId/decisions/:requestId" element={<DecisionReportPage />} />

        {/* Legacy routes — redirect to new structure */}
        <Route path="/applications/:merchantId" element={<Navigate to="/" replace />} />
        <Route path="/applications/:merchantId/reports/:requestId" element={<Navigate to="/" replace />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)

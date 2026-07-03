import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { CityPage } from './pages/CityPage';
import { ProfilePage } from './pages/ProfilePage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminPage } from './pages/AdminPage';
import { AdminAccessPage } from './pages/AdminAccessPage';
import { RegisterPage } from './pages/RegisterPage';
import { LoginPage } from './pages/LoginPage';
import { LegalPage } from './pages/LegalPage';
import { PricingPage } from './pages/PricingPage';
import { ContactPage } from './pages/ContactPage';
import { TokenShopPage } from './pages/TokenShopPage';
import { CoinWalletPage } from './pages/CoinWalletPage';
import { ReferralPage } from './pages/ReferralPage';
import { InstallAppPage } from './pages/InstallAppPage';
import { AgeGate } from './components/AgeGate';

export function App() {
  return (
    <AgeGate>
      <Routes>
        <Route path="/admin-access" element={<AdminAccessPage />} />
        <Route path="/admin/login" element={<AdminPage />} />
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/city/:city" element={<CityPage />} />
          <Route path="/profile/:id" element={<ProfilePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/tokens" element={<TokenShopPage />} />
          <Route path="/coins" element={<CoinWalletPage />} />
          <Route path="/app" element={<InstallAppPage />} />
          <Route path="/app/install" element={<InstallAppPage />} />
          <Route path="/install" element={<InstallAppPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/terms" element={<LegalPage />} />
          <Route path="/privacy" element={<LegalPage />} />
          <Route path="/refund-policy" element={<LegalPage />} />
          <Route path="/content-rules" element={<LegalPage />} />
          <Route path="/report-abuse" element={<LegalPage />} />
          <Route path="/imprint" element={<LegalPage />} />
          <Route path="/legal-notice" element={<LegalPage />} />
          <Route path="/r/:referralCode" element={<ReferralPage />} />
          <Route path="/legal/:page" element={<LegalPage />} />
        </Route>
      </Routes>
    </AgeGate>
  );
}

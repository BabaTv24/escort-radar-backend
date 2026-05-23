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
import { TokenShopPage } from './pages/TokenShopPage';
import { ReferralPage } from './pages/ReferralPage';
import { AgeGate } from './components/AgeGate';

export function App() {
  return (
    <AgeGate>
      <Routes>
        <Route path="/admin-access" element={<AdminAccessPage />} />
        <Route path="/admin/login" element={<AdminAccessPage />} />
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/city/:city" element={<CityPage />} />
          <Route path="/profile/:id" element={<ProfilePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/tokens" element={<TokenShopPage />} />
          <Route path="/r/:referralCode" element={<ReferralPage />} />
          <Route path="/legal/:page" element={<LegalPage />} />
        </Route>
      </Routes>
    </AgeGate>
  );
}

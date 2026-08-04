import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CommunicationPlusCard } from '../../Front/src/components/CommunicationPlusCard';
import { I18nProvider } from '../../Front/src/i18n';
import '../../Front/src/styles.css';
import './communication-plus.css';

localStorage.setItem('escort-radar-lang', 'pl');

const status = {
  client_premium_active: true,
  communication_plus_active: false,
  price_bcu: '1000000',
  price_bc: '100',
  available_balance_bcu: '1500000',
  available_balance_bc: '150',
  sufficient_balance: true
};

function Preview() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <main className="client-office-shell communication-plus-visual-fixture">
          <aside className="client-office-sidebar">
            <strong className="client-office-brand">Private Client Office</strong>
            <nav className="client-office-nav">
              <span className="client-office-nav-item">Dashboard</span>
              <span className="client-office-nav-item">Radar</span>
              <span className="client-office-nav-item">Ulubione</span>
              <span className="client-office-nav-item">BC Wallet</span>
            </nav>
          </aside>
          <section className="client-office-main">
            <header className="client-office-topbar"><strong>Communication Plus</strong><span className="client-office-credit-pill">150 BC</span></header>
            <section className="client-office-hero"><div><p className="eyebrow">Private Client Office</p><h1>Witaj ponownie</h1><p>Bezpieczny dostęp do funkcji premium.</p></div></section>
            <div className="client-office-grid">
              <section className="client-office-left"><article className="client-office-card"><p className="eyebrow">Konto</p><h2>Client Premium aktywne</h2><p>Saldo dostępne: 150 BC</p></article></section>
              <section className="client-office-right"><CommunicationPlusCard state="ready" status={status} purchasing={false} purchaseError={null} onPurchase={() => undefined} onRetry={() => undefined} /></section>
            </div>
          </section>
        </main>
      </I18nProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);

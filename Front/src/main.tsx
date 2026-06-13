import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { I18nProvider } from './i18n';
import './styles.css';

declare global {
  interface Window {
    __ESCORT_RADAR_VERSION__?: {
      app: string;
      commit: string;
      buildTime: string;
      assetVersion: string;
    };
  }
}

declare const __ESCORT_RADAR_GIT_COMMIT__: string;
declare const __ESCORT_RADAR_BUILD_TIME__: string;
declare const __ESCORT_RADAR_ASSET_VERSION__: string;

window.__ESCORT_RADAR_VERSION__ = {
  app: 'escort-radar-front',
  commit: __ESCORT_RADAR_GIT_COMMIT__,
  buildTime: __ESCORT_RADAR_BUILD_TIME__,
  assetVersion: __ESCORT_RADAR_ASSET_VERSION__,
};

console.info('[escort-radar version]', window.__ESCORT_RADAR_VERSION__);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nProvider>
  </React.StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}

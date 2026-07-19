import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { profilesRouter } from './routes/profiles.js';
import { uploadsRouter } from './routes/uploads.js';
import { reportsRouter } from './routes/reports.js';
import { adminRouter } from './routes/admin.js';
import { paymentsRouter } from './routes/payments.js';
import { bookingRequestsRouter } from './routes/bookingRequests.js';
import { tokensRouter } from './routes/tokens.js';
import { favoritesRouter } from './routes/favorites.js';
import { tagsRouter } from './routes/tags.js';
import { clientActivationRouter } from './routes/clientActivation.js';
import { authRouter } from './routes/auth.js';
import { clientIntentRouter } from './routes/clientIntent.js';
import { stripeWebhookRouter } from './routes/stripeWebhook.js';
import { clientPreferencesRouter } from './routes/clientPreferences.js';
import { clientPersonalProfileRouter } from './routes/clientPersonalProfile.js';
import { bcuRouter } from './routes/bcu.js';
import { sponsoredProfilesRouter } from './routes/sponsoredProfiles.js';
import { adminReferralsRouter, referralsRouter } from './routes/referrals.js';

const serverBuildTime = new Date().toISOString();
const app = express();

app.use(helmet());
const allowedOrigins = new Set([
  config.frontendUrl,
  'https://escort-radar.fun',
  'https://www.escort-radar.fun'
]);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true
}));
app.use('/api/stripe', express.raw({ type: 'application/json', limit: '1mb' }), stripeWebhookRouter);
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'escort-radar-api', health: '/api/health' });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'escort-radar-api', environment: config.nodeEnv });
});

app.get('/api/version', (_req, res) => {
  res.json({
    app: 'escort-radar-backend',
    commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'local',
    buildTime: serverBuildTime,
    routes: {
      profiles: true,
      favorites: true,
      clientPreferences: true,
      clientIntent: true,
      adminProfiles: true,
      adminSubscriptions: true,
    },
  });
});

app.use('/api/auth', authRouter);
app.use('/api/profiles', profilesRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/booking-requests', bookingRequestsRouter);
app.use('/api/tokens', tokensRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/client-activation', clientActivationRouter);
app.use('/api/client-intent', clientIntentRouter);
app.use('/api/client/preferences', clientPreferencesRouter);
app.use('/api/client/personal-profile', clientPersonalProfileRouter);
app.use('/api/bcu', bcuRouter);
app.use('/api/sponsored', sponsoredProfilesRouter);
app.use('/api/referrals', referralsRouter);
app.use('/api/admin/referrals', adminReferralsRouter);

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`Escort Radar API listening on :${config.port}`);
});

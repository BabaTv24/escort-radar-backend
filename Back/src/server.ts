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
import { tagsRouter } from './routes/tags.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'escort-radar-api', environment: config.nodeEnv });
});

app.use('/api/profiles', profilesRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/booking-requests', bookingRequestsRouter);
app.use('/api/tokens', tokensRouter);
app.use('/api/tags', tagsRouter);

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

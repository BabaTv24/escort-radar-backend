import { Router } from 'express';

export const paymentsRouter = Router();

paymentsRouter.get('/plans', (_req, res) => {
  res.json({
    plans: [
      {
        id: 'premium-monthly',
        name: 'Premium Profile',
        price_eur: 49.99,
        interval: 'month',
        status: 'coming_soon'
      }
    ],
    todo: 'Connect subscription billing for advertiser profiles before paid launch.'
  });
});

import express, { Router, type Request } from 'express';
import { config } from '../config.js';
import { supabaseAdmin } from '../supabase.js';
import {
  berlinDay,
  clientAddressFromHeaders,
  countryFromHeaders,
  isAutomatedUserAgent,
  newDailySalt,
  TrafficRateLimiter,
  validateTrafficEvent,
  visitorHash
} from '../trafficAnalytics.js';

export const analyticsRouter = Router();

const limiter = new TrafficRateLimiter();
let saltCache: { day: string; salt: string } | null = null;

async function dailySalt() {
  const day = berlinDay();
  if (saltCache?.day === day) return saltCache.salt;
  const { error: insertError } = await supabaseAdmin.from('traffic_salts').insert({ day, salt: newDailySalt() });
  if (insertError && insertError.code !== '23505') throw insertError;
  const { data, error } = await supabaseAdmin.from('traffic_salts').select('salt').eq('day', day).single();
  if (error || !data) throw error || new Error('Traffic salt unavailable');
  saltCache = { day, salt: String(data.salt) };
  // Once per day per process: enforce retention and destroy old salts.
  await supabaseAdmin.rpc('prune_traffic_analytics', { p_retention_days: 90 });
  return saltCache.salt;
}

function headerValue(req: Request, name: string) {
  const value = req.headers[name];
  return String(Array.isArray(value) ? value[0] : value || '');
}

/** Only the production site counts: development hosts, other origins and automation are excluded. */
function rejectionReason(req: Request, userAgent: string) {
  const origin = headerValue(req, 'origin');
  if (!origin || !config.analyticsAllowedOrigins.includes(origin)) return 'origin';
  if (headerValue(req, 'dnt') === '1' || headerValue(req, 'sec-gpc') === '1') return 'opt_out';
  if (isAutomatedUserAgent(userAgent)) return 'automation';
  return null;
}

// text/plain keeps the beacon a CORS "simple request" (no preflight, no cookies).
analyticsRouter.post('/collect', express.text({ type: ['text/plain', 'application/json'], limit: '2kb' }), async (req, res) => {
  try {
    const userAgent = headerValue(req, 'user-agent');
    if (rejectionReason(req, userAgent)) return res.status(204).end();
    let body: unknown = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return res.status(204).end(); }
    }
    const decision = validateTrafficEvent(body, userAgent);
    if (!decision.accepted) return res.status(204).end();
    const salt = await dailySalt();
    const hash = visitorHash(salt, clientAddressFromHeaders(req.headers, req.socket.remoteAddress), userAgent);
    if (!limiter.allow(hash)) return res.status(204).end();
    const { error } = await supabaseAdmin.from('traffic_events').insert({
      ...decision.row,
      country: countryFromHeaders(req.headers),
      visitor_hash: hash
    });
    if (error) console.warn('[analytics] insert failed', error.code);
  } catch (error) {
    console.warn('[analytics] collect failed', error instanceof Error ? error.message : 'unknown');
  }
  // The response never reveals whether an event was counted.
  return res.status(204).end();
});

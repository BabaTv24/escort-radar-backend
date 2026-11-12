import express, { Router, type Request } from 'express';
import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { supabaseAdmin } from '../supabase.js';
import {
  berlinDay,
  clientAddressFromHeaders,
  countryFromHeaders,
  DistinctVisitorCap,
  isAutomatedUserAgent,
  newDailySalt,
  TRAFFIC_RETENTION_DAYS,
  TrafficRateLimiter,
  validateTrafficEvent,
  visitorHash
} from '../trafficAnalytics.js';

export const analyticsRouter = Router();

const visitorLimiter = new TrafficRateLimiter(120, 10 * 60 * 1000);
const addressLimiter = new TrafficRateLimiter(300, 10 * 60 * 1000);
const distinctVisitors = new DistinctVisitorCap(5);
let saltCache: { day: string; salt: string } | null = null;

async function dailySalt() {
  const day = berlinDay();
  if (saltCache?.day === day) return saltCache;
  const { error: insertError } = await supabaseAdmin.from('traffic_salts').insert({ day, salt: newDailySalt() });
  if (insertError && insertError.code !== '23505') throw insertError;
  const { data, error } = await supabaseAdmin.from('traffic_salts').select('salt').eq('day', day).single();
  if (error || !data) throw error || new Error('Traffic salt unavailable');
  saltCache = { day, salt: String(data.salt) };
  return saltCache;
}

/** Deletes raw events past retention and salts older than yesterday. Runs on a timer, independent of traffic. */
export async function pruneTrafficAnalytics() {
  const { error } = await supabaseAdmin.rpc('prune_traffic_analytics', { p_retention_days: TRAFFIC_RETENTION_DAYS });
  if (error) console.warn('[analytics] retention prune failed', error.code || error.message);
}

export function startTrafficRetention(intervalMs = 6 * 60 * 60 * 1000) {
  void pruneTrafficAnalytics();
  const timer = setInterval(() => { void pruneTrafficAnalytics(); }, intervalMs);
  timer.unref?.();
  return timer;
}

function headerValue(req: Request, name: string) {
  const value = req.headers[name];
  return String(Array.isArray(value) ? value[0] : value || '');
}

/** Only the production site counts: development hosts, other origins, automation and opt-outs are excluded. */
function rejectionReason(req: Request, userAgent: string) {
  const origin = headerValue(req, 'origin');
  if (!origin || !config.analyticsAllowedOrigins.includes(origin)) return 'origin';
  if (headerValue(req, 'dnt') === '1' || headerValue(req, 'sec-gpc') === '1') return 'opt_out';
  if (isAutomatedUserAgent(userAgent)) return 'automation';
  return null;
}

// text/plain keeps the beacon a CORS "simple request" (no preflight, no cookies).
analyticsRouter.post('/collect', (req, res, next) => {
  // Collection is off until the privacy review: nothing is parsed, hashed or stored.
  if (!config.analyticsCollectionEnabled) return res.status(204).end();
  next();
}, express.text({ type: ['text/plain', 'application/json'], limit: '2kb' }), async (req, res) => {
  try {
    const userAgent = headerValue(req, 'user-agent');
    if (rejectionReason(req, userAgent)) return res.status(204).end();
    let body: unknown = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return res.status(204).end(); }
    }
    const decision = validateTrafficEvent(body, userAgent);
    if (!decision.accepted) return res.status(204).end();
    const { day, salt } = await dailySalt();
    const address = clientAddressFromHeaders(req.headers, req.socket.remoteAddress, {
      trustedProxyHops: config.analyticsTrustedProxyHops,
      clientIpHeader: config.analyticsClientIpHeader
    });
    const addressKey = createHash('sha256').update(`${salt}\u0001${address}`).digest('hex').slice(0, 32);
    const hash = visitorHash(salt, address, userAgent);
    if (!addressLimiter.allow(addressKey) || !visitorLimiter.allow(hash) || !distinctVisitors.allow(day, addressKey, hash)) {
      return res.status(204).end();
    }
    const profileView = decision.row.event_type === 'profile_view';
    const now = new Date();
    if (profileView) now.setUTCMinutes(0, 0, 0);
    const { error } = await supabaseAdmin.from('traffic_events').insert({
      ...decision.row,
      country: countryFromHeaders(req.headers),
      // Profile views are counted per profile only: no visitor pseudonym and an hour-level timestamp,
      // so a visit to a specific advertiser cannot be linked to a visitor's other activity.
      visitor_hash: profileView ? null : hash,
      occurred_at: now.toISOString()
    });
    if (error) console.warn('[analytics] insert failed', error.code);
  } catch (error) {
    console.warn('[analytics] collect failed', error instanceof Error ? error.message : 'unknown');
  }
  // The response never reveals whether an event was counted.
  return res.status(204).end();
});

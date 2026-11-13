import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from './config.js';
import { MailTransportError, hostingerCheck, hostingerSend, isAllowedBaseUrl, isValidMailboxId } from './hostingerMail.js';

/**
 * Pre-launch interest list (ER-V1-PUBLIC-PREVIEW-003). Double opt-in, no accounts, no payments.
 * Collection is controlled only by WAITLIST_COLLECTION_ENABLED and is independent of commercial operations.
 */
export const WAITLIST_CONSENT_VERSION = 'waitlist-consent-2026-11-v1';
export const WAITLIST_INTEREST_TYPES = ['client_premium', 'advertiser'] as const;
export type WaitlistInterestType = typeof WAITLIST_INTEREST_TYPES[number];
export const WAITLIST_LANGUAGES = ['de', 'pl', 'en'] as const;
export type WaitlistLanguage = typeof WAITLIST_LANGUAGES[number];
export const WAITLIST_SOURCES = ['fanpage', 'register', 'pricing', 'profile', 'radar', 'other'] as const;
export const WAITLIST_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;
export const WAITLIST_RESEND_COOLDOWN_MS = 10 * 60 * 1000;
export const WAITLIST_MAX_SENDS_PER_RECORD = 5;
export const WAITLIST_RETENTION = { pendingDays: 30, unsubscribedDays: 30, confirmedDays: 730 } as const;
export const WAITLIST_LAUNCH_TEMPLATE_VERSION = 'launch-v1';

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

export type WaitlistSubmission = {
  email: string;
  interest_type: WaitlistInterestType;
  preferred_language: WaitlistLanguage;
  source_page: string;
};

export type SubmissionDecision =
  | { ok: true; value: WaitlistSubmission; honeypot: boolean }
  | { ok: false; code: 'WAITLIST_INVALID_EMAIL' | 'WAITLIST_INVALID_INTEREST' | 'WAITLIST_CONSENT_REQUIRED' };

export function normalizeWaitlistEmail(value: unknown) {
  const email = String(value ?? '').trim().toLowerCase();
  if (email.length < 6 || email.length > 254 || !EMAIL_PATTERN.test(email) || /[<>"'`,;()\\]/.test(email)) return null;
  return email;
}

export function validateWaitlistSubmission(body: unknown): SubmissionDecision {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const email = normalizeWaitlistEmail(input.email);
  if (!email) return { ok: false, code: 'WAITLIST_INVALID_EMAIL' };
  const interest = String(input.interest_type ?? '');
  if (!(WAITLIST_INTEREST_TYPES as readonly string[]).includes(interest)) return { ok: false, code: 'WAITLIST_INVALID_INTEREST' };
  // Consent must be the explicit boolean true for the current consent text.
  if (input.consent !== true || input.consent_version !== WAITLIST_CONSENT_VERSION) return { ok: false, code: 'WAITLIST_CONSENT_REQUIRED' };
  const language = String(input.language ?? '').toLowerCase();
  const source = String(input.source_page ?? '');
  return {
    ok: true,
    honeypot: typeof input.website === 'string' && input.website.trim() !== '',
    value: {
      email,
      interest_type: interest as WaitlistInterestType,
      preferred_language: ((WAITLIST_LANGUAGES as readonly string[]).includes(language) ? language : 'de') as WaitlistLanguage,
      source_page: (WAITLIST_SOURCES as readonly string[]).includes(source) ? source : 'other'
    }
  };
}

export function createConfirmToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashWaitlistToken(token) };
}

export function hashWaitlistToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function isWellFormedToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function unsubscribeToken(leadId: string, secret = config.waitlistTokenSecret) {
  return createHmac('sha256', secret).update(`waitlist-unsubscribe\u0001${leadId}`).digest('base64url');
}

export function verifyUnsubscribeToken(leadId: unknown, token: unknown, secret = config.waitlistTokenSecret) {
  if (typeof leadId !== 'string' || !/^[0-9a-f-]{36}$/.test(leadId) || typeof token !== 'string' || secret.length < 32) return false;
  const expected = Buffer.from(unsubscribeToken(leadId, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Mail delivery needs a configured transport and a token secret; otherwise the list stays closed. */
export function waitlistMailConfigured() {
  if (config.waitlistTokenSecret.length < 32) return false;
  if (config.waitlistMailTransport === 'hostinger_api') {
    const mail = config.hostingerMail;
    return Boolean(mail.token && isValidMailboxId(mail.mailboxId) && isAllowedBaseUrl(mail.baseUrl, config.nodeEnv === 'production'));
  }
  const smtp = config.waitlistSmtp;
  return Boolean(smtp.host && smtp.from);
}

export function waitlistCollectionOpen() {
  return config.waitlistCollectionEnabled === true && waitlistMailConfigured();
}

let transporter: Transporter | null = null;
function mailTransport() {
  const smtp = config.waitlistSmtp;
  transporter ||= nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000
  });
  return transporter;
}

export type WaitlistMail = { to: string; subject: string; text: string; html: string; unsubscribeUrl?: string };

// Provider back-off: after a rate limit or a rejected token the provider is not called again for a while,
// so repeated submissions cannot get the server address blocked (the Hostinger API may block IPs that keep exceeding limits).
let providerPausedUntil = 0;
let providerPauseReason: string | null = null;
export function mailProviderPause() {
  return providerPausedUntil > Date.now() ? { until: new Date(providerPausedUntil).toISOString(), reason: providerPauseReason } : null;
}
export function resetMailProviderPause() {
  providerPausedUntil = 0;
  providerPauseReason = null;
}

/**
 * Sends one message through the configured transport. Throws MailTransportError:
 * notAccepted=false (timeout, 504) means the outcome is unknown and the caller must not resend right away.
 */
export async function sendWaitlistMail(mail: WaitlistMail) {
  if (!waitlistMailConfigured()) throw new MailTransportError('MAIL_NOT_CONFIGURED', null);
  if (providerPausedUntil > Date.now()) throw new MailTransportError('MAIL_RATE_LIMITED', null, providerPausedUntil - Date.now(), providerPauseReason);
  if (config.waitlistMailTransport === 'hostinger_api') {
    try {
      await hostingerSend({ ...config.hostingerMail, timeoutMs: 15_000 }, mail);
    } catch (error) {
      if (error instanceof MailTransportError && (error.code === 'MAIL_RATE_LIMITED' || error.code === 'MAIL_AUTH_FAILED' || error.code === 'MAIL_FORBIDDEN')) {
        const pauseMs = error.code === 'MAIL_RATE_LIMITED' ? Math.min(Math.max(error.retryAfterMs ?? 60_000, 30_000), 15 * 60_000) : 5 * 60_000;
        providerPausedUntil = Date.now() + pauseMs;
        providerPauseReason = error.code;
      }
      throw error;
    }
    return;
  }
  try {
    await mailTransport().sendMail({
      from: config.waitlistSmtp.from,
      replyTo: config.waitlistSmtp.replyTo || undefined,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      headers: mail.unsubscribeUrl ? { 'List-Unsubscribe': `<${mail.unsubscribeUrl}>` } : undefined
    });
  } catch (error) {
    const code = String((error as { code?: string }).code || '');
    if (code === 'EAUTH') throw new MailTransportError('MAIL_AUTH_FAILED', null, null, code);
    // SMTP reports failures before the message is queued; treat them as not accepted.
    throw new MailTransportError('MAIL_UNAVAILABLE', 0, null, code || null);
  }
}

/** Read-only provider check for the admin (sends nothing). */
export async function waitlistMailCheck() {
  if (config.waitlistMailTransport !== 'hostinger_api') return { transport: 'smtp', configured: waitlistMailConfigured() };
  const mail = config.hostingerMail;
  const base = {
    transport: 'hostinger_api',
    configured: waitlistMailConfigured(),
    api_url_https: isAllowedBaseUrl(mail.baseUrl, true),
    mailbox_id_format_ok: isValidMailboxId(mail.mailboxId),
    expected_sender: mail.senderAddress || null
  };
  try {
    const result = await hostingerCheck(mail);
    return { ...base, ok: result.mailbox_found && (!mail.senderAddress || result.mailbox_address?.toLowerCase() === mail.senderAddress), ...result, sender_matches: mail.senderAddress ? result.mailbox_address?.toLowerCase() === mail.senderAddress : null };
  } catch (error) {
    return { ...base, ok: false, error: error instanceof MailTransportError ? error.code : 'MAIL_UNAVAILABLE', status: error instanceof MailTransportError ? error.status : null };
  }
}

function appBase() {
  return config.appUrl.replace(/\/+$/, '');
}

export function confirmUrl(token: string) {
  return `${appBase()}/waitlist/confirm?token=${encodeURIComponent(token)}`;
}

export function unsubscribeUrl(leadId: string) {
  return `${appBase()}/waitlist/unsubscribe?id=${encodeURIComponent(leadId)}&token=${encodeURIComponent(unsubscribeToken(leadId))}`;
}

const PRODUCTS: Record<WaitlistInterestType, Record<WaitlistLanguage, { name: string; price: string }>> = {
  client_premium: {
    de: { name: 'Premium für Kunden', price: '0,99 € einmalig' },
    pl: { name: 'Premium dla klientów', price: '0,99 EUR jednorazowo' },
    en: { name: 'Client Premium', price: 'EUR 0.99 one-time' }
  },
  advertiser: {
    de: { name: 'Premium-Inserat', price: '49,99 € / 30 Tage' },
    pl: { name: 'Ogłoszenie Premium', price: '49,99 EUR / 30 dni' },
    en: { name: 'Premium Listing', price: 'EUR 49.99 / 30 days' }
  }
};

export function waitlistProduct(type: WaitlistInterestType, language: WaitlistLanguage) {
  return PRODUCTS[type][language];
}

const COPY: Record<WaitlistLanguage, Record<string, string>> = {
  de: {
    confirmSubject: 'Bitte bestätige dein Interesse an Escort-Radar',
    hello: 'Hallo,',
    confirmIntro: 'du hast auf escort-radar.fun Interesse an folgendem zukünftigen Angebot bekundet:',
    confirmAction: 'Interesse bestätigen',
    confirmExpiry: 'Der Link ist 48 Stunden gültig und kann nur einmal verwendet werden.',
    notice: 'Wichtig: Dadurch wird kein Konto erstellt, keine Bestellung aufgegeben, keine kostenpflichtige Leistung reserviert und keine Zahlungspflicht begründet. Eine Verfügbarkeit des Angebots wird nicht garantiert.',
    confirmPurpose: 'Nach der Bestätigung informieren wir dich einmalig per E-Mail, sobald dieses Angebot startet. Andere Werbung senden wir nicht.',
    ignore: 'Wenn du das nicht warst, ignoriere diese E-Mail. Ohne Bestätigung wird deine Adresse nach spätestens 30 Tagen gelöscht.',
    withdraw: 'Einwilligung widerrufen',
    alreadySubject: 'Dein Interesse an Escort-Radar ist bereits bestätigt',
    alreadyIntro: 'diese E-Mail-Adresse ist für folgendes Angebot bereits bestätigt:',
    alreadyNothing: 'Du musst nichts weiter tun.',
    launchSubject: 'Escort-Radar ist gestartet: {product}',
    launchIntro: 'du hattest uns gebeten, dich zu informieren: {product} ({price}) ist jetzt auf escort-radar.fun verfügbar.',
    launchAction: 'Zu Escort-Radar',
    launchOnce: 'Dies ist die einmalige Start-Benachrichtigung, für die du eingewilligt hast.',
    imprint: 'Impressum und Datenschutz'
  },
  pl: {
    confirmSubject: 'Potwierdź swoje zainteresowanie Escort-Radar',
    hello: 'Dzień dobry,',
    confirmIntro: 'na escort-radar.fun zgłoszono zainteresowanie następującą przyszłą ofertą:',
    confirmAction: 'Potwierdź zainteresowanie',
    confirmExpiry: 'Link jest ważny 48 godzin i można go użyć tylko raz.',
    notice: 'Ważne: nie powoduje to założenia konta, złożenia zamówienia, rezerwacji płatnej usługi ani powstania obowiązku zapłaty. Dostępność oferty nie jest gwarantowana.',
    confirmPurpose: 'Po potwierdzeniu poinformujemy Cię jednorazowo e-mailem, gdy oferta wystartuje. Nie wysyłamy innych reklam.',
    ignore: 'Jeśli to nie Ty, zignoruj tę wiadomość. Bez potwierdzenia adres zostanie usunięty najpóźniej po 30 dniach.',
    withdraw: 'Wycofaj zgodę',
    alreadySubject: 'Twoje zainteresowanie Escort-Radar jest już potwierdzone',
    alreadyIntro: 'ten adres e-mail jest już potwierdzony dla oferty:',
    alreadyNothing: 'Nie musisz nic więcej robić.',
    launchSubject: 'Escort-Radar wystartował: {product}',
    launchIntro: 'zgodnie z Twoją prośbą informujemy: {product} ({price}) jest już dostępne na escort-radar.fun.',
    launchAction: 'Przejdź do Escort-Radar',
    launchOnce: 'To jednorazowe powiadomienie o starcie, na które wyrażono zgodę dla tego adresu.',
    imprint: 'Impressum i ochrona danych'
  },
  en: {
    confirmSubject: 'Please confirm your interest in Escort-Radar',
    hello: 'Hello,',
    confirmIntro: 'interest in the following future offer was registered on escort-radar.fun:',
    confirmAction: 'Confirm interest',
    confirmExpiry: 'The link is valid for 48 hours and can be used once.',
    notice: 'Important: this does not create an account, place an order, reserve a paid service or create any payment obligation. Availability of the offer is not guaranteed.',
    confirmPurpose: 'After confirmation we will notify you once by e-mail when this offer launches. We do not send other advertising.',
    ignore: 'If this was not you, ignore this e-mail. Without confirmation the address is deleted after 30 days at the latest.',
    withdraw: 'Withdraw consent',
    alreadySubject: 'Your interest in Escort-Radar is already confirmed',
    alreadyIntro: 'this e-mail address is already confirmed for:',
    alreadyNothing: 'There is nothing else you need to do.',
    launchSubject: 'Escort-Radar has launched: {product}',
    launchIntro: 'you asked us to let you know: {product} ({price}) is now available on escort-radar.fun.',
    launchAction: 'Go to Escort-Radar',
    launchOnce: 'This is the one-time launch notification you consented to.',
    imprint: 'Legal notice and privacy'
  }
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));
}

function layout(language: WaitlistLanguage, paragraphs: string[], action: { label: string; url: string } | null, footerLinks: { label: string; url: string }[]) {
  const text = [...paragraphs, ...(action ? [`${action.label}: ${action.url}`] : []), '', ...footerLinks.map((link) => `${link.label}: ${link.url}`)].join('\n\n');
  const html = `<!doctype html><html lang="${language}"><body style="margin:0;background:#0b0a08;color:#f3ead7;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:28px 22px">
<p style="color:#f4d77f;font-weight:700;letter-spacing:.12em;font-size:12px;margin:0 0 18px">ESCORT-RADAR</p>
${paragraphs.map((paragraph) => `<p style="line-height:1.55;font-size:15px;margin:0 0 14px">${escapeHtml(paragraph)}</p>`).join('\n')}
${action ? `<p style="margin:22px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#f4d77f;color:#16120a;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">${escapeHtml(action.label)}</a></p>` : ''}
<p style="font-size:12px;color:#a59a86;line-height:1.5;margin-top:26px">${footerLinks.map((link) => `<a href="${escapeHtml(link.url)}" style="color:#a59a86">${escapeHtml(link.label)}</a>`).join(' · ')}</p>
</div></body></html>`;
  return { text, html };
}

function fill(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_match, key) => values[key] ?? '');
}

export function confirmationMail(input: { to: string; leadId: string; token: string; type: WaitlistInterestType; language: WaitlistLanguage }): WaitlistMail {
  const copy = COPY[input.language];
  const product = waitlistProduct(input.type, input.language);
  const unsubscribe = unsubscribeUrl(input.leadId);
  const body = layout(input.language, [
    copy.hello,
    copy.confirmIntro,
    `${product.name} — ${product.price}`,
    copy.confirmPurpose,
    copy.notice,
    copy.confirmExpiry,
    copy.ignore
  ], { label: copy.confirmAction, url: confirmUrl(input.token) }, [
    { label: copy.withdraw, url: unsubscribe },
    { label: copy.imprint, url: `${appBase()}/imprint` }
  ]);
  return { to: input.to, subject: copy.confirmSubject, ...body, unsubscribeUrl: unsubscribe };
}

export function alreadyConfirmedMail(input: { to: string; leadId: string; type: WaitlistInterestType; language: WaitlistLanguage }): WaitlistMail {
  const copy = COPY[input.language];
  const product = waitlistProduct(input.type, input.language);
  const unsubscribe = unsubscribeUrl(input.leadId);
  const body = layout(input.language, [copy.hello, copy.alreadyIntro, `${product.name} — ${product.price}`, copy.alreadyNothing, copy.notice], null, [
    { label: copy.withdraw, url: unsubscribe },
    { label: copy.imprint, url: `${appBase()}/imprint` }
  ]);
  return { to: input.to, subject: copy.alreadySubject, ...body, unsubscribeUrl: unsubscribe };
}

export function launchMail(input: { to: string; leadId: string; type: WaitlistInterestType; language: WaitlistLanguage }): WaitlistMail {
  const copy = COPY[input.language];
  const product = waitlistProduct(input.type, input.language);
  const unsubscribe = unsubscribeUrl(input.leadId);
  const values = { product: product.name, price: product.price };
  const body = layout(input.language, [copy.hello, fill(copy.launchIntro, values), copy.launchOnce], { label: copy.launchAction, url: appBase() }, [
    { label: copy.withdraw, url: unsubscribe },
    { label: copy.imprint, url: `${appBase()}/imprint` }
  ]);
  return { to: input.to, subject: fill(copy.launchSubject, values), ...body, unsubscribeUrl: unsubscribe };
}

/** Daily confirmed-lead series and shares for the admin view; works on rows without e-mail addresses. */
export type LeadRow = {
  interest_type: WaitlistInterestType;
  preferred_language: string;
  status: 'pending' | 'confirmed' | 'unsubscribed';
  source_page: string;
  created_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  confirm_token_expires_at: string | null;
  person: string | null;
};

export function summarizeLeads(rows: LeadRow[], now = new Date(), days = 30) {
  const dayKey = (value: string) => value.slice(0, 10);
  const since = (count: number) => new Date(now.getTime() - count * 86_400_000).toISOString();
  const confirmed = rows.filter((row) => row.status === 'confirmed');
  const byType = (type: WaitlistInterestType) => confirmed.filter((row) => row.interest_type === type).length;
  const everConfirmed = rows.filter((row) => row.confirmed_at);
  const countBy = (items: LeadRow[], key: (row: LeadRow) => string) => {
    const map = new Map<string, number>();
    for (const item of items) map.set(key(item), (map.get(key(item)) || 0) + 1);
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  };
  const daily: { day: string; client_premium: number; advertiser: number; submitted: number }[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(now.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
    daily.push({ day, client_premium: 0, advertiser: 0, submitted: 0 });
  }
  const index = new Map(daily.map((entry, position) => [entry.day, position]));
  for (const row of rows) {
    const submittedAt = index.get(dayKey(row.created_at));
    if (submittedAt !== undefined) daily[submittedAt].submitted += 1;
    if (row.confirmed_at) {
      const confirmedAt = index.get(dayKey(row.confirmed_at));
      if (confirmedAt !== undefined) daily[confirmedAt][row.interest_type] += 1;
    }
  }
  const pending = rows.filter((row) => row.status === 'pending');
  return {
    confirmed_people: new Set(confirmed.map((row) => row.person).filter(Boolean)).size,
    confirmed_total: confirmed.length,
    confirmed_client_premium: byType('client_premium'),
    confirmed_advertiser: byType('advertiser'),
    pending: pending.length,
    pending_expired: pending.filter((row) => !row.confirm_token_expires_at || row.confirm_token_expires_at < now.toISOString()).length,
    new_confirmed_7d: everConfirmed.filter((row) => (row.confirmed_at as string) >= since(7)).length,
    new_confirmed_30d: everConfirmed.filter((row) => (row.confirmed_at as string) >= since(30)).length,
    submissions: rows.length,
    // Share of submitted records (within the retention window) that were ever confirmed. Null without submissions.
    confirmation_rate: rows.length ? Math.round((everConfirmed.length / rows.length) * 1000) / 10 : null,
    unsubscribed: rows.filter((row) => row.status === 'unsubscribed').length,
    languages: countBy(confirmed, (row) => row.preferred_language),
    sources: countBy(confirmed, (row) => row.source_page),
    submission_sources: countBy(rows, (row) => row.source_page),
    daily
  };
}

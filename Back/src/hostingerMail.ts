/**
 * Hostinger Mail API transport (HTTPS), used where outbound SMTP is blocked (Render FREE).
 * Implemented against the official OpenAPI spec "Hostinger Mail API" 1.3.0
 * (https://api.mail.hostinger.com/openapi/openapi.json):
 *   Authorization: Bearer <token>        (token created in the Hostinger Panel, email provisioning tab; scoped to one order)
 *   POST /api/v1/mailboxes/{mailboxResourceId}/send   body: { to[], subject, text, html, displayName }
 *     204 accepted for delivery (a later delivery failure is not reported on this call)
 *     401 ERR_UNAUTHORIZED · 403 ERR_FORBIDDEN · 422 ERR_VALIDATION_FAILED · 429 rate limit · 500/502/504
 *   GET  /api/v1/me   → { data: { orderResourceId, mailboxes: [{ resourceId, address }] } }
 * The API has no field for custom headers (no List-Unsubscribe header) and no reply-to; the unsubscribe link stays in the body.
 */

export type HostingerMailConfig = {
  baseUrl: string;
  token: string;
  mailboxId: string;
  displayName: string;
  timeoutMs?: number;
};

export type HostingerMailMessage = { to: string; subject: string; text: string; html: string };

/** Error codes the waitlist maps to user-facing answers and delivery records. Never contains the token. */
export type MailErrorCode = 'MAIL_AUTH_FAILED' | 'MAIL_FORBIDDEN' | 'MAIL_REJECTED' | 'MAIL_RATE_LIMITED' | 'MAIL_UNAVAILABLE' | 'MAIL_TIMEOUT' | 'MAIL_NOT_CONFIGURED';

export class MailTransportError extends Error {
  constructor(public readonly code: MailErrorCode, public readonly status: number | null, public readonly retryAfterMs: number | null = null, public readonly providerCode: string | null = null) {
    super(code);
    this.name = 'MailTransportError';
  }
  /**
   * False when the outcome is unknown (timeout, 504): the provider may already have accepted the message,
   * so the caller must not resend immediately (duplicate prevention).
   */
  get notAccepted() {
    return this.code !== 'MAIL_TIMEOUT';
  }
}

const MAILBOX_ID = /^AC[A-Za-z0-9]+$/;

export function isValidMailboxId(value: string) {
  return MAILBOX_ID.test(value);
}

/** HTTPS only, except a loopback URL for local DEV mocks. */
export function isAllowedBaseUrl(value: string, production: boolean) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return !production && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function retryAfter(header: string | null) {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

async function call(config: HostingerMailConfig, method: 'GET' | 'POST', path: string, body?: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 15_000);
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      redirect: 'error'
    });
  } catch (error) {
    // Aborted: the request may have reached the provider, so the outcome is unknown.
    if ((error as Error).name === 'AbortError') throw new MailTransportError('MAIL_TIMEOUT', null);
    // Connection refused / DNS failure: nothing was sent.
    throw new MailTransportError('MAIL_UNAVAILABLE', 0);
  } finally {
    clearTimeout(timer);
  }
  return response;
}

async function failure(response: Response): Promise<never> {
  let providerCode: string | null = null;
  try { providerCode = String((await response.json())?.code || '') || null; } catch { /* not JSON */ }
  const status = response.status;
  if (status === 401) throw new MailTransportError('MAIL_AUTH_FAILED', status, null, providerCode);
  if (status === 403) throw new MailTransportError('MAIL_FORBIDDEN', status, null, providerCode);
  if (status === 422 || status === 400) throw new MailTransportError('MAIL_REJECTED', status, null, providerCode);
  if (status === 429) throw new MailTransportError('MAIL_RATE_LIMITED', status, retryAfter(response.headers.get('retry-after')), providerCode);
  if (status === 504) throw new MailTransportError('MAIL_TIMEOUT', status, null, providerCode);
  throw new MailTransportError('MAIL_UNAVAILABLE', status, null, providerCode);
}

export async function hostingerSend(config: HostingerMailConfig, message: HostingerMailMessage) {
  if (!config.token || !isValidMailboxId(config.mailboxId)) throw new MailTransportError('MAIL_NOT_CONFIGURED', null);
  const response = await call(config, 'POST', `/api/v1/mailboxes/${encodeURIComponent(config.mailboxId)}/send`, {
    to: [message.to],
    displayName: config.displayName || undefined,
    subject: message.subject,
    text: message.text,
    html: message.html
  });
  if (response.status === 204 || response.status === 200 || response.status === 202) return;
  await failure(response);
}

/** Read-only check: is the token valid and does it manage the configured mailbox (and which address is it)? Sends nothing. */
export async function hostingerCheck(config: HostingerMailConfig) {
  if (!config.token) throw new MailTransportError('MAIL_NOT_CONFIGURED', null);
  const response = await call(config, 'GET', '/api/v1/me');
  if (!response.ok) await failure(response);
  const body = await response.json() as { data?: { orderResourceId?: string; mailboxes?: { resourceId: string; address: string }[] } };
  const mailboxes = body.data?.mailboxes || [];
  const mailbox = mailboxes.find((item) => item.resourceId === config.mailboxId) || null;
  return { order_resource_id: body.data?.orderResourceId || null, mailbox_found: Boolean(mailbox), mailbox_address: mailbox?.address || null, mailboxes_visible: mailboxes.length };
}

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

// ER-V1-LEADS-HOSTINGER-MAIL-API-004: Hostinger Mail API transport (OpenAPI 1.3.0) for the interest list.
process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role';
process.env.SUPABASE_ANON_KEY ||= 'test-anon';
const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

type Seen = { method?: string; url?: string; headers: http.IncomingHttpHeaders; body: string };
async function server(respond: (seen: Seen, res: http.ServerResponse) => void) {
  const seen: Seen[] = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => { const entry = { method: req.method, url: req.url, headers: req.headers, body }; seen.push(entry); respond(entry, res); });
  });
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const { port } = srv.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, seen, close: () => new Promise<void>((resolve) => { srv.closeAllConnections(); srv.close(() => resolve()); }) };
}
const message = { to: 'person@example.com', subject: 'Betreff', text: 'Text', html: '<p>Text</p>' };

test('send: documented path, Bearer auth, JSON body with documented fields only, 204 accepted', async () => {
  const { hostingerSend } = await import('../Back/src/hostingerMail.ts');
  const mock = await server((_seen, res) => { res.writeHead(204); res.end(); });
  try {
    await hostingerSend({ baseUrl: mock.url, token: 'tok-123', mailboxId: 'ACabc123', displayName: 'Escort-Radar' }, message);
    const request = mock.seen[0];
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/api/v1/mailboxes/ACabc123/send');
    assert.equal(request.headers.authorization, 'Bearer tok-123');
    assert.match(String(request.headers['content-type']), /^application\/json/);
    const body = JSON.parse(request.body);
    assert.deepEqual(Object.keys(body).sort(), ['displayName', 'html', 'subject', 'text', 'to']);
    assert.deepEqual(body.to, ['person@example.com']);
  } finally {
    await mock.close();
  }
});

test('errors map to transport codes; only timeouts are treated as an unknown outcome', async () => {
  const { hostingerSend, MailTransportError } = await import('../Back/src/hostingerMail.ts');
  const cases: Array<[number, string, boolean, Record<string, string>?]> = [
    [401, 'MAIL_AUTH_FAILED', true], [403, 'MAIL_FORBIDDEN', true], [422, 'MAIL_REJECTED', true],
    [429, 'MAIL_RATE_LIMITED', true, { 'retry-after': '42' }], [500, 'MAIL_UNAVAILABLE', true], [502, 'MAIL_UNAVAILABLE', true], [504, 'MAIL_TIMEOUT', false]
  ];
  for (const [status, code, notAccepted, headers] of cases) {
    const mock = await server((_seen, res) => { res.writeHead(status, { 'content-type': 'application/json', ...(headers || {}) }); res.end(JSON.stringify({ error: 'x', code: 'ERR_X', params: {} })); });
    try {
      await assert.rejects(hostingerSend({ baseUrl: mock.url, token: 't', mailboxId: 'ACabc', displayName: '' }, message), (error: unknown) => {
        assert.ok(error instanceof MailTransportError);
        assert.equal(error.code, code, `HTTP ${status}`);
        assert.equal(error.notAccepted, notAccepted, `HTTP ${status}`);
        assert.equal(error.providerCode, 'ERR_X');
        if (status === 429) assert.equal(error.retryAfterMs, 42_000);
        assert.doesNotMatch(String(error.message), /Bearer|t'/);
        return true;
      });
    } finally {
      await mock.close();
    }
  }
  const silent = await server(() => { /* never answers */ });
  try {
    await assert.rejects(hostingerSend({ baseUrl: silent.url, token: 't', mailboxId: 'ACabc', displayName: '', timeoutMs: 300 }, message), (error: unknown) => error instanceof MailTransportError && error.code === 'MAIL_TIMEOUT' && error.notAccepted === false);
  } finally {
    await silent.close();
  }
  await assert.rejects(hostingerSend({ baseUrl: 'http://127.0.0.1:9', token: 't', mailboxId: 'ACabc', displayName: '' }, message), (error: unknown) => error instanceof MailTransportError && error.code === 'MAIL_UNAVAILABLE' && error.notAccepted === true);
  await assert.rejects(hostingerSend({ baseUrl: 'https://api.mail.hostinger.com', token: '', mailboxId: 'ACabc', displayName: '' }, message), (error: unknown) => error instanceof MailTransportError && error.code === 'MAIL_NOT_CONFIGURED');
});

test('read-only check uses GET /api/v1/me and reports the managed mailbox', async () => {
  const { hostingerCheck } = await import('../Back/src/hostingerMail.ts');
  const mock = await server((_seen, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: { orderResourceId: 'OR1', mailboxes: [{ resourceId: 'ACabc', address: 'kontakt@support.escort-radar.fun' }] } })); });
  try {
    const result = await hostingerCheck({ baseUrl: mock.url, token: 't', mailboxId: 'ACabc', displayName: '' });
    assert.deepEqual(result, { order_resource_id: 'OR1', mailbox_found: true, mailbox_address: 'kontakt@support.escort-radar.fun', mailboxes_visible: 1 });
    assert.equal(mock.seen[0].method, 'GET');
    assert.equal(mock.seen[0].url, '/api/v1/me');
  } finally {
    await mock.close();
  }
});

test('HTTPS only in production; mailbox ids follow the documented AC… format', async () => {
  const { isAllowedBaseUrl, isValidMailboxId } = await import('../Back/src/hostingerMail.ts');
  assert.ok(isAllowedBaseUrl('https://api.mail.hostinger.com', true));
  assert.ok(!isAllowedBaseUrl('http://api.mail.hostinger.com', true));
  assert.ok(!isAllowedBaseUrl('http://127.0.0.1:54390', true));
  assert.ok(isAllowedBaseUrl('http://127.0.0.1:54390', false));
  assert.ok(!isAllowedBaseUrl('http://evil.example', false));
  assert.ok(isValidMailboxId('AC1a2b3c4d5e6f7g'));
  assert.ok(!isValidMailboxId('kontakt@support.escort-radar.fun'));
  assert.ok(!isValidMailboxId('AC1/../x'));
});

test('transport selection: SMTP stays the default; the Hostinger transport needs token, mailbox id and secret', async () => {
  const source = await read('Back/src/config.ts');
  assert.match(source, /waitlistMailTransport: String\(process\.env\.WAITLIST_MAIL_TRANSPORT \|\| 'smtp'\)/);
  assert.match(source, /baseUrl: String\(process\.env\.HOSTINGER_MAIL_API_URL \|\| 'https:\/\/api\.mail\.hostinger\.com'\)/);
  const { config } = await import('../Back/src/config.ts');
  const { waitlistMailConfigured } = await import('../Back/src/waitlist.ts');
  const saved = { transport: config.waitlistMailTransport, mail: { ...config.hostingerMail }, secret: config.waitlistTokenSecret, smtp: { ...config.waitlistSmtp } };
  try {
    config.waitlistMailTransport = 'hostinger_api';
    config.waitlistTokenSecret = 'x'.repeat(40);
    config.waitlistSmtp.host = '';
    config.hostingerMail.baseUrl = 'https://api.mail.hostinger.com';
    config.hostingerMail.token = '';
    config.hostingerMail.mailboxId = 'ACabc';
    assert.equal(waitlistMailConfigured(), false, 'no token');
    config.hostingerMail.token = 'tok';
    config.hostingerMail.mailboxId = 'kontakt@support.escort-radar.fun';
    assert.equal(waitlistMailConfigured(), false, 'mailbox id must be the resource id');
    config.hostingerMail.mailboxId = 'ACabc';
    assert.equal(waitlistMailConfigured(), true);
    config.waitlistTokenSecret = 'short';
    assert.equal(waitlistMailConfigured(), false, 'weak unsubscribe secret');
  } finally {
    config.waitlistMailTransport = saved.transport;
    Object.assign(config.hostingerMail, saved.mail);
    Object.assign(config.waitlistSmtp, saved.smtp);
    config.waitlistTokenSecret = saved.secret;
  }
});

test('credentials stay on the backend: no Hostinger token or env names in the frontend', async () => {
  const files: string[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await walk(path);
      else if (/\.(tsx?|json|css)$/.test(entry.name)) files.push(path);
    }
  }
  await walk('Front/src');
  for (const file of files) assert.doesNotMatch(await read(file), /HOSTINGER_MAIL_API_TOKEN|HOSTINGER_MAIL_MAILBOX_ID|api\.mail\.hostinger\.com/, file);
  const routes = await read('Back/src/routes/waitlist.ts');
  assert.match(routes, /console\.error\('\[waitlist\] confirmation mail failed', \{ code: failure\.code, status: failure\.status, provider: failure\.providerCode \}\)/);
});

test('duplicate prevention and provider back-off are wired into the routes', async () => {
  const routes = await read('Back/src/routes/waitlist.ts');
  const failure = routes.slice(routes.indexOf('const failure = error instanceof MailTransportError'));
  assert.ok(failure.indexOf("if (!failure.notAccepted)") < failure.indexOf(".delete()"), 'unknown outcome keeps the record and cool-down');
  assert.match(failure, /code: 'WAITLIST_MAIL_UNCERTAIN'/);
  assert.match(failure, /code: 'WAITLIST_MAIL_BUSY'/);
  const waitlist = await read('Back/src/waitlist.ts');
  assert.match(waitlist, /if \(providerPausedUntil > Date\.now\(\)\) throw new MailTransportError\('MAIL_RATE_LIMITED'/);
  const leads = await read('Back/src/routes/adminLeads.ts');
  assert.match(leads, /if \(!existing \|\| existing\.status !== 'sending'\) return res\.status\(409\)/);
  assert.match(leads, /adminLeadsRouter\.get\('\/mail-check'/);
});

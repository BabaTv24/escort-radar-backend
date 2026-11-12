// Read-only acceptance check (ER-V1-PUBLIC-PREVIEW-002): scans PUBLIC profile payloads for typed contact details.
// Usage: node scripts/publicContactScan.mjs [https://escort-radar-backend.onrender.com]
// Uses anonymous public endpoints only, writes nothing, and never prints contact values (only counts and short ids).
const API = (process.argv[2] || 'https://escort-radar-backend.onrender.com').replace(/\/+$/, '');
const detector = {
  phone: /(?:\+|00)\s?\d(?:[\s().\-\/]{0,3}\d){7,14}|\b0\d{2,4}[\s\-\/]?\d{5,9}\b/,
  email: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  handle: /(?<![\w.])@[A-Za-z0-9_]{3,}|\b(?:telegram|snapchat|instagram|signal|threema)\s*:\s*[A-Za-z0-9_.]{3,}/i,
  link: /\b(?:t\.me|wa\.me|instagram\.com|snapchat\.com|onlyfans\.com)\//i
};
const contactFields = ['phone', 'primary_phone', 'additional_phones', 'business_phone', 'whatsapp', 'telegram', 'email', 'owner_email', 'exact_address', 'user_id'];
const radar = await (await fetch(`${API}/api/profiles?radar=1`)).json();
const ids = [...new Set((radar.profiles || radar).map((p) => p.id).filter(Boolean))];
const findings = [];
let failed = 0;
const queue = [...ids];
async function worker() {
  while (queue.length) {
    const id = queue.shift();
    const response = await fetch(`${API}/api/profiles/${id}`).catch(() => null);
    if (!response?.ok) { failed += 1; continue; }
    const profile = (await response.json()).profile || {};
    const text = [profile.display_name, profile.description, profile.availability_note].filter(Boolean).join('\n');
    const kinds = Object.entries(detector).filter(([, re]) => re.test(text)).map(([kind]) => kind);
    const fields = contactFields.filter((key) => profile[key] !== undefined && profile[key] !== null && profile[key] !== '' && !(Array.isArray(profile[key]) && !profile[key].length));
    if (kinds.length || fields.length) findings.push({ id: String(id).slice(0, 8), kinds, fields });
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
console.log(JSON.stringify({ api: API, public_profiles: ids.length, failed, profiles_with_contact_exposure: findings.length, findings }, null, 2));
process.exit(findings.length || failed ? 1 : 0);

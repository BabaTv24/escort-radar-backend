export function generatePublicUserId() {
  return `ER-${randomCode(6)}`;
}

export function generateReferralCode() {
  return `ERADAR-${randomCode(6)}`;
}

export function normalizePhone(phone: unknown) {
  return String(phone || '').replace(/[^\d+]/g, '').replace(/^00/, '+').slice(0, 32);
}

function randomCode(length: number) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
}

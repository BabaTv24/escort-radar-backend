import crypto from 'node:crypto';
import { config } from '../config.js';

export type AdminJwtPayload = {
  sub: string;
  email: string;
  role: 'admin';
  admin: true;
  type: 'admin_session';
  iat: number;
  exp: number;
};

const tokenTtlSeconds = 7 * 24 * 60 * 60;

export function signAdminToken(email: string) {
  if (!config.jwtSecret) throw new Error('JWT_SECRET is required for admin login');

  const now = Math.floor(Date.now() / 1000);
  const payload: AdminJwtPayload = {
    sub: email,
    email,
    role: 'admin',
    admin: true,
    type: 'admin_session',
    iat: now,
    exp: now + tokenTtlSeconds
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(`${encodedHeader}.${encodedPayload}`);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyAdminToken(token: string): AdminJwtPayload {
  if (!config.jwtSecret) throw new Error('JWT_SECRET is required for admin auth');

  const [encodedHeader, encodedPayload, signature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !signature) throw new Error('Invalid admin token');

  const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`);
  if (!safeEqual(signature, expectedSignature)) throw new Error('Invalid admin token signature');

  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as AdminJwtPayload;
  if (payload.type !== 'admin_session' || payload.role !== 'admin' || payload.admin !== true) {
    throw new Error('Invalid admin token payload');
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Admin token expired');

  return payload;
}

function sign(value: string) {
  return crypto.createHmac('sha256', config.jwtSecret).update(value).digest('base64url');
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString('base64url');
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

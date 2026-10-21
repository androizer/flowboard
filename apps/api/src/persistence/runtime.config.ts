import crypto from 'node:crypto';
import fs from 'node:fs';

/** Reads runtime settings and requires a signing secret of at least 32 bytes. */
export const config = () => {
  const file = process.env.JWT_SECRET_FILE;
  const secret =
    file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : process.env.JWT_SECRET;
  if (!secret || Buffer.from(secret).length < 32)
    throw new Error('JWT signing material is missing or too short.');
  return {
    secret,
    issuer: process.env.JWT_ISSUER ?? 'flowboard-local',
    audience: process.env.JWT_AUDIENCE ?? 'flowboard-web',
    demoMode: process.env.FLOWBOARD_DEMO_MODE === 'true',
    webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:8080',
  };
};

/** Hashes a refresh token before storage or lookup; the raw token stays with the client. */
export const hashRefresh = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');
/** Creates a random refresh token for a new session or rotation. */
export const createRefreshSecret = () => crypto.randomBytes(32).toString('base64url');

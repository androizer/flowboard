import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { Response } from 'supertest';

const api = request(process.env.API_URL || 'http://localhost:3000');
const db = new PrismaClient();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ids = {
  workspace: id(1),
  alice: id(11),
  bob: id(12),
  carol: id(13),
  engineering: id(21),
  q2: id(22),
  backlog: id(23),
  delivery: id(24),
  security: id(25),
  product: id(26),
  strategy: id(27),
  roadmap: id(28),
  effort: id(201),
  workType: id(202),
  tags: id(203),
  targetDate: id(204),
  customerNote: id(205),
  verified: id(206),
  impact: id(207),
  confidence: id(208),
  firstBacklogTask: id(400),
  firstDeliveryTask: id(406),
  firstSecurityTask: id(412),
  firstRoadmapTask: id(418),
};
const origin = process.env.WEB_ORIGIN || 'http://localhost:8080';

async function reset() {
  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('flowboard_test')) {
    throw new Error('Tests require an isolated flowboard_test database.');
  }
  await db.$executeRawUnsafe('TRUNCATE TABLE workspaces, users, seed_markers CASCADE');
  execFileSync('node_modules/.bin/tsx', ['apps/api/prisma/seed.ts'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'pipe',
    timeout: 30000,
  });
}

async function login(name = 'alice') {
  const response = await api.post('/v1/auth/login').send({
    loginIdentifier: `${name}@flowboard.com`,
    password: 'FlowboardDemo!2026',
  });
  if (response.status !== 201)
    throw new Error(`Login ${name}: ${response.status} ${JSON.stringify(response.body)}`);
  return {
    token: response.body.accessToken,
    cookie: response.headers['set-cookie']?.[0]?.split(';')[0],
    name,
  };
}

function as(actor: { token: string }) {
  const bearer = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) =>
    api[method](path).set('Authorization', `Bearer ${actor.token}`);
  return {
    get: (path) => bearer('get', path),
    post: (path) => bearer('post', path),
    put: (path) => bearer('put', path),
    patch: (path) => bearer('patch', path),
    delete: (path) => bearer('delete', path),
  };
}

function error(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.body).toEqual({
    error: expect.objectContaining({ code, message: expect.any(String) }),
  });
}

export { api, db, id, ids, origin, reset, login, as, error };

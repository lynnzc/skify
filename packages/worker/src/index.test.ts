import { describe, expect, it } from 'vitest';
import app from './index';

type TestEnv = {
  API_TOKEN?: string;
  ALLOW_INSECURE_ADMIN?: string;
  GITHUB_API: string;
};

function createEnv(overrides: Partial<TestEnv> = {}): TestEnv {
  return {
    GITHUB_API: 'https://api.github.com',
    ...overrides,
  };
}

describe('admin auth middleware', () => {
  it('returns 503 when API_TOKEN is missing and insecure mode is disabled', async () => {
    const res = await app.request('/api/admin/ping', { method: 'POST' }, createEnv() as never);

    expect(res.status).toBe(503);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain('API_TOKEN');
  });

  it('allows admin route without token when insecure mode is explicitly enabled', async () => {
    const res = await app.request(
      '/api/admin/ping',
      { method: 'POST' },
      createEnv({ ALLOW_INSECURE_ADMIN: 'true' }) as never
    );

    // Auth middleware passes, then falls through to framework 404.
    expect(res.status).toBe(404);
  });

  it('returns 401 when API_TOKEN exists but auth header is missing', async () => {
    const res = await app.request(
      '/api/admin/ping',
      { method: 'POST' },
      createEnv({ API_TOKEN: 'secret-token' }) as never
    );

    expect(res.status).toBe(401);
  });

  it('returns 401 when API_TOKEN exists but auth header is invalid', async () => {
    const res = await app.request(
      '/api/admin/ping',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-token' },
      },
      createEnv({ API_TOKEN: 'secret-token' }) as never
    );

    expect(res.status).toBe(401);
  });

  it('accepts request when bearer token is valid', async () => {
    const res = await app.request(
      '/api/admin/ping',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer secret-token' },
      },
      createEnv({ API_TOKEN: 'secret-token' }) as never
    );

    // Auth middleware passes, then falls through to framework 404.
    expect(res.status).toBe(404);
  });
});

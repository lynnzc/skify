import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Permission = 'read' | 'publish' | 'admin';

type Bindings = {
  DB: D1Database;
  SKILLS: R2Bucket;
  GITHUB_API: string;
  API_TOKEN?: string;
  ALLOW_INSECURE_ADMIN?: string;
  ALLOW_ANONYMOUS_READ?: string;
};

type TokenRecord = {
  id: string;
  name: string;
  permissions: string;
  created_at?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors());

app.get('/api/health', (c) => c.json({ status: 'ok' }));

function parsePermissions(input: unknown): Permission[] {
  if (!Array.isArray(input)) return [];
  const allowed: Permission[] = ['read', 'publish', 'admin'];
  return input.filter((v): v is Permission => typeof v === 'string' && allowed.includes(v as Permission));
}

function expandPermissions(perms: Permission[]): Set<Permission> {
  const set = new Set<Permission>(perms);
  if (set.has('admin')) {
    set.add('publish');
    set.add('read');
  }
  if (set.has('publish')) {
    set.add('read');
  }
  return set;
}

function hasPermission(granted: Set<Permission>, required: Permission): boolean {
  return granted.has(required);
}

function extractBearerToken(c: { req: { header: (key: string) => string | undefined } }): string | null {
  const auth = c.req.header('Authorization');
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `sk_${raw}`;
}

async function resolvePermissions(c: { env: Bindings; req: { header: (key: string) => string | undefined } }): Promise<Set<Permission>> {
  const token = extractBearerToken(c);

  if (!token) {
    if (c.env.ALLOW_INSECURE_ADMIN === 'true') {
      return expandPermissions(['admin']);
    }
    return new Set<Permission>();
  }

  if (c.env.API_TOKEN && token === c.env.API_TOKEN) {
    return expandPermissions(['admin']);
  }

  if (!c.env.DB) {
    return new Set<Permission>();
  }

  const keyHash = await sha256Hex(token);
  const record = await c.env.DB.prepare('SELECT id, name, permissions, created_at FROM api_keys WHERE key_hash = ?')
    .bind(keyHash)
    .first<TokenRecord>();

  if (!record) {
    return new Set<Permission>();
  }

  try {
    const parsed = parsePermissions(JSON.parse(record.permissions || '[]'));
    return expandPermissions(parsed);
  } catch {
    return new Set<Permission>();
  }
}

function requirePermission(required: Permission) {
  return async (c: { env: Bindings; req: { header: (key: string) => string | undefined; path: string }; json: (body: unknown, status?: number) => Response }, next: () => Promise<void>) => {
    const allowAnonymousRead = c.env.ALLOW_ANONYMOUS_READ !== 'false';
    if (required === 'read' && allowAnonymousRead && !c.req.path.startsWith('/api/admin/') && !extractBearerToken(c)) {
      await next();
      return;
    }

    const perms = await resolvePermissions(c);
    if (!hasPermission(perms, required)) {
      return c.json({ error: 'Unauthorized', requiredPermission: required }, 401);
    }

    await next();
  };
}

app.get('/api/skills', requirePermission('read'), async (c) => {
  const { q, page = '1', limit = '20', sort = 'installs' } = c.req.query();
  const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  let query = 'SELECT id, owner, repo, name, description, tags, stars, installs, updated_at FROM skills';
  const params: (string | number)[] = [];

  if (q) {
    query += ' WHERE name LIKE ? OR description LIKE ?';
    params.push(`%${q}%`, `%${q}%`);
  }

  const sortColumn = sort === 'stars' ? 'stars' : 'installs';
  query += ` ORDER BY ${sortColumn} DESC LIMIT ? OFFSET ?`;
  params.push(limitNum, offset);

  const result = await c.env.DB.prepare(query).bind(...params).all();

  const skills =
    result.results?.map((row: Record<string, unknown>) => ({
      ...row,
      tags: JSON.parse((row.tags as string) || '[]'),
    })) || [];

  return c.json({ skills, page: pageNum, limit: limitNum });
});

app.get('/api/skills/:owner/:repo/:skill', requirePermission('read'), async (c) => {
  const { owner, repo, skill } = c.req.param();
  const id = `${owner}/${repo}/${skill}`;

  const result = await c.env.DB.prepare('SELECT * FROM skills WHERE id = ?').bind(id).first();

  if (!result) {
    return c.json({ error: 'Skill not found' }, 404);
  }

  return c.json({
    ...result,
    tags: JSON.parse((result.tags as string) || '[]'),
  });
});

app.get('/api/download/:owner/:repo/:skill', requirePermission('read'), async (c) => {
  const { owner, repo, skill } = c.req.param();
  const prefix = `${owner}/${repo}/${skill}/`;

  const list = await c.env.SKILLS.list({ prefix });
  const files: Record<string, string> = {};

  for (const obj of list.objects) {
    const content = await c.env.SKILLS.get(obj.key);
    if (content) {
      files[obj.key.replace(prefix, '')] = await content.text();
    }
  }

  if (Object.keys(files).length === 0) {
    return c.json({ error: 'Skill files not found' }, 404);
  }

  return c.json({ files });
});

app.post('/api/skills/:owner/:repo/:skill/install', requirePermission('read'), async (c) => {
  const { owner, repo, skill } = c.req.param();
  const id = `${owner}/${repo}/${skill}`;

  await c.env.DB.prepare('UPDATE skills SET installs = installs + 1 WHERE id = ?').bind(id).run();

  return c.json({ ok: true });
});

const adminRoutes = new Hono<{ Bindings: Bindings }>();
app.use('/api/admin/*', requirePermission('read'));

adminRoutes.post('/skills', requirePermission('publish'), async (c) => {
  const body = await c.req.json<{
    owner: string;
    repo: string;
    name: string;
    description?: string;
    tags?: string[];
    content: string;
  }>();

  if (!body.owner || !body.repo || !body.name || !body.content) {
    return c.json({ error: 'owner, repo, name, content are required' }, 400);
  }

  const id = `${body.owner}/${body.repo}/${body.name}`;

  await c.env.SKILLS.put(`${id}/SKILL.md`, body.content);

  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO skills (id, owner, repo, name, description, tags, content, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `)
    .bind(
      id,
      body.owner,
      body.repo,
      body.name,
      body.description || '',
      JSON.stringify(body.tags || []),
      body.content
    )
    .run();

  return c.json({ ok: true, id });
});

adminRoutes.delete('/skills/:owner/:repo/:skill', requirePermission('admin'), async (c) => {
  const { owner, repo, skill } = c.req.param();
  const id = `${owner}/${repo}/${skill}`;

  const prefix = `${id}/`;
  const list = await c.env.SKILLS.list({ prefix });
  for (const obj of list.objects) {
    await c.env.SKILLS.delete(obj.key);
  }

  await c.env.DB.prepare('DELETE FROM skills WHERE id = ?').bind(id).run();

  return c.json({ ok: true });
});

adminRoutes.post('/sync-github', requirePermission('admin'), async (c) => {
  const body = await c.req.json<{ repo: string; path?: string }>();
  const { repo, path = 'skills' } = body;

  if (!repo) {
    return c.json({ error: 'repo is required' }, 400);
  }

  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'skills-hub',
  };
  const repoMetaRes = await fetch(`${c.env.GITHUB_API}/repos/${repo}`, { headers });
  const repoMeta = repoMetaRes.ok ? ((await repoMetaRes.json()) as { default_branch?: string }) : null;
  const defaultBranch = repoMeta?.default_branch || 'main';

  const listUrl = `${c.env.GITHUB_API}/repos/${repo}/contents/${path}`;
  const listRes = await fetch(listUrl, { headers });

  if (!listRes.ok) {
    return c.json({ error: 'Failed to fetch repo' }, 400);
  }

  const contents = (await listRes.json()) as Array<{ type: string; name: string }>;
  const skillDirs = contents.filter((item) => item.type === 'dir');

  let synced = 0;
  for (const dir of skillDirs) {
    const skillMdUrl = `https://raw.githubusercontent.com/${repo}/${defaultBranch}/${path}/${dir.name}/SKILL.md`;
    const skillRes = await fetch(skillMdUrl);
    if (!skillRes.ok) continue;

    const content = await skillRes.text();
    const [owner, repoName] = repo.split('/');
    const id = `${owner}/${repoName}/${dir.name}`;

    await c.env.SKILLS.put(`${id}/SKILL.md`, content);
    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO skills (id, owner, repo, name, content, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `)
      .bind(id, owner, repoName, dir.name, content)
      .run();

    synced++;
  }

  return c.json({ ok: true, synced });
});

adminRoutes.post('/tokens', requirePermission('admin'), async (c) => {
  const body = await c.req.json<{ name?: string; permissions?: Permission[] }>();
  const name = (body.name || '').trim();
  const permissions = expandPermissions(parsePermissions(body.permissions || ['read']));

  if (!name) {
    return c.json({ error: 'name is required' }, 400);
  }

  if (permissions.size === 0) {
    return c.json({ error: 'at least one valid permission is required' }, 400);
  }

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const id = crypto.randomUUID();
  const permissionList = Array.from(permissions);

  await c.env.DB.prepare(
    'INSERT INTO api_keys (id, name, key_hash, permissions, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))'
  )
    .bind(id, name, tokenHash, JSON.stringify(permissionList))
    .run();

  return c.json({
    ok: true,
    token: {
      id,
      name,
      permissions: permissionList,
      value: token,
    },
  });
});

adminRoutes.get('/tokens', requirePermission('admin'), async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT id, name, permissions, created_at FROM api_keys ORDER BY created_at DESC'
  ).all<TokenRecord>();

  const tokens = (result.results || []).map((row) => {
    let permissions: Permission[] = [];
    try {
      permissions = parsePermissions(JSON.parse(row.permissions || '[]'));
    } catch {
      permissions = [];
    }
    return {
      id: row.id,
      name: row.name,
      permissions,
      createdAt: row.created_at,
    };
  });

  return c.json({ tokens });
});

adminRoutes.post('/tokens/:id/revoke', requirePermission('admin'), async (c) => {
  const { id } = c.req.param();
  const result = await c.env.DB.prepare('DELETE FROM api_keys WHERE id = ?').bind(id).run();

  if (!result.success || (result.meta.changes || 0) === 0) {
    return c.json({ error: 'Token not found' }, 404);
  }

  return c.json({ ok: true, revokedId: id });
});

app.route('/api/admin', adminRoutes);

export default app;

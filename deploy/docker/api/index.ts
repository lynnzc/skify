import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import Database from 'better-sqlite3';
import { mkdir, readFile, writeFile, readdir, rm } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { createHash, randomBytes, randomUUID } from 'crypto';

type Permission = 'read' | 'publish' | 'admin';

type TokenRow = {
  id: string;
  name: string;
  permissions: string;
  created_at?: string;
};

const DATA_DIR = process.env.DATA_DIR || '/data';
const DB_PATH = join(DATA_DIR, 'skills.db');
const SKILLS_DIR = join(DATA_DIR, 'skills');
const API_TOKEN = process.env.API_TOKEN;
const PORT = Number.parseInt(process.env.PORT || '8787', 10);
const ALLOW_INSECURE_ADMIN = process.env.ALLOW_INSECURE_ADMIN === 'true';
const ALLOW_ANONYMOUS_READ = process.env.ALLOW_ANONYMOUS_READ !== 'false';

await mkdir(SKILLS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    content TEXT,
    stars INTEGER DEFAULT 0,
    installs INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    permissions TEXT DEFAULT '["read"]',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
`);

const app = new Hono();

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

function extractBearerToken(auth?: string | null): string | null {
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function randomToken(): string {
  return `sk_${randomBytes(24).toString('hex')}`;
}

function resolvePermissions(token: string | null): Set<Permission> {
  if (!token) {
    if (ALLOW_INSECURE_ADMIN) {
      return expandPermissions(['admin']);
    }
    return new Set<Permission>();
  }

  if (API_TOKEN && token === API_TOKEN) {
    return expandPermissions(['admin']);
  }

  const tokenHash = sha256Hex(token);
  const row = db
    .prepare('SELECT id, name, permissions, created_at FROM api_keys WHERE key_hash = ?')
    .get(tokenHash) as TokenRow | undefined;

  if (!row) {
    return new Set<Permission>();
  }

  try {
    return expandPermissions(parsePermissions(JSON.parse(row.permissions || '[]')));
  } catch {
    return new Set<Permission>();
  }
}

function requirePermission(required: Permission) {
  return async (c: { req: { header: (key: string) => string | undefined; path: string }; json: (body: unknown, status?: number) => Response }, next: () => Promise<void>) => {
    const token = extractBearerToken(c.req.header('Authorization'));
    if (required === 'read' && ALLOW_ANONYMOUS_READ && !c.req.path.startsWith('/api/admin/') && !token) {
      await next();
      return;
    }

    const perms = resolvePermissions(token);
    if (!hasPermission(perms, required)) {
      return c.json({ error: 'Unauthorized', requiredPermission: required }, 401);
    }

    await next();
  };
}

app.get('/api/skills', requirePermission('read'), (c) => {
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

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as Record<string, unknown>[];

  const skills = rows.map((row) => ({
    ...row,
    tags: JSON.parse((row.tags as string) || '[]'),
  }));

  return c.json({ skills, page: pageNum, limit: limitNum });
});

app.get('/api/skills/:owner/:repo/:skill', requirePermission('read'), (c) => {
  const { owner, repo, skill } = c.req.param();
  const id = `${owner}/${repo}/${skill}`;

  const stmt = db.prepare('SELECT * FROM skills WHERE id = ?');
  const row = stmt.get(id) as Record<string, unknown> | undefined;

  if (!row) {
    return c.json({ error: 'Skill not found' }, 404);
  }

  return c.json({
    ...row,
    tags: JSON.parse((row.tags as string) || '[]'),
  });
});

app.get('/api/download/:owner/:repo/:skill', requirePermission('read'), async (c) => {
  const { owner, repo, skill } = c.req.param();
  const skillDir = join(SKILLS_DIR, owner, repo, skill);

  if (!existsSync(skillDir)) {
    return c.json({ error: 'Skill files not found' }, 404);
  }

  const files: Record<string, string> = {};

  async function readDir(dir: string, prefix = '') {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await readDir(fullPath, relativePath);
      } else {
        files[relativePath] = await readFile(fullPath, 'utf-8');
      }
    }
  }

  await readDir(skillDir);
  return c.json({ files });
});

app.post('/api/skills/:owner/:repo/:skill/install', requirePermission('read'), (c) => {
  const { owner, repo, skill } = c.req.param();
  const id = `${owner}/${repo}/${skill}`;

  db.prepare('UPDATE skills SET installs = installs + 1 WHERE id = ?').run(id);
  return c.json({ ok: true });
});

app.use('/api/admin/*', requirePermission('read'));

app.post('/api/admin/skills', requirePermission('publish'), async (c) => {
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
  const skillDir = join(SKILLS_DIR, body.owner, body.repo, body.name);

  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, 'SKILL.md'), body.content);

  db.prepare(`
    INSERT OR REPLACE INTO skills (id, owner, repo, name, description, tags, content, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    id,
    body.owner,
    body.repo,
    body.name,
    body.description || '',
    JSON.stringify(body.tags || []),
    body.content
  );

  return c.json({ ok: true, id });
});

app.delete('/api/admin/skills/:owner/:repo/:skill', requirePermission('admin'), async (c) => {
  const { owner, repo, skill } = c.req.param();
  const id = `${owner}/${repo}/${skill}`;
  const skillDir = join(SKILLS_DIR, owner, repo, skill);

  if (existsSync(skillDir)) {
    await rm(skillDir, { recursive: true });
  }

  db.prepare('DELETE FROM skills WHERE id = ?').run(id);
  return c.json({ ok: true });
});

app.post('/api/admin/sync-github', requirePermission('admin'), async (c) => {
  const body = await c.req.json<{ repo: string; path?: string }>();
  const { repo, path = 'skills' } = body;

  if (!repo) {
    return c.json({ error: 'repo is required' }, 400);
  }

  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'skills-hub',
  };
  const repoMetaRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
  const repoMeta = repoMetaRes.ok ? ((await repoMetaRes.json()) as { default_branch?: string }) : null;
  const defaultBranch = repoMeta?.default_branch || 'main';

  const listUrl = `https://api.github.com/repos/${repo}/contents/${path}`;
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
    const skillDir = join(SKILLS_DIR, owner, repoName, dir.name);

    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), content);

    db.prepare(`
      INSERT OR REPLACE INTO skills (id, owner, repo, name, content, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(id, owner, repoName, dir.name, content);

    synced++;
  }

  return c.json({ ok: true, synced });
});

app.post('/api/admin/tokens', requirePermission('admin'), async (c) => {
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
  const tokenHash = sha256Hex(token);
  const id = randomUUID();

  db.prepare('INSERT INTO api_keys (id, name, key_hash, permissions, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))').run(
    id,
    name,
    tokenHash,
    JSON.stringify(Array.from(permissions))
  );

  return c.json({
    ok: true,
    token: {
      id,
      name,
      permissions: Array.from(permissions),
      value: token,
    },
  });
});

app.get('/api/admin/tokens', requirePermission('admin'), (c) => {
  const rows = db
    .prepare('SELECT id, name, permissions, created_at FROM api_keys ORDER BY created_at DESC')
    .all() as TokenRow[];

  const tokens = rows.map((row) => {
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

app.post('/api/admin/tokens/:id/revoke', requirePermission('admin'), (c) => {
  const { id } = c.req.param();
  const result = db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);

  if (!result.changes) {
    return c.json({ error: 'Token not found' }, 404);
  }

  return c.json({ ok: true, revokedId: id });
});

console.log(`Server running on http://localhost:${PORT}`);
serve({ fetch: app.fetch, port: PORT });

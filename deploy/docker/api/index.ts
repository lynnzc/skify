import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bearerAuth } from 'hono/bearer-auth';
import { serve } from '@hono/node-server';
import Database from 'better-sqlite3';
import { mkdir, readFile, writeFile, readdir, rm } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

const DATA_DIR = process.env.DATA_DIR || '/data';
const DB_PATH = join(DATA_DIR, 'skills.db');
const SKILLS_DIR = join(DATA_DIR, 'skills');
const API_TOKEN = process.env.API_TOKEN;
const PORT = parseInt(process.env.PORT || '8787');

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
`);

const app = new Hono();

app.use('*', cors());

app.get('/api/health', (c) => c.json({ status: 'ok' }));

app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/health') return next();
  if (!API_TOKEN) return next();
  return bearerAuth({ token: API_TOKEN })(c, next);
});

app.get('/api/skills', (c) => {
  const { q, page = '1', limit = '20', sort = 'installs' } = c.req.query();
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let query = 'SELECT id, owner, repo, name, description, tags, stars, installs, updated_at FROM skills';
  const params: (string | number)[] = [];

  if (q) {
    query += ' WHERE name LIKE ? OR description LIKE ?';
    params.push(`%${q}%`, `%${q}%`);
  }

  const sortColumn = sort === 'stars' ? 'stars' : 'installs';
  query += ` ORDER BY ${sortColumn} DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as Record<string, unknown>[];

  const skills = rows.map((row) => ({
    ...row,
    tags: JSON.parse((row.tags as string) || '[]'),
  }));

  return c.json({ skills, page: parseInt(page), limit: parseInt(limit) });
});

app.get('/api/skills/:owner/:repo/:skill', (c) => {
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

app.get('/api/download/:owner/:repo/:skill', async (c) => {
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

app.post('/api/skills/:owner/:repo/:skill/install', (c) => {
  const { owner, repo, skill } = c.req.param();
  const id = `${owner}/${repo}/${skill}`;

  db.prepare('UPDATE skills SET installs = installs + 1 WHERE id = ?').run(id);
  return c.json({ ok: true });
});

app.post('/api/admin/skills', async (c) => {
  const body = await c.req.json<{
    owner: string;
    repo: string;
    name: string;
    description?: string;
    tags?: string[];
    content: string;
  }>();

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

app.delete('/api/admin/skills/:owner/:repo/:skill', async (c) => {
  const { owner, repo, skill } = c.req.param();
  const id = `${owner}/${repo}/${skill}`;
  const skillDir = join(SKILLS_DIR, owner, repo, skill);

  if (existsSync(skillDir)) {
    await rm(skillDir, { recursive: true });
  }

  db.prepare('DELETE FROM skills WHERE id = ?').run(id);
  return c.json({ ok: true });
});

console.log(`Server running on http://localhost:${PORT}`);
serve({ fetch: app.fetch, port: PORT });

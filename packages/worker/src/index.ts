import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bearerAuth } from 'hono/bearer-auth';

type Bindings = {
  DB: D1Database;
  SKILLS: R2Bucket;
  GITHUB_API: string;
  API_TOKEN?: string;
  ALLOW_INSECURE_ADMIN?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors());

app.get('/api/health', (c) => c.json({ status: 'ok' }));

app.use('/api/admin/*', async (c, next) => {
  const token = c.env.API_TOKEN;
  if (!token) {
    if (c.env.ALLOW_INSECURE_ADMIN === 'true') {
      return next();
    }
    return c.json({ error: 'Admin API is disabled: API_TOKEN is not configured' }, 503);
  }
  return bearerAuth({ token })(c, next);
});

app.get('/api/skills', async (c) => {
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

  const result = await c.env.DB.prepare(query).bind(...params).all();
  
  const skills = result.results?.map((row: Record<string, unknown>) => ({
    ...row,
    tags: JSON.parse((row.tags as string) || '[]'),
  })) || [];

  return c.json({ skills, page: parseInt(page), limit: parseInt(limit) });
});

app.get('/api/skills/:owner/:repo/:skill', async (c) => {
  const { owner, repo, skill } = c.req.param();
  const id = `${owner}/${repo}/${skill}`;

  const result = await c.env.DB.prepare(
    'SELECT * FROM skills WHERE id = ?'
  ).bind(id).first();

  if (!result) {
    return c.json({ error: 'Skill not found' }, 404);
  }

  return c.json({
    ...result,
    tags: JSON.parse((result.tags as string) || '[]'),
  });
});

app.get('/api/download/:owner/:repo/:skill', async (c) => {
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

app.post('/api/skills/:owner/:repo/:skill/install', async (c) => {
  const { owner, repo, skill } = c.req.param();
  const id = `${owner}/${repo}/${skill}`;

  await c.env.DB.prepare(
    'UPDATE skills SET installs = installs + 1 WHERE id = ?'
  ).bind(id).run();

  return c.json({ ok: true });
});

const adminRoutes = new Hono<{ Bindings: Bindings }>();

adminRoutes.post('/skills', async (c) => {
  const body = await c.req.json<{
    owner: string;
    repo: string;
    name: string;
    description?: string;
    tags?: string[];
    content: string;
  }>();

  const id = `${body.owner}/${body.repo}/${body.name}`;

  await c.env.SKILLS.put(`${id}/SKILL.md`, body.content);

  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO skills (id, owner, repo, name, description, tags, content, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    id,
    body.owner,
    body.repo,
    body.name,
    body.description || '',
    JSON.stringify(body.tags || []),
    body.content
  ).run();

  return c.json({ ok: true, id });
});

adminRoutes.delete('/skills/:owner/:repo/:skill', async (c) => {
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

adminRoutes.post('/sync-github', async (c) => {
  const body = await c.req.json<{ repo: string; path?: string }>();
  const { repo, path = 'skills' } = body;

  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'skills-hub',
  };

  const listUrl = `${c.env.GITHUB_API}/repos/${repo}/contents/${path}`;
  const listRes = await fetch(listUrl, { headers });

  if (!listRes.ok) {
    return c.json({ error: 'Failed to fetch repo' }, 400);
  }

  const contents = await listRes.json() as Array<{ type: string; name: string }>;
  const skillDirs = contents.filter((item) => item.type === 'dir');

  let synced = 0;
  for (const dir of skillDirs) {
    const skillMdUrl = `https://raw.githubusercontent.com/${repo}/main/${path}/${dir.name}/SKILL.md`;
    const skillRes = await fetch(skillMdUrl);
    if (!skillRes.ok) continue;

    const content = await skillRes.text();
    const [owner, repoName] = repo.split('/');
    const id = `${owner}/${repoName}/${dir.name}`;

    await c.env.SKILLS.put(`${id}/SKILL.md`, content);
    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO skills (id, owner, repo, name, content, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(id, owner, repoName, dir.name, content).run();

    synced++;
  }

  return c.json({ ok: true, synced });
});

app.route('/api/admin', adminRoutes);

export default app;

import type { Skill, SkillIndex } from './types.js';
import { parseSkillMd } from './parser.js';

const SKILLS_TOPIC = 'agent-skills';
const GITHUB_API = 'https://api.github.com';

interface GitHubSearchResult {
  items: Array<{
    full_name: string;
    name: string;
    description: string;
    stargazers_count: number;
    html_url: string;
    updated_at: string;
  }>;
}

export async function searchSkillRepos(
  query: string,
  token?: string
): Promise<SkillIndex[]> {
  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `${GITHUB_API}/search/repositories?q=${encodeURIComponent(query)}+topic:${SKILLS_TOPIC}&sort=stars&per_page=50`;
  const res = await fetch(url, { headers });
  
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status}`);
  }

  const data = (await res.json()) as GitHubSearchResult;

  return data.items.map((repo) => ({
    id: repo.full_name,
    repo: repo.full_name,
    name: repo.name,
    description: repo.description || '',
    tags: [],
    stars: repo.stargazers_count,
    installs: 0,
    updatedAt: repo.updated_at,
  }));
}

export async function listSkillsInRepo(
  repo: string,
  token?: string,
  skillsPath = 'skills'
): Promise<string[]> {
  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const effectivePath = skillsPath === '.' || skillsPath === '' ? '' : skillsPath;
  const url = effectivePath 
    ? `${GITHUB_API}/repos/${repo}/contents/${effectivePath}`
    : `${GITHUB_API}/repos/${repo}/contents`;
  const res = await fetch(url, { headers });

  if (!res.ok) {
    if (res.status === 404) {
      const rootRes = await fetch(`${GITHUB_API}/repos/${repo}/contents`, { headers });
      if (rootRes.ok) {
        const rootContents = await rootRes.json();
        const hasSkillMd = rootContents.some(
          (item: { name: string }) => item.name === 'SKILL.md'
        );
        if (hasSkillMd) {
          return [repo.split('/').pop() || 'skill'];
        }
      }
      return [];
    }
    throw new Error(`GitHub API error: ${res.status}`);
  }

  const contents = await res.json();
  return contents
    .filter((item: { type: string }) => item.type === 'dir')
    .map((item: { name: string }) => item.name);
}

export async function getSkillContent(
  repo: string,
  skillName?: string,
  skillsPath = 'skills',
  token?: string
): Promise<Skill> {
  const effectivePath = skillsPath === '.' || skillsPath === '' ? '' : skillsPath;
  const path = skillName 
    ? (effectivePath ? `${effectivePath}/${skillName}/SKILL.md` : `${skillName}/SKILL.md`)
    : 'SKILL.md';
  const rawUrl = `https://raw.githubusercontent.com/${repo}/main/${path}`;

  const headers: HeadersInit = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(rawUrl, { headers });
  if (!res.ok) {
    const headRes = await fetch(rawUrl.replace('/main/', '/master/'), { headers });
    if (!headRes.ok) {
      throw new Error(`SKILL.md not found in ${repo}/${path}`);
    }
    const content = await headRes.text();
    const meta = parseSkillMd(content);
    return {
      ...meta,
      repo,
      path,
      content,
    };
  }

  const content = await res.text();
  const meta = parseSkillMd(content);
  return {
    ...meta,
    repo,
    path,
    content,
  };
}

export async function downloadSkillFiles(
  repo: string,
  skillName?: string,
  skillsPath = 'skills',
  token?: string
): Promise<Record<string, string>> {
  const effectivePath = skillsPath === '.' || skillsPath === '' ? '' : skillsPath;
  const basePath = skillName 
    ? (effectivePath ? `${effectivePath}/${skillName}` : skillName)
    : '';
  const files: Record<string, string> = {};

  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const textExtensions = ['.md', '.txt', '.json', '.yaml', '.yml', '.ts', '.js', '.py', '.sh', '.toml', '.xml', '.html', '.css'];

  async function collectFiles(path: string): Promise<Array<{ path: string; url: string }>> {
    const url = `${GITHUB_API}/repos/${repo}/contents/${path}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`GitHub API error (${res.status}): Failed to fetch ${path}. ${errorText}`);
    }

    const contents = await res.json();
    const fileList: Array<{ path: string; url: string }> = [];

    for (const item of contents) {
      if (item.type === 'file') {
        if (textExtensions.some(e => item.name.endsWith(e)) || item.name === 'SKILL.md') {
          fileList.push({ path: item.path, url: item.download_url });
        }
      } else if (item.type === 'dir') {
        const subFiles = await collectFiles(item.path);
        fileList.push(...subFiles);
      }
    }
    return fileList;
  }

  const fileList = await collectFiles(basePath);

  if (fileList.length === 0) {
    throw new Error(`No downloadable files found in ${repo}/${basePath}`);
  }

  const downloads = await Promise.all(
    fileList.map(async ({ path, url }) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to download ${path}: ${res.status}`);
      }
      const content = await res.text();
      const relativePath = basePath ? path.replace(`${basePath}/`, '') : path;
      return { path: relativePath, content };
    })
  );

  for (const item of downloads) {
    files[item.path] = item.content;
  }

  if (Object.keys(files).length === 0) {
    throw new Error(`No files were downloaded from ${repo}/${basePath}`);
  }

  return files;
}

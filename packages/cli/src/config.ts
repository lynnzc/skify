import Conf from 'conf';
import { homedir } from 'os';
import { join } from 'path';

interface Config {
  registry?: string;
  token?: string;
  githubToken?: string;
  defaultTarget: 'cursor' | 'claude' | 'project';
}

const config = new Conf<Config>({
  projectName: 'skit',
  defaults: {
    defaultTarget: 'project',
  },
});

export function getConfig(): Config {
  return {
    registry: config.get('registry'),
    token: config.get('token'),
    githubToken: config.get('githubToken'),
    defaultTarget: config.get('defaultTarget'),
  };
}

export function setConfig(key: keyof Config, value: string) {
  config.set(key, value);
}

export function getTargetDir(
  target: 'cursor' | 'claude' | 'project',
  skillName: string,
  global = false
): string {
  const home = homedir();

  if (global) {
    const dirs = {
      cursor: join(home, '.cursor', 'skills', skillName),
      claude: join(home, '.claude', 'skills', skillName),
      project: join(home, '.agent', 'skills', skillName),
    };
    return dirs[target];
  }

  const dirs = {
    cursor: join(process.cwd(), '.cursor', 'skills', skillName),
    claude: join(process.cwd(), '.claude', 'skills', skillName),
    project: join(process.cwd(), '.agent', 'skills', skillName),
  };
  return dirs[target];
}

import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import type { LockFile, InstalledSkill } from '@skify/core';
import { getTargetDir } from './config.js';

const LOCK_FILE = 'skify.lock.json';

export async function getLockFilePath(target: 'cursor' | 'claude' | 'project', global: boolean): Promise<string> {
  const skillsDir = dirname(getTargetDir(target, 'dummy', global));
  return join(dirname(skillsDir), LOCK_FILE);
}

export async function readLockFile(lockPath: string): Promise<LockFile> {
  try {
    const content = await readFile(lockPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { version: 1, skills: {} };
  }
}

export async function writeLockFile(lockPath: string, lock: LockFile): Promise<void> {
  await writeFile(lockPath, JSON.stringify(lock, null, 2));
}

export async function recordInstall(
  target: 'cursor' | 'claude' | 'project',
  global: boolean,
  skillName: string,
  source: string,
  version?: string,
  commit?: string
): Promise<void> {
  const lockPath = await getLockFilePath(target, global);
  const lock = await readLockFile(lockPath);
  
  const now = new Date().toISOString();
  const existing = lock.skills[skillName];
  
  lock.skills[skillName] = {
    name: skillName,
    source,
    version,
    commit,
    installedAt: existing?.installedAt || now,
    updatedAt: now,
  };
  
  await writeLockFile(lockPath, lock);
}

export async function removeFromLock(
  target: 'cursor' | 'claude' | 'project',
  global: boolean,
  skillName: string
): Promise<void> {
  const lockPath = await getLockFilePath(target, global);
  const lock = await readLockFile(lockPath);
  delete lock.skills[skillName];
  await writeLockFile(lockPath, lock);
}

export async function getInstalledSkill(
  target: 'cursor' | 'claude' | 'project',
  global: boolean,
  skillName: string
): Promise<InstalledSkill | undefined> {
  const lockPath = await getLockFilePath(target, global);
  const lock = await readLockFile(lockPath);
  return lock.skills[skillName];
}

export async function getAllInstalled(
  target: 'cursor' | 'claude' | 'project',
  global: boolean
): Promise<Record<string, InstalledSkill>> {
  const lockPath = await getLockFilePath(target, global);
  const lock = await readLockFile(lockPath);
  return lock.skills;
}

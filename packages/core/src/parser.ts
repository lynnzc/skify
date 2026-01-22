import matter from 'gray-matter';
import type { SkillMeta } from './types.js';

export function parseSkillMd(content: string): SkillMeta & { body: string } {
  const { data, content: body } = matter(content);
  
  return {
    name: data.name || 'unnamed',
    description: data.description || '',
    tags: data.tags || [],
    author: data.author,
    version: data.version,
    body: body.trim(),
  };
}

export function generateAgentsMd(skills: SkillMeta[]): string {
  const skillsXml = skills
    .map(
      (s) => `<skill>
<name>${s.name}</name>
<description>${s.description}</description>
<location>project</location>
</skill>`
    )
    .join('\n\n');

  return `<skills_system priority="1">

## Available Skills

<!-- SKILLS_TABLE_START -->
<usage>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively.

How to use skills:
- Invoke: \`npx skify read <skill-name>\` (run in your shell)
- The skill content will load with detailed instructions
- Base directory provided in output for resolving bundled resources

Usage notes:
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context
</usage>

<available_skills>

${skillsXml}

</available_skills>
<!-- SKILLS_TABLE_END -->

</skills_system>`;
}

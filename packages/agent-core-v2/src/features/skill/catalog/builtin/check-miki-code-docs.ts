import type { SkillDefinition } from '#/features/skill/catalog/types';
import { parseSkillText } from '#/features/skill/catalog/parser';
import CHECK_MIKI_CODE_DOCS_BODY from './check-miki-code-docs.md?raw';

const PSEUDO_PATH = 'builtin://check-miki-code-docs';

const parsed = parseSkillText({
  skillMdPath: '/builtin/skills/check-miki-code-docs.md',
  skillDirName: 'check-miki-code-docs',
  source: 'builtin',
  text: CHECK_MIKI_CODE_DOCS_BODY,
});

export const CHECK_MIKI_CODE_DOCS_SKILL: SkillDefinition = {
  ...parsed,
  path: PSEUDO_PATH,
  dir: PSEUDO_PATH,
  metadata: {
    ...parsed.metadata,
    type: parsed.metadata.type ?? 'inline',
  },
  productSpecific: true,
};

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.join(__dirname, '..', '..');

describe('Documentation / setup files (sanity)', () => {
  it.each([
    'run.md',
    'prompts.md',
    'docs/implementation-plan.md',
    'docs/ai-workflow.md',
  ])('repo contains %s', (relativePath) => {
    expect(fs.existsSync(path.join(repoRoot, relativePath))).toBe(true);
  });

  it('repo contains .cursor/rules with project rule files', () => {
    const rulesDir = path.join(repoRoot, '.cursor', 'rules');
    expect(fs.existsSync(rulesDir)).toBe(true);
    const files = fs.readdirSync(rulesDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.endsWith('.mdc'))).toBe(true);
  });
});

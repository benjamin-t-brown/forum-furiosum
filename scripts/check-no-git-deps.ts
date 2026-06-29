import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEP_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'overrides',
] as const;

const GIT_SPEC_PATTERNS = [
  /^git(\+|:\/\/|:)/i,
  /^(github|gitlab|bitbucket):/i,
  /^git@/i,
  /^https?:\/\/github\.com\//i,
  /^https?:\/\/gitlab\.com\//i,
  /^https?:\/\/bitbucket\.org\//i,
  /\.git(#|@|$)/i,
];

function isGitSpec(value: string): boolean {
  return GIT_SPEC_PATTERNS.some((pattern) => pattern.test(value.trim()));
}

function collectGitSpecs(
  value: unknown,
  path: string,
  violations: { path: string; spec: string }[],
): void {
  if (typeof value === 'string') {
    if (isGitSpec(value)) {
      violations.push({ path, spec: value });
    }
    return;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      collectGitSpecs(nested, `${path}.${key}`, violations);
    }
  }
}

function main(): void {
  const pkgPath = resolve(process.cwd(), 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
  const violations: { path: string; spec: string }[] = [];

  for (const section of DEP_SECTIONS) {
    const block = pkg[section];
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      continue;
    }

    for (const [name, spec] of Object.entries(block as Record<string, unknown>)) {
      const path = `${section}.${name}`;
      if (typeof spec === 'string') {
        if (isGitSpec(spec)) {
          violations.push({ path, spec });
        }
      } else {
        collectGitSpecs(spec, path, violations);
      }
    }
  }

  if (violations.length > 0) {
    console.error('Git repository dependencies are not allowed in package.json:\n');
    for (const violation of violations) {
      console.error(`  ${violation.path}: ${violation.spec}`);
    }
    console.error('\nUse registry versions only (e.g. "1.2.3").');
    process.exit(1);
  }

  console.log('No git repository dependencies in package.json.');
}

main();

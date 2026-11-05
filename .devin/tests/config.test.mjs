import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const json = (path) => JSON.parse(read(path));

const skillNames = [
  'add-analysis-feature',
  'add-backend-feature',
  'add-desktop-feature',
  'add-frontend-feature',
  'bugfix',
  'capture-refs',
  'deploy',
  'feature',
  'github',
  'orchestrate',
  'refactor-slice',
  'run-tests',
  'session-handover',
  'session-retro',
];
const implementationSkills = [
  'add-analysis-feature',
  'add-backend-feature',
  'add-desktop-feature',
  'add-frontend-feature',
  'bugfix',
  'feature',
  'refactor-slice',
];
const agentNames = [
  'ai-analysis-reviewer',
  'architect',
  'code-reviewer',
  'figma-designer',
  'public-researcher',
  'researcher',
  'riot-compliance-reviewer',
  'rust-reviewer',
  'security-reviewer',
  'session-analyst',
  'test-engineer',
  'ux-reviewer',
];
const ruleNames = [
  'analysis',
  'backend',
  'core',
  'css',
  'desktop',
  'design-acceptance',
  'frontend',
  'riot-compliance',
  'rust',
];
const orchestrationPath = '.devin/skills/orchestrate/SKILL.md';
const frontmatter = (path) => {
  const header = read(path).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  assert.ok(header, `Missing frontmatter: ${path}`);
  return header;
};
const listField = (header, field) =>
  (header.match(new RegExp(`^${field}:\\r?\\n((?:  - [^\\r\\n]+(?:\\r?\\n|$))+)`, 'm'))?.[1] ?? '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.trim().slice(2));

test('shared MCP servers use exact pinned versions and no credentials', () => {
  const config = json('.devin/mcp_config.json');
  assert.deepEqual(Object.keys(config), ['mcpServers']);
  assert.deepEqual(Object.keys(config.mcpServers).sort(), ['angular-cli', 'figma-mcp-bridge', 'github']);
  assert.deepEqual(config.mcpServers.github, { url: 'https://api.githubcopilot.com/mcp/' });
  assert.deepEqual(config.mcpServers['angular-cli'], { command: 'npx', args: ['-y', '@angular/cli@22.1.6', 'mcp'] });
  assert.deepEqual(config.mcpServers['figma-mcp-bridge'], {
    command: 'npx',
    args: ['-y', '@magic-spells/figma-mcp-bridge@0.4.0'],
  });
  assert.doesNotMatch(read('.devin/mcp_config.json'), /headers|Bearer|token|github_pat_/i);
});

test('pnpm keeps a 7-day minimum release age for dependency supply-chain safety', () => {
  assert.match(read('pnpm-workspace.yaml'), /^minimumReleaseAge: 10080$/m);
});

test('local agent configuration and personal data stay gitignored', () => {
  const ignore = read('.gitignore');
  for (const entry of [
    '.devin/mcp_config.local.json',
    '.devin/config.local.json',
    '.devin/telemetry/',
    '.figma-refs/',
    '*.rofl',
    '.env',
  ]) {
    assert.ok(ignore.split(/\r?\n/).includes(entry), entry);
  }
});

test('project skills have discoverable names, descriptions, and explicit triggers', () => {
  const directories = readdirSync(resolve(root, '.devin/skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  for (const name of skillNames) {
    assert.ok(directories.includes(name), `Missing skill: ${name}`);
    const header = frontmatter(`.devin/skills/${name}/SKILL.md`);
    assert.equal(header.match(/^name: (.+)$/m)?.[1].trim(), name);
    assert.match(header, /^description: \S.+$/m);
    assert.deepEqual(
      listField(header, 'triggers'),
      ['deploy', 'session-handover', 'session-retro'].includes(name) ? ['user'] : ['user', 'model'],
      name,
    );
  }
});

test('no skill, rule, or profile references the source template project', () => {
  const paths = [
    'AGENTS.md',
    ...skillNames.map((name) => `.devin/skills/${name}/SKILL.md`),
    ...agentNames.map((name) => `.devin/agents/${name}.md`),
    ...ruleNames.map((name) => `.devin/rules/${name}.md`),
  ];
  for (const path of paths) assert.doesNotMatch(read(path), /MenuChooser|PrimeNG|NUnit|dotnet/i, path);
});

test('rules declare triggers and the compliance rule is always on', () => {
  for (const name of ruleNames) {
    const header = frontmatter(`.devin/rules/${name}.md`);
    assert.match(header, /^description: \S.+$/m, name);
    assert.match(header, /^trigger: (always_on|glob|manual)$/m, name);
  }
  assert.match(frontmatter('.devin/rules/core.md'), /^trigger: always_on$/m);
  assert.match(frontmatter('.devin/rules/riot-compliance.md'), /^trigger: always_on$/m);
  const compliance = read('.devin/rules/riot-compliance.md');
  for (const requirement of [
    'play first, analyze after',
    'hidden information',
    'input automation',
    'scouting',
    'riot-compliance-reviewer',
  ]) {
    assert.match(compliance, new RegExp(requirement, 'i'), requirement);
  }
});

test('legacy workflows link to their canonical skills', () => {
  for (const name of ['feature', 'bugfix', 'deploy']) {
    const path = `.devin/workflows/${name}.md`;
    const link = read(path).match(/\]\(([^)]+)\)/)?.[1];
    assert.equal(link, `../skills/${name}/SKILL.md`);
    assert.ok(existsSync(resolve(root, dirname(path), link)));
  }
});

test('root instructions reference the canonical verification skill and context files', () => {
  const agents = read('AGENTS.md');
  const path = agents.match(/`([^`]+\/run-tests\/SKILL\.md)`/)?.[1];
  assert.equal(path, '.devin/skills/run-tests/SKILL.md');
  assert.ok(existsSync(resolve(root, path)));
  for (const name of ruleNames) assert.ok(agents.includes(`.devin/rules/${name}.md`), name);
  assert.ok(read('.devin/skills/run-tests/SKILL.md').includes('node --test .devin/tests/config.test.mjs'));
});

test('run-tests skill lists the real workspace commands', () => {
  const skill = read('.devin/skills/run-tests/SKILL.md');
  const units = ['apps/api', 'apps/web', 'packages/analysis', 'packages/design-tokens', 'packages/ui'];
  for (const dir of units) {
    const manifest = json(`${dir}/package.json`);
    for (const script of ['test', 'build']) {
      assert.ok(manifest.scripts?.[script], `${dir} missing script: ${script}`);
      assert.ok(skill.includes(`pnpm -C ${dir} ${script}`), `run-tests missing: pnpm -C ${dir} ${script}`);
    }
  }
  for (const command of [
    'pnpm -r test',
    'pnpm -r build',
    'docker compose config --quiet',
    'docker compose -f docker-compose.backend.yml config --quiet',
    'node --test .devin/tests/config.test.mjs',
  ]) {
    assert.ok(skill.includes(command), `run-tests missing: ${command}`);
  }
});

test('specialist profiles have unique names, swe-2-max model, and least-privilege tools', () => {
  const files = readdirSync(resolve(root, '.devin/agents')).sort();
  assert.deepEqual(
    files,
    agentNames.map((name) => `${name}.md`),
  );
  for (const name of agentNames) {
    const path = `.devin/agents/${name}.md`;
    const header = frontmatter(path);
    assert.equal(header.match(/^name: (.+)$/m)?.[1], name);
    assert.match(header, /^description: \S.+$/m);
    const keys = [...header.matchAll(/^([A-Za-z][A-Za-z0-9-]*):/gm)].map((match) => match[1]);
    assert.deepEqual(keys, ['name', 'description', 'model', 'allowed-tools']);
    assert.equal(header.match(/^model: (.+)$/m)?.[1], 'swe-2-max', name);
    const tools = name === 'public-researcher' ? ['web_search', 'webfetch'] : ['read', 'grep', 'glob'];
    if (['architect', 'researcher', 'session-analyst'].includes(name)) tools.push('skill');
    if (name === 'test-engineer') tools.push('exec', 'get_output');
    if (name === 'figma-designer') tools.push('mcp_list_servers', 'mcp_list_tools', 'mcp_call_tool');
    assert.deepEqual(listField(header, 'allowed-tools'), tools, name);
    if (name === 'figma-designer') {
      const profile = read(path);
      assert.match(profile, /Use only the `figma-mcp-bridge` server/);
      assert.match(profile, /Do not edit application source or agent configuration/);
      assert.match(profile, /lacks visual reference evidence, report `BLOCKED`/);
      assert.ok(profile.includes('../references/figma-mcp-bridge.md'));
    } else assert.match(read(path), /Do not modify files\./, name);
    assert.match(read(path), /Do not delegate\./, name);
  }
});

test('orchestration and project skills remain inline', () => {
  for (const name of skillNames) {
    assert.doesNotMatch(frontmatter(`.devin/skills/${name}/SKILL.md`), /^(agent|subagent|model|max-nesting):/m, name);
  }
});

test('entry points use the canonical orchestration protocol without worker recursion', () => {
  for (const path of [
    'AGENTS.md',
    '.devin/rules/core.md',
    ...[...implementationSkills, 'deploy'].map((name) => `.devin/skills/${name}/SKILL.md`),
  ]) {
    assert.ok(read(path).includes(orchestrationPath), `Missing protocol reference: ${path}`);
  }
  for (const name of implementationSkills) {
    assert.match(read(`.devin/skills/${name}/SKILL.md`), /Standalone:|Root agent:/, name);
    assert.match(read(`.devin/skills/${name}/SKILL.md`), /Delegated:/, name);
  }
});

test('specialists and orchestration have resolvable local Markdown links', () => {
  const paths = [orchestrationPath, ...agentNames.map((name) => `.devin/agents/${name}.md`)];
  for (const path of paths) {
    const links = [...read(path).matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
    if (path === '.devin/agents/public-researcher.md')
      assert.equal(links.length, 0, 'Public researcher must not expose repository links');
    else assert.ok(links.length > 0, `Missing shared instructions: ${path}`);
    for (const link of links) {
      assert.doesNotMatch(link, /^(?:[a-z]+:|\/)/i, `Expected a local relative link: ${link}`);
      assert.ok(existsSync(resolve(root, dirname(path), link.split('#')[0])), `Broken link in ${path}: ${link}`);
    }
  }
  const protocol = read(orchestrationPath);
  for (const name of agentNames) assert.ok(protocol.includes(`../../agents/${name}.md`), name);
  for (const name of agentNames.filter((agent) => agent !== 'public-researcher')) {
    const profile = read(`.devin/agents/${name}.md`);
    assert.ok(profile.includes('../../AGENTS.md'), name);
    assert.ok(profile.includes('../skills/orchestrate/SKILL.md'), name);
  }
});

test('orchestration defines task, delegation, evidence, and gate contracts', () => {
  const protocol = read(orchestrationPath);
  for (const heading of [
    'Entry and scope',
    'Triage',
    'Specialists',
    'Delegation contract',
    'Scheduling and integration',
    'Independent verification',
    'Security gate',
    'Runtime fallback',
    'Result contract',
    'Acceptance scenarios',
  ])
    assert.ok(protocol.includes(`## ${heading}`), heading);
  for (const field of [
    'Task ID',
    'Acceptance criteria',
    'Scope and exclusions',
    'Ownership',
    'Dependencies',
    'Context',
    'Change-set ID',
    'Verification',
    'Status',
    'Evidence',
    'Findings',
    'Limitations',
  ])
    assert.ok(protocol.includes(`**${field}**`), field);
  for (const status of ['PASS', 'FAIL', 'BLOCKED', 'NOT_APPLICABLE', 'ACCEPTED_RISK'])
    assert.ok(protocol.includes(`\`${status}\``), status);
  for (const gate of ['Riot compliance gate', 'AI analysis gate', 'Rust gate', 'DESIGN_REVIEW'])
    assert.ok(protocol.includes(gate), gate);
});

test('protocol includes risk precedence, review independence, and stale-evidence safeguards', () => {
  const protocol = read(orchestrationPath);
  for (const requirement of [
    'Risk overrides size.',
    'Only the root agent spawns subagents.',
    'At most three subagents',
    'one writer per file',
    'staged, unstaged, and untracked',
    'fresh reviewer',
    'configuration-only',
    'CRITICAL/HIGH',
    'explicit user acceptance',
    'unavailable review is never a pass',
    'invalidate',
    'not a CI or branch-protection control',
    'Do not combine repository read tools and network tools',
  ])
    assert.ok(protocol.includes(requirement), requirement);
});

test('session branch rule keeps commits off Develop/master with safe branch creation', () => {
  const core = read('.devin/rules/core.md');
  for (const requirement of [
    '`<type>-<issue-number>-<kebab-slug>`',
    'conventional-commit type matching the issue',
    'driving GitHub issue',
    'PascalCase topic name',
    'before the first mutating change',
    'never stash, force, or clean',
    'workers never create or switch branches',
    'never directly on `Develop` or `master`',
    'git push -u origin',
    'pushes the whole branch once at task completion',
    'never push commits individually',
    'never merges',
    'task-level issue',
    'own session branch',
    'do not roll the next issue',
    'ancestors of `origin/Develop`',
    'merge resolutions',
  ])
    assert.ok(core.includes(requirement), `core.md: ${requirement}`);
  const agents = read('AGENTS.md');
  assert.ok(agents.includes('per-session topic branch'));
  assert.ok(agents.includes('`<type>-<issue-number>-<kebab-slug>`'));
  assert.ok(agents.includes('never commit directly to `Develop` or `master`'));
  assert.ok(agents.includes('ancestors of `origin/Develop`'), 'AGENTS.md post-merge check');
  assert.ok(read('.devin/skills/github/SKILL.md').includes('never per-commit'), 'github SKILL.md push boundary');
  assert.ok(
    read('.devin/skills/github/SKILL.md').includes('where conflicts are likely'),
    'github SKILL.md merge-conflict handoff',
  );
  const githubSkill = read('.devin/skills/github/SKILL.md');
  for (const requirement of ['label `story`', 'No epics under epics']) {
    assert.ok(githubSkill.includes(requirement), `github SKILL.md taxonomy: ${requirement}`);
  }
});

test('worktree re-checks and rule pins guard against mid-session drift and rule loss', () => {
  const core = read('.devin/rules/core.md');
  for (const requirement of [
    'after each user reply',
    'concurrent user git operations',
    '`.devin/tests/config.test.mjs` assertion in the same change',
  ])
    assert.ok(core.includes(requirement), `core.md: ${requirement}`);
});

test('commit freshness and complete-output verdict rules stay pinned', () => {
  const core = read('.devin/rules/core.md');
  for (const requirement of [
    'fresh, complete run of the applicable test suite',
    'exact tree being committed',
    'never report or commit on a `tail` excerpt',
  ])
    assert.ok(core.includes(requirement), `core.md: ${requirement}`);
  const skill = read('.devin/skills/run-tests/SKILL.md');
  for (const requirement of ['complete output only', 'overflow file', 'not a result'])
    assert.ok(skill.includes(requirement), `run-tests: ${requirement}`);
});

test('retrospective lessons stay pinned', () => {
  const agents = read('AGENTS.md');
  assert.ok(
    agents.includes('overrides any external or default commit template'),
    'AGENTS.md: trailer rule override',
  );
  const runTests = read('.devin/skills/run-tests/SKILL.md');
  assert.ok(runTests.includes('transpile without typechecking'), 'run-tests: build-before-commit rule');
  const backend = read('.devin/rules/backend.md');
  assert.ok(backend.includes('module-evaluation time'), 'backend.md: e2e env-ordering note');
  const github = read('.devin/skills/github/SKILL.md');
  assert.ok(github.includes('Bulk status updates'), 'github SKILL.md: bulk update note');
  const analyst = read('.devin/agents/session-analyst.md');
  for (const requirement of ['evidence-backed or speculative', 'Do not read secrets'])
    assert.ok(analyst.includes(requirement), `session-analyst: ${requirement}`);
  const hook = read('.devin/scripts/telemetry-hook.mjs');
  assert.ok(hook.includes('exit_code'), 'telemetry hook: exit-code failure capture');
});

test('telemetry hook records exit-code and error failures', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rifter-telemetry-'));
  mkdirSync(join(dir, '.devin'), { recursive: true });
  const run = (toolResponse) => {
    execFileSync(process.execPath, [resolve(root, '.devin/scripts/telemetry-hook.mjs')], {
      input: JSON.stringify({
        hook_event_name: 'PostToolUse',
        session_id: 'test',
        tool_name: 'exec',
        tool_response: toolResponse,
      }),
      env: { ...process.env, DEVIN_PROJECT_DIR: dir },
    });
    const lines = readFileSync(join(dir, '.devin/telemetry/tool-calls.jsonl'), 'utf8')
      .trim()
      .split('\n');
    return JSON.parse(lines.at(-1));
  };
  assert.equal(run({ success: true }).ok, true);
  assert.equal(run({ success: false }).ok, false);
  assert.equal(run({ error: 'boom' }).ok, false);
  const nonZero = run({ success: true, exit_code: 1 });
  assert.equal(nonZero.ok, false);
  assert.equal(nonZero.exit_code, 1);
  const camel = run({ exitCode: 2 });
  assert.equal(camel.ok, false);
  assert.equal(camel.exit_code, 2);
  const zero = run({ exit_code: 0 });
  assert.equal(zero.ok, true);
  assert.equal(zero.exit_code, 0);
});

test('session handover keeps the store read-only and handover files uncommitted', () => {
  const skill = read('.devin/skills/session-handover/SKILL.md');
  for (const requirement of ['session-handover.mjs', 'Never commit', 'read-only', 'main-chain'])
    assert.ok(skill.includes(requirement), `skill: ${requirement}`);
  const script = read('.devin/scripts/session-handover.mjs');
  assert.ok(script.includes('readOnly: true'), 'script opens the store read-only');
  const core = read('.devin/rules/core.md');
  assert.ok(core.includes('session-handover'), 'core.md references the handover skill');
  assert.ok(core.includes('Never commit handover files'), 'core.md: no-commit rule for handover files');
});

test('documentation rule pins living per-feature docs', () => {
  const core = read('.devin/rules/core.md');
  for (const requirement of ['docs/<feature-or-area>.md', 'business purpose', 'same change', 'review finding'])
    assert.ok(core.includes(requirement), `core.md: ${requirement}`);
  const agents = read('AGENTS.md');
  assert.ok(agents.includes('docs/<feature-or-area>.md'), 'AGENTS.md docs principle');
  for (const skill of ['feature', 'bugfix'])
    assert.ok(read(`.devin/skills/${skill}/SKILL.md`).includes('living doc'), `${skill} SKILL.md docs reminder`);
});

test('delegation hard gates persist in always-on rules and the protocol', () => {
  const core = read('.devin/rules/core.md');
  for (const requirement of [
    'Delegation gates',
    'figma-designer',
    'document-mutating `figma_*` tools',
    'never self-approved',
    'riot-compliance-reviewer',
    'ai-analysis-reviewer',
    'rust-reviewer',
    'first mutating tool call',
    'never guess tool names or argument shapes',
    'Patching a failed artifact does not make it compliant',
  ])
    assert.ok(core.includes(requirement), `core.md: ${requirement}`);
  const protocol = read(orchestrationPath);
  for (const requirement of ['### Hard gates', 'non-negotiable', 'written spec', 'debug-only']) {
    assert.ok(protocol.includes(requirement), `orchestrate: ${requirement}`);
  }
  assert.ok(core.includes('standard code review'), 'core.md: narrowed .devin/ gate exemption');
  assert.ok(protocol.includes('standard independent code review'), 'orchestrate: narrowed .devin/ gate exemption');
});

test('review profiles keep their independence and evidence requirements', () => {
  assert.match(read('.devin/agents/security-reviewer.md'), /CRITICAL \/ HIGH \/ MEDIUM \/ LOW/);
  assert.match(read('.devin/agents/code-reviewer.md'), /Do not approve your own implementation/);
  assert.match(read('.devin/agents/rust-reviewer.md'), /Do not approve your own implementation/);
  const compliance = read('.devin/agents/riot-compliance-reviewer.md');
  assert.match(compliance, /Review mode \(`DESIGN_REVIEW` or `FINAL_REVIEW`\)/);
  assert.match(compliance, /not legal advice/);
  assert.ok(compliance.includes('../references/riot-data-sources.md'));
  assert.match(read('.devin/agents/ai-analysis-reviewer.md'), /Do not run commands, call LLMs/);
  const tester = read('.devin/agents/test-engineer.md');
  assert.ok(tester.includes('../skills/run-tests/SKILL.md'));
  assert.match(tester, /shell access is not a read-only sandbox/);
  assert.match(read('.devin/agents/researcher.md'), /without network access/);
  const publicResearcher = read('.devin/agents/public-researcher.md');
  assert.match(publicResearcher, /Do not request or accept code/);
  assert.doesNotMatch(frontmatter('.devin/agents/researcher.md'), /web_search|webfetch/);
  assert.doesNotMatch(frontmatter('.devin/agents/public-researcher.md'), /\bread\b|grep|glob/);
});

test('specialist profiles use the structured result contract', () => {
  for (const name of agentNames) {
    const profile = read(`.devin/agents/${name}.md`);
    for (const heading of [
      'Task ID',
      'Change-set ID',
      'Status',
      'Evidence',
      'Findings',
      'Blocking',
      'Optional',
      'Limitations',
    ]) {
      assert.ok(profile.includes(`## ${heading}`) || profile.includes(`### ${heading}`), `${name}: ${heading}`);
    }
    for (const field of ['Classification', 'Evidence', 'Impact', 'Recommended action'])
      assert.ok(profile.includes(field), `${name}: ${field}`);
  }
});

test('deployment stays user-only with explicit approval', () => {
  const deploy = read('.devin/skills/deploy/SKILL.md');
  assert.match(deploy, /artifact or revision/);
  assert.match(deploy, /review evidence/);
  assert.match(deploy, /wait for explicit approval/);
});

test('figma bridge field notes stay pinned to the configured server version', () => {
  const version = json('.devin/mcp_config.json').mcpServers['figma-mcp-bridge'].args[1].split('@').pop();
  assert.ok(read('.devin/references/figma-mcp-bridge.md').includes(version));
  assert.ok(read(orchestrationPath).includes('references/figma-mcp-bridge.md'));
});

test('design acceptance gate keeps Figma order, node IDs, and user-only acceptance', () => {
  const rule = read('.devin/rules/design-acceptance.md');
  assert.match(frontmatter('.devin/rules/design-acceptance.md'), /^trigger: always_on$/m);
  for (const requirement of [
    '1:2',
    '0:1',
    'l34FZ4ZhQpkOc172pkcjfs',
    'Only the user accepts',
    'docs/design/acceptance.md',
    'Design system first',
    'Implementation last',
  ]) {
    assert.ok(rule.includes(requirement), requirement);
  }
  assert.ok(read('AGENTS.md').includes('.devin/rules/design-acceptance.md'));
  assert.ok(read('.devin/rules/core.md').includes('Agents never accept designs'));
  assert.ok(read('.devin/skills/orchestrate/SKILL.md').includes('Only the user accepts'));
  assert.ok(read('.devin/skills/add-frontend-feature/SKILL.md').includes('docs/design/acceptance.md'));
  assert.ok(
    read('.devin/skills/feature/SKILL.md').includes('docs/design/acceptance.md') ||
      read('.devin/skills/feature/SKILL.md').includes('design-acceptance.md'),
  );
  assert.match(read('.devin/agents/figma-designer.md'), /Never mark a design as accepted/);
});

test('telemetry hook is one cross-platform Node command that records metadata only', () => {
  const hooks = json('.devin/hooks.v1.json');
  const expected = 'node "${DEVIN_PROJECT_DIR:-.}/.devin/scripts/telemetry-hook.mjs" || true';
  for (const event of [
    'PreToolUse',
    'PostToolUse',
    'UserPromptSubmit',
    'SessionStart',
    'SessionEnd',
    'PostCompaction',
  ]) {
    assert.equal(hooks[event]?.[0]?.hooks?.[0]?.command, expected, event);
  }
  const script = read('.devin/scripts/telemetry-hook.mjs');
  assert.match(script, /never tool arguments, outputs, or prompt/);
  assert.doesNotMatch(script, /record\.(prompt|tool_input|output)\b/);
  assert.equal(existsSync(resolve(root, '.devin/scripts/telemetry-hook.py')), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import runReport, { MARKER, normalizeTitle, websiteHosts, reviewSignals, searchRecent, renderReport } from './pr-activity-report.mjs';

const now = new Date('2026-10-24T12:00:00Z');
const current = {
  number: 1, title: 'Add Example Atlas regional bird map', body: '', state: 'open',
  user: { login: 'contributor', type: 'User' }, author_association: 'NONE',
  base: { repo: { full_name: 'curator/maps' } },
};
const pr = (number, options = {}) => ({
  number, title: `Different project contribution number ${number}`, body: '', state: 'open',
  html_url: `https://github.com/owner${number}/project/pull/${number}`,
  pull_request: { merged_at: null }, ...options,
});
const listPRs = Array.from({ length: 4 }, (_, i) => pr(i + 1, {
  html_url: `https://github.com/owner${i}/awesome-maps/pull/${i + 1}`,
}));

test('ordinary activity, newcomers and similar partial titles have no signal', () => {
  assert.equal(reviewSignals([pr(1), pr(2)], current, new Set()).length, 0);
  assert.equal(reviewSignals(listPRs.slice(0, 3), current, new Set()).length, 0);
  const titles = [pr(1, { title: 'Add Example Atlas weather map' }), pr(2, { title: 'Add Example Atlas terrain map' }), pr(3, { title: 'Add Example Atlas history map' })];
  assert.equal(reviewSignals(titles, current, new Set()).length, 0);
});

test('awesome-list threshold counts repositories, not number of PRs to one repo', () => {
  assert.equal(reviewSignals(listPRs, current, new Set()).length, 1);
  const sameRepo = listPRs.map((p, i) => ({ ...p, html_url: `https://github.com/one/awesome-maps/pull/${i + 1}` }));
  assert.equal(reviewSignals(sameRepo, current, new Set()).length, 0);
});

test('full title equality supports Unicode and never means first-three-word matching', () => {
  assert.equal(normalizeTitle(' ADD: Карта — ПТИЦ! '), 'add карта птиц');
  const repeated = [1, 2, 3].map(i => pr(i, { title: 'ADD: Example Atlas — Regional Bird Map!' }));
  assert.match(reviewSignals(repeated, current, new Set())[0].text, /same normalized full title/);
  assert.equal(reviewSignals(repeated.map(p => ({ ...p, title: 'Update README.md' })), { ...current, title: 'Update README.md' }, new Set()).length, 0);
});

test('website repetition is explicit and generic hosting platforms are excluded', () => {
  const hosts = websiteHosts('https://www.example.org/gis/ https://github.com/a/b https://en.wikipedia.org/wiki/Map');
  assert.deepEqual([...hosts], ['example.org']);
  const related = [1, 2, 3].map(i => pr(i, { body: 'See [Atlas](https://example.org/guide/)' }));
  assert.match(reviewSignals(related, current, hosts)[0].text, /descriptions|Descriptions/);
  assert.equal(reviewSignals(related, current, new Set(['other.org'])).length, 0);
});

test('large volumes require both PR and distinct repository thresholds', () => {
  assert.equal(reviewSignals(Array.from({ length: 19 }, (_, i) => pr(i)), current, new Set()).length, 0);
  assert.match(reviewSignals(Array.from({ length: 20 }, (_, i) => pr(i)), current, new Set())[0].text, /20 public PRs/);
});

test('mass promotion warning starts at ten other repositories and also covers twenty', () => {
  for (const count of [9, 10, 20]) {
    const prs = Array.from({ length: count }, (_, i) => pr(i + 1, { body: 'I built this site: https://example.org/guide/' }));
    const signals = reviewSignals(prs, current, new Set(['example.org']));
    const report = renderReport({ current, result: { prs, total: count, notes: [] }, signals,
      query: 'query', since: '2026-10-10', now });
    assert.equal(report.includes('possible promotional campaign'), count >= 10);
    assert.equal(report.includes('Strong promotional-spam signal'), count >= 10);
    if (count >= 10) assert(report.includes(`${count} other repositories within 14 days`));
  }
});

test('high activity with unrelated websites is not called a promotional campaign', () => {
  const prs = Array.from({ length: 20 }, (_, i) => pr(i + 1, { body: `https://unrelated-${i}.org/` }));
  const signals = reviewSignals(prs, current, new Set(['example.org']));
  const report = renderReport({ current, result: { prs, total: 20, notes: [] }, signals,
    query: 'query', since: '2026-10-10', now });
  assert.doesNotMatch(report, /Strong promotional-spam signal|possible promotional campaign/);
});

test('search fetches additional pages and keeps exact API totals separate from samples', async () => {
  const pages = [];
  const github = { rest: { search: { issuesAndPullRequests: async ({ page, q }) => {
    assert.match(q, /created:/);
    pages.push(page);
    return { data: { total_count: 135, incomplete_results: false,
      items: Array.from({ length: page === 1 ? 100 : 35 }, (_, i) => pr((page - 1) * 100 + i + 1)) } };
  } } } };
  const result = await searchRecent(github, 'is:pr created:>=2026-10-10');
  assert.deepEqual(pages, [1, 2]);
  assert.equal(result.prs.length, 135);
  assert.deepEqual(result.notes, []);
});

test('search cap, incomplete results and page failures are disclosed', async () => {
  const response = { total_count: 1200, incomplete_results: true, items: Array.from({ length: 100 }, (_, i) => pr(i)) };
  const github = { rest: { search: { issuesAndPullRequests: async ({ page }) => {
    if (page === 2) throw Object.assign(new Error('rate limit'), { status: 403 });
    return { data: response };
  } } } };
  const result = await searchRecent(github, 'query');
  assert.equal(result.total, 1200);
  assert.equal(result.prs.length, 100);
  assert.match(result.notes.join('\n'), /incomplete/);
  assert.match(result.notes.join('\n'), /HTTP 403/);
  assert.match(result.notes.join('\n'), /first 1,000/);
});

function harness({ prs = [], comments = [], overrides = {}, files = [], searchError, preview, eventName = 'pull_request_target' } = {}) {
  const writes = [], summaries = [], queries = [], fileRequests = [];
  const github = { rest: {
    pulls: {
      get: async () => ({ data: { ...current, ...overrides } }),
      listFiles: async args => { fileRequests.push(args); return { data: files }; },
    },
    search: { issuesAndPullRequests: async args => {
      queries.push(args.q);
      if (searchError) throw Object.assign(new Error('unavailable'), { status: 503 });
      return { data: { items: prs, total_count: prs.length, incomplete_results: false } };
    } },
    users: { getByUsername: async () => ({ data: { created_at: now.toISOString(), followers: 0 } }) },
    issues: {
      listComments: () => {},
      createComment: async args => { writes.push({ method: 'create', ...args }); },
      updateComment: async args => { writes.push({ method: 'update', ...args }); },
    },
  }, paginate: { iterator: async function* () { yield { data: comments }; } } };
  const core = { info: () => {}, summary: { addRaw: body => { summaries.push(body); return { write: async () => {} }; } } };
  return {
    args: { github, core, context: { repo: { owner: 'curator', repo: 'maps' }, eventName, payload: { pull_request: { number: 1 } } },
      env: { REPORT_PR_NUMBER: '1', REPORT_PREVIEW_ONLY: preview }, now },
    writes, summaries, queries, fileRequests,
  };
}

test('quiet mode posts nothing for ordinary activity, even with a new account and zero followers', async () => {
  const h = harness({ prs: [pr(1)] });
  await runReport(h.args);
  assert.equal(h.writes.length, 0);
  assert.match(h.summaries[0], /No report was posted/);
  assert.match(h.queries[0], /is:public/);
  assert.match(h.queries[0], /-user:contributor -repo:curator\/maps/);
  assert.match(h.queries[0], /2026-10-10T12:00:00.000Z/);
});

test('API failure alone never becomes a suspicion comment', async () => {
  const h = harness({ searchError: true });
  await runReport(h.args);
  assert.equal(h.writes.length, 0);
  assert.match(h.summaries[0], /HTTP 503/);
});

test('trigger creates only one informational comment; copied user markers are ignored', async () => {
  const h = harness({ prs: listPRs, comments: [{ id: 9, user: { login: 'someone' }, body: MARKER }] });
  await runReport(h.args);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].method, 'create');
  assert.match(h.writes[0].body, /never labels, closes, blocks or merges/);
  assert.match(h.writes[0].body, /0 \|/);
});

test('rerun updates the bot report instead of duplicating comments', async () => {
  const h = harness({ prs: listPRs, comments: [{ id: 42, user: { login: 'github-actions[bot]' }, body: MARKER + '\nold report' }] });
  await runReport(h.args);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].method, 'update');
  assert.equal(h.writes[0].comment_id, 42);
});

test('a link added in the current diff can reveal website repetition in other PR descriptions', async () => {
  const prs = [1, 2, 3].map(i => pr(i, { body: 'https://example.org/guide/' }));
  const h = harness({ prs, files: [{ status: 'modified', patch: '-https://removed.org/\n+  "url": "https://example.org/gis/"' }] });
  await runReport(h.args);
  assert.match(h.writes[0].body, /example.org/);
  assert.doesNotMatch(h.writes[0].body, /removed.org/);
});

test('manual preview and closed PRs never receive comments', async () => {
  for (const options of [{ eventName: 'workflow_dispatch' }, { overrides: { state: 'closed' } }]) {
    const h = harness({ prs: listPRs, ...options });
    await runReport(h.args);
    assert.equal(h.writes.length, 0);
    assert.match(h.summaries[0], /Observed patterns/);
  }
});

test('internal contributors and bots are skipped before searches', async () => {
  for (const overrides of [{ author_association: 'MEMBER' }, { user: { login: 'helper[bot]', type: 'Bot' } }]) {
    const h = harness({ prs: listPRs, overrides });
    await runReport(h.args);
    assert.equal(h.writes.length, 0);
    assert.equal(h.queries.length, 0);
  }
});

test('PR titles are escaped and merge status is not guessed from a closed state', () => {
  const dangerous = pr(99, { title: '<script> @everyone | [click](https://evil.org)', state: 'closed', pull_request: {} });
  const report = renderReport({ current, result: { prs: [dangerous], total: 1, notes: ['Incomplete'] },
    signals: [{ text: 'Example signal', matches: [dangerous] }], query: 'query', since: '2026-10-10', now });
  assert.doesNotMatch(report, /<script>|@everyone/);
  assert.match(report, /&lt;script&gt;/);
  assert.match(report, /Closed; merge status unavailable/);
  assert.match(report, /Available activity sample/);
});

test('workflow executes only a pinned action and trusted base code, with no PR input interpolation', async () => {
  const workflow = await readFile(new URL('../.github/workflows/pr-activity-report.yml', import.meta.url), 'utf8');
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /ref: \$\{\{ github.sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.equal([...workflow.matchAll(/uses: [^\n]+@[a-f0-9]{40}/g)].length, 2);
  assert.doesNotMatch(workflow, /pull_request\.head|contents: write/);
  const script = workflow.split('script: |')[1];
  assert.doesNotMatch(script, /\$\{\{/);
});

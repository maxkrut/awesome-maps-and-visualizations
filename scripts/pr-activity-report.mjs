// Public activity provides review context, never a verdict on a contributor.
export const MARKER = '<!-- awesome-maps-pr-activity-report:v1 -->';
const DAY = 86_400_000;
const MAX_PAGES = 10; // GitHub Search exposes at most 1,000 matches.
const SHARED_HOSTS = new Set([
  'github.com', 'gitlab.com', 'bitbucket.org', 'doi.org', 'youtube.com',
  'youtu.be', 'wikipedia.org', 'en.wikipedia.org', 'docs.google.com',
]);

export const normalizeTitle = title => String(title ?? '').normalize('NFKC')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function websiteHosts(text) {
  const hosts = new Set();
  for (const match of String(text ?? '').matchAll(/https?:\/\/[^\s<>"'`\\)\]}]+/gi)) {
    try {
      const host = new URL(match[0]).hostname.toLowerCase().replace(/^www\./, '');
      if (!SHARED_HOSTS.has(host) && !host.endsWith('.wikipedia.org')) hosts.add(host);
    } catch { /* Ignore malformed links in untrusted descriptions. */ }
  }
  return hosts;
}

const repositoryOf = pr => /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/\d+$/.exec(pr.html_url ?? '')?.[1];
const uniqueRepos = prs => new Set(prs.map(repositoryOf).filter(Boolean)).size;
const titleIsSpecific = title => title.length >= 20 && title.split(' ').length >= 4
  && !/^(?:update|fix|edit|improve|add) (?:the )?(?:readme|documentation|docs|typos?)(?: md)?$/.test(title);

export function reviewSignals(prs, current, linkedHosts) {
  const signals = [];
  const lists = prs.filter(pr => /awesome/i.test(repositoryOf(pr)?.split('/')[1] ?? ''));
  if (uniqueRepos(lists) >= 4) signals.push({
    text: `PRs to ${uniqueRepos(lists)} different awesome-list repositories within 14 days (review threshold: 4).`,
    matches: lists,
  });
  const title = normalizeTitle(current.title);
  const sameTitle = titleIsSpecific(title) ? prs.filter(pr => normalizeTitle(pr.title) === title) : [];
  if (uniqueRepos(sameTitle) >= 3) signals.push({
    text: `The same normalized full title as this PR appears in ${uniqueRepos(sameTitle)} other repositories (review threshold: 3).`,
    matches: sameTitle,
  });
  for (const host of [...linkedHosts].sort()) {
    const matches = prs.filter(pr => websiteHosts(pr.body).has(host));
    if (uniqueRepos(matches) >= 3) signals.push({
      text: `Descriptions of PRs to ${uniqueRepos(matches)} other repositories mention ${host}, which is also linked by this PR (review threshold: 3).`,
      matches,
    });
    if (signals.length >= 8) break;
  }
  if (prs.length >= 20 && uniqueRepos(prs) >= 10) signals.push({
    text: `${prs.length} public PRs across ${uniqueRepos(prs)} other repositories within 14 days (review threshold: 20 PRs across 10 repositories).`,
    matches: prs,
  });
  return signals;
}

export async function searchRecent(github, query) {
  const prs = new Map();
  const notes = [];
  let total = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    let data;
    try {
      ({ data } = await github.rest.search.issuesAndPullRequests({
        q: query, sort: 'created', order: 'desc', per_page: 100, page,
      }));
    } catch (error) {
      notes.push(`Activity search was unavailable${error.status ? ` (HTTP ${error.status})` : ''}; collected results may be incomplete.`);
      break;
    }
    total = data.total_count;
    if (data.incomplete_results) notes.push('GitHub marked its search results as incomplete.');
    for (const pr of data.items) {
      if (repositoryOf(pr) && pr.pull_request) prs.set(pr.html_url, pr);
    }
    if (data.items.length < 100 || page * 100 >= Math.min(total, 1000)) break;
  }
  if (total > 1000) notes.push(`GitHub reports ${total} matches, but exposes only the first 1,000.`);
  if (total !== null && prs.size < total) notes.push(`Only ${prs.size} of ${total} search matches were available for analysis.`);
  return { prs: [...prs.values()], total, notes: [...new Set(notes)] };
}

const escapeText = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/\r?\n/g, ' ').replace(/@/g, '&#64;').replace(/[\\`*_{}\[\]()|!~]/g, '\\$&');
const searchUrl = query => `https://github.com/search?type=pullrequests&q=${encodeURIComponent(query)}`;
function stateOf(pr) {
  if (pr.pull_request?.merged_at) return 'Merged';
  if (pr.state === 'open') return 'Open';
  return Object.hasOwn(pr.pull_request ?? {}, 'merged_at') ? 'Closed without merge' : 'Closed; merge status unavailable';
}

export function renderReport({ current, profile, result, signals, query, since, now, notes = [] }) {
  const { prs, total } = result;
  const states = prs.reduce((counts, pr) => {
    const state = stateOf(pr);
    counts[state] = (counts[state] ?? 0) + 1;
    return counts;
  }, { Merged: 0, 'Closed without merge': 0, Open: 0 });
  const created = profile?.created_at ? Date.parse(profile.created_at) : NaN;
  const accountAge = Number.isFinite(created) ? `${Math.max(0, Math.floor((now - created) / DAY))} days` : 'Unavailable';
  const complete = result.notes.length === 0;
  const evidence = [...new Map(signals.flatMap(signal => signal.matches).map(pr => [pr.html_url, pr])).values()];
  const rows = evidence.slice(0, 15).map(pr => `| [${escapeText(repositoryOf(pr))}#${pr.number}](${pr.html_url}) | ${escapeText(String(pr.title).slice(0, 120))} | ${stateOf(pr)} |`);
  return [
    MARKER,
    '## PR activity report',
    '',
    'Recent public activity has patterns worth a maintainer\'s review. This is context, not a spam verdict or an assessment of the resource\'s quality.',
    '',
    `**Contributor:** [${escapeText(current.user.login)}](https://github.com/${current.user.login}) · **Account age:** ${accountAge} (context only)`,
    `**Window:** ${since} to ${now.toISOString()} · **Checked:** ${now.toISOString()}`,
    '',
    '### Observed patterns',
    ...signals.map(signal => `- ${escapeText(signal.text)}`),
    '',
    `### ${complete ? 'Activity' : 'Available activity sample'}`,
    '',
    '| Metric | Count |',
    '| --- | ---: |',
    `| Public PRs in other people\'s repositories (GitHub search) | ${total ?? 'Unavailable'} |`,
    `| PRs inspected | ${prs.length} |`,
    `| Different repositories inspected | ${uniqueRepos(prs)} |`,
    ...Object.entries(states).map(([state, count]) => `| ${state} | ${count} |`),
    '',
    `<details>`,
    `<summary>Examples behind these patterns (${Math.min(evidence.length, 15)} of ${evidence.length} matching PRs inspected)</summary>`,
    '',
    '| Pull request | Title | State at check |',
    '| --- | --- | --- |',
    ...rows,
    '',
    '</details>',
    '',
    `[Inspect the public search results](${searchUrl(query)}) · [Editorial selection criteria](https://github.com/${current.base.repo.full_name}/blob/HEAD/CONTRIBUTING.md#editorial-selection-criteria)`,
    '',
    ...[...result.notes, ...notes].map(note => `- **Data limitation:** ${escapeText(note)}`),
    '',
    'Only public PRs created in this window are considered. The current repository and repositories owned by the contributor are excluded; organization membership is not inferred. Website matches use descriptions of other PRs, not their diffs. Exact titles are compared after case, Unicode and punctuation normalization. Search indexing and states can lag, and a closed PR may have been incorporated manually.',
    '',
    '**Maintainer decision required.** This workflow only creates or updates this report; it never labels, closes, blocks or merges a PR. Account age, followers and popularity do not trigger a report.',
    '',
  ].join('\n');
}

async function addedLinkHosts(github, repo, number, notes) {
  const hosts = new Set();
  try {
    // Three pages are enough for catalogue additions; any limit is disclosed.
    for (let page = 1; page <= 3; page++) {
      const { data: files } = await github.rest.pulls.listFiles({ ...repo, pull_number: number, per_page: 100, page });
      for (const file of files) {
        if (file.status !== 'removed' && file.patch === undefined) notes.push('Some changed files have no text patch; website matching may miss added links.');
        const added = String(file.patch ?? '').split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).join('\n');
        for (const host of websiteHosts(added)) hosts.add(host);
      }
      if (files.length < 100) break;
      if (page === 3) notes.push('Only the first 300 changed files were inspected for added website links.');
    }
  } catch (error) {
    notes.push(`Changed-file links were unavailable${error.status ? ` (HTTP ${error.status})` : ''}; website matching may be incomplete.`);
  }
  return hosts;
}

export default async function runReport({ github, context, core, env = process.env, now = new Date() }) {
  const manual = context.eventName === 'workflow_dispatch';
  const number = Number(manual ? env.REPORT_PR_NUMBER : context.payload.pull_request?.number);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('A positive pull request number is required.');
  const preview = manual && env.REPORT_PREVIEW_ONLY !== 'false';
  const repo = context.repo;
  const { data: current } = await github.rest.pulls.get({ ...repo, pull_number: number });
  if (current.base.repo.full_name.toLowerCase() !== `${repo.owner}/${repo.repo}`.toLowerCase()) throw new Error('Unexpected base repository.');
  if (current.user.type === 'Bot' || ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(current.author_association)
    || current.user.login.toLowerCase() === repo.owner.toLowerCase()) {
    core.info('Internal contributors and bot accounts do not receive activity reports.');
    return;
  }
  const author = current.user.login;
  if (!/^[a-z0-9][a-z0-9-]{0,38}$/i.test(author)) throw new Error('Unexpected GitHub login.');
  const since = new Date(now.getTime() - 14 * DAY).toISOString();
  const query = `is:pr is:public author:${author} created:${since}..${now.toISOString()} -user:${author} -repo:${repo.owner}/${repo.repo}`;
  const result = await searchRecent(github, query);
  const notes = [];
  const hosts = websiteHosts(current.body);
  if (result.prs.length) {
    for (const host of await addedLinkHosts(github, repo, number, notes)) hosts.add(host);
  }
  const signals = reviewSignals(result.prs, current, hosts);
  if (signals.length === 0) {
    const summary = ['## PR activity report', '', 'No report was posted: no review thresholds were reached in the available public activity.',
      ...[...result.notes, ...notes].map(note => `- Data limitation: ${note}`)].join('\n');
    await core.summary.addRaw(summary).write();
    core.info('No new PR comment. Existing reports, if any, remain dated snapshots.');
    return;
  }
  let profile;
  try { ({ data: profile } = await github.rest.users.getByUsername({ username: author })); }
  catch { notes.push('Account age was unavailable; it is not used to detect patterns.'); }
  const body = renderReport({ current, profile, result, signals, query, since, now, notes });
  await core.summary.addRaw(body).write();
  if (preview || current.state !== 'open') {
    core.info('Preview only: no comment was posted (manual preview or closed PR).');
    return;
  }
  // Update only this workflow's own comment. Do not trust a marker copied by a user.
  let existing;
  for await (const { data: comments } of github.paginate.iterator(github.rest.issues.listComments, { ...repo, issue_number: number, per_page: 100 })) {
    existing = comments.find(comment => comment.user?.login === 'github-actions[bot]' && comment.body?.startsWith(MARKER));
    if (existing) break;
  }
  if (existing) await github.rest.issues.updateComment({ ...repo, comment_id: existing.id, body });
  else await github.rest.issues.createComment({ ...repo, issue_number: number, body });
}

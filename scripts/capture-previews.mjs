import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Font readiness is bounded below; external font servers must not stall screenshots.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const readJson = async (name, fallback) => {
  try { return JSON.parse(await readFile(path.join(root, name), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
};
const allLinks = await readJson('data/links.json', []);
const oldPreviews = await readJson('data/previews.json', []);
const linkStatuses = await readJson('data/link-status.json', []);
const statusesByUrl = new Map(linkStatuses.map(item => [item.url, item]));
const byId = new Map(oldPreviews.map(item => [item.id, item]));
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const retry = args.includes('--retry');
const slow = args.includes('--slow');
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const selected = allLinks.filter(item =>
  (!only || only.includes(item.id)) && (!retry || byId.get(item.id)?.state !== 'captured' || statusesByUrl.get(item.url)?.state !== 'ok')
).slice(0, limit);
await mkdir(path.join(root, 'output/playwright/captures'), { recursive: true });
await mkdir(path.join(root, 'assets/previews'), { recursive: true });
const browser = await chromium.launch({
  channel: process.env.PREVIEW_BROWSER || 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader']
});
let cursor = 0;
async function capture(link) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }, deviceScaleFactor: 0.5,
    locale: 'en-US', colorScheme: 'light', reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  let mainResponse = null;
  let navigationFailed = false;
  page.on('response', response => {
    if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) mainResponse = response;
  });
  const result = {
    id: link.id, url: link.url, checked_at: new Date().toISOString(),
    state: 'unavailable', reason: null, http_status: null
  };
  try {
    let response;
    try {
      response = await page.goto(link.url, { waitUntil: 'domcontentloaded', timeout: slow ? 45000 : 25000 });
    } catch (error) {
      if (!error.message.includes('Timeout') || page.url() === 'about:blank') {
        navigationFailed = true;
        throw error;
      }
    }
    await page.waitForTimeout(slow ? 16000 : 5500);
    result.http_status = (mainResponse || response)?.status() ?? null;
    await page.evaluate(() => Promise.race([
      document.fonts.ready, new Promise(resolve => setTimeout(resolve, 2000))
    ])).catch(() => {});
    result.resolved_url = page.url();
    result.page_title = await page.title();
    const text = await page.locator('body').innerText({ timeout: 4000 }).catch(() => '');
    const challenge = /just a moment|attention required|access denied|checking your browser|verify (you are|you're) human|website blocked|domain (is )?for sale|buy this domain|account suspended|404: NOT_FOUND|application error|page not found|site not found|403 forbidden/i;
    if (!result.http_status || result.http_status < 200 || result.http_status >= 300 || challenge.test(result.page_title) ||
      challenge.test(text.slice(0, 350))) {
      result.reason = result.http_status >= 400 ? 'HTTP ' + result.http_status : 'Access check or unavailable page';
    } else {
      const capturePath = path.join(root, 'output/playwright/captures', link.id + '.jpg');
      await page.screenshot({ path: capturePath, type: 'jpeg', quality: 64, scale: 'device', animations: 'disabled', timeout: 30000 });
      await copyFile(capturePath, path.join(root, 'assets/previews', link.id + '.jpg'));
      result.state = 'captured';
      result.image = 'assets/previews/' + link.id + '.jpg';
      result.captured_at = new Date().toISOString();
    }
    await writeFile(path.join(root, 'output/playwright/captures', link.id + '.json'),
      JSON.stringify({ ...result, excerpt: text.slice(0, 1500) }, null, 2));
  } catch (error) {
    result.reason = error.message.split('\n')[0];
    result.http_status = mainResponse?.status() ?? null;
    result.network_error = navigationFailed;
  } finally { await context.close(); }
  const previous = byId.get(link.id);
  if (result.state !== 'captured' && previous?.image && existsSync(path.join(root, previous.image))) {
    result.image = previous.image;
    result.captured_at = previous.captured_at;
  }
  byId.set(link.id, result);
  const previousStatus = statusesByUrl.get(link.url);
  const code = result.http_status;
  const blocked = [401, 403, 429].includes(code) || result.reason === 'Access check or unavailable page';
  const reachable = code >= 200 && code < 300 && !blocked && !result.network_error;
  statusesByUrl.set(link.url, {
    url: link.url,
    state: blocked ? 'restricted' : reachable ? 'ok' : 'failed',
    http_status: code,
    checked_at: new Date().toISOString(),
    last_ok: reachable ? new Date().toISOString().slice(0, 10) : previousStatus?.last_ok || null,
    check_method: 'browser'
  });
  console.log(link.id + ': checked');
}
try {
  await Promise.all(Array.from({ length: slow ? 2 : 3 }, async () => {
    while (cursor < selected.length) await capture(selected[cursor++]);
  }));
} finally {
  await browser.close();
  await writeFile(path.join(root, 'data/previews.json'),
    JSON.stringify(allLinks.map(link => byId.get(link.id)).filter(Boolean).map(({ reason, ...item }) => item), null, 2) + '\n');
  await writeFile(path.join(root, 'data/link-status.json'),
    JSON.stringify(allLinks.map(link => statusesByUrl.get(link.url)).filter(Boolean).map(({ error, ...item }) => item), null, 2) + '\n');
}
console.log('Preview capture finished: ' + selected.length + ' entries checked.');

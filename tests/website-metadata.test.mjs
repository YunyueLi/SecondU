import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, cp, rm, symlink, readdir } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homepageLanguageUrl, requestedSiteLanguage, siteMetadata } from '../website/site-metadata.mjs';
import { renderMetadata, renderWebsitePage } from '../website/build-site-metadata.mjs';
import { renderThemeBootstrap, themeBootstrapMarkup, themeColors } from '../website/theme-bootstrap.mjs';
import { copyShareCard } from '../website/build-share-card.mjs';

const source = await readFile(new URL('../website/index.html', import.meta.url), 'utf8');
const benchmarkSource = await readFile(new URL('../website/benchmark/index.html', import.meta.url), 'utf8');

test('both static documents expose their own language, canonical and consistent share metadata', () => {
  for (const language of ['zh', 'en']) {
    const metadata = siteMetadata(language);
    const html = renderWebsitePage(source, language);
    assert.ok(html.includes(`<html lang="${metadata.htmlLanguage}"`));
    assert.ok(html.includes(`<title>${metadata.title}</title>`));
    assert.ok(html.includes(`<link rel="canonical" href="${metadata.canonical}">`));
    for (const kind of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
      assert.ok(html.includes(`<meta ${kind} content="${metadata.description}">`));
    }
    assert.ok(html.includes('<link rel="alternate" hreflang="zh-CN" href="https://yunyueli.github.io/SecondU/">'));
    assert.ok(html.includes('<link rel="alternate" hreflang="en" href="https://yunyueli.github.io/SecondU/en.html">'));
    assert.ok(html.includes(metadata.noscript));
    assert.ok(html.includes('property="og:image" content="https://yunyueli.github.io/SecondU/assets/secondu-share.jpg"'));
    assert.ok(html.includes('property="og:image:type" content="image/jpeg"'));
    assert.ok(html.includes('property="og:image:width" content="1200"'));
    assert.ok(html.includes('property="og:image:height" content="630"'));
    assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
    assert.deepEqual([...html.matchAll(/(?:src|href)="([^\"]+\.(?:js|tsx|css))"/g)].map(match => match[1]), [...source.matchAll(/(?:src|href)="([^\"]+\.(?:js|tsx|css))"/g)].map(match => match[1]));
  }
  assert.notEqual(siteMetadata('zh').canonical, siteMetadata('en').canonical);
});

test('the development HTML fallback stays aligned with the shared Chinese metadata', () => {
  assert.ok(source.includes(renderMetadata('zh')));
  assert.throws(() => renderWebsitePage('<html></html>', 'en'), /metadata markers/);
});

test('legacy language queries override the static entry and retain unrelated query and hash', () => {
  assert.equal(requestedSiteLanguage('https://example.com/SecondU/en.html'), 'en');
  assert.equal(requestedSiteLanguage('https://example.com/SecondU/en.html?lang=zh#future'), 'zh');
  assert.equal(requestedSiteLanguage('https://example.com/SecondU/?lang=en#future'), 'en');
  assert.equal(requestedSiteLanguage('https://example.com/SecondU/?lang=invalid'), undefined);
  const english = homepageLanguageUrl('https://example.com/SecondU/index.html?ref=award&lang=zh#future', 'en');
  assert.equal(english.href, 'https://example.com/SecondU/en.html?ref=award&lang=en#future');
  const chinese = homepageLanguageUrl(english.href, 'zh');
  assert.equal(chinese.href, 'https://example.com/SecondU/?ref=award&lang=zh#future');
  assert.equal(homepageLanguageUrl('http://localhost:58711/en.html#capabilities', 'zh').href, 'http://localhost:58711/?lang=zh#capabilities');
});

test('theme bootstrap resolves saved, system and unavailable-storage states synchronously', () => {
  const script = themeBootstrapMarkup.match(/<script data-theme-bootstrap>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  for (const { stored, systemDark, expected } of [
    { stored: 'light', systemDark: true, expected: 'light' },
    { stored: 'dark', systemDark: false, expected: 'dark' },
    { stored: 'system', systemDark: true, expected: 'dark' },
    { stored: null, systemDark: false, expected: 'light' },
    { stored: 'invalid', systemDark: true, expected: 'dark' },
    { stored: new Error('storage blocked'), systemDark: true, expected: 'dark' },
  ]) {
    const documentElement = { dataset: {}, style: {} };
    let chromeColor;
    runInNewContext(script, {
      document: { documentElement, querySelector: () => ({ setAttribute: (_key, value) => { chromeColor = value; } }) },
      localStorage: { getItem: () => { if (stored instanceof Error) throw stored; return stored; } },
      matchMedia: () => ({ matches: systemDark }),
    });
    assert.equal(documentElement.dataset.theme, expected);
    assert.equal(documentElement.style.colorScheme, expected);
    assert.equal(chromeColor, themeColors[expected]);
  }
});

test('homepage and benchmark share the same synchronous bootstrap without changing benchmark metadata', () => {
  for (const html of [source, benchmarkSource]) {
    assert.ok(html.includes(themeBootstrapMarkup));
    assert.ok(!html.match(/<html[^>]*data-theme="light"/));
    assert.equal([...html.matchAll(/<script data-theme-bootstrap>/g)].length, 1);
    assert.equal(renderThemeBootstrap(html), html);
  }
  assert.ok(renderThemeBootstrap(benchmarkSource).includes('<title>SecondU — Context Benchmark</title>'));
  assert.ok(!renderThemeBootstrap(benchmarkSource).includes('data-site-page="home"'));
  assert.throws(() => renderThemeBootstrap('<head></head>'), /bootstrap markers/);
});

test('share card build copies only the reviewed image and provenance and rejects changed or linked input', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'secondu-share-card-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'project');
  const input = path.join(root, 'website/public/assets');
  const output = path.join(directory, 'output');
  await mkdir(input, { recursive: true });
  const publicAssets = fileURLToPath(new URL('../website/public/assets/', import.meta.url));
  for (const file of ['secondu-share.jpg', 'secondu-share.provenance.json']) await cp(path.join(publicAssets, file), path.join(input, file));
  await writeFile(path.join(input, 'not-allowed.txt'), 'Must not enter the published output.');
  await copyShareCard({ root, output });
  assert.deepEqual((await readdir(path.join(output, 'assets'))).sort(), ['secondu-share.jpg', 'secondu-share.provenance.json']);
  assert.deepEqual(await readFile(path.join(output, 'assets/secondu-share.jpg')), await readFile(path.join(publicAssets, 'secondu-share.jpg')));
  await writeFile(path.join(input, 'secondu-share.jpg'), 'changed');
  await assert.rejects(copyShareCard({ root, output }), /hash does not match/);
  await rm(path.join(input, 'secondu-share.jpg'));
  await symlink(path.join(publicAssets, 'secondu-share.jpg'), path.join(input, 'secondu-share.jpg'));
  await assert.rejects(copyShareCard({ root, output }), /regular public files/);
});

import fs from 'fs';
import os from 'os';
import path from 'path';

import client from 'util/client';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/cleanupPollutedText';
import {
  plan,
  apply,
  restore,
  matchPollutedText,
} from '../cleanupPollutedText';

async function getDoc(key) {
  const [, index, , id] = key.split('/');
  return (await client.get({ index, id }))._source;
}

const categoryOf = (text, field) => matchPollutedText(text, field)?.category;

describe('matchPollutedText', () => {
  it('classifies fixed texts', () => {
    expect(categoryOf('登入 Facebook', 'title')).toBe('login_wall');
    expect(
      categoryOf(
        'It looks like you were misusing this feature by going too fast.',
        'summary'
      )
    ).toBe('login_wall');
    expect(
      categoryOf(
        'Access denied | kknews.cc used Cloudflare to restrict access',
        'title'
      )
    ).toBe('bot_block');
    expect(categoryOf('  404 Not Found\n', 'title')).toBe('error_page');
    expect(categoryOf('SurveyCake', 'title')).toBe('site_boilerplate');
  });

  it('returns the matched rule alternative for batching', () => {
    expect(
      matchPollutedText('找不到與「 News 123」相關的文章或頁面', 'title')
    ).toEqual({
      category: 'error_page',
      pattern: '^找不到與「.*」相關的文章或頁面',
    });
  });

  it('skips FB accessibility nav bar before the fixed text', () => {
    expect(
      categoryOf(
        'Jump toPress alt + / to open this menuTo help personalise content, tailor and measure ads',
        'summary'
      )
    ).toBe('cookie_consent');
    expect(
      categoryOf(
        '跳到此頁面的區塊無障礙環境說明按 opt + / 可開啟這個功能表註冊Notice你必須登入以繼續。登入 Facebook',
        'summary'
      )
    ).toBe('login_wall');
  });

  it('keeps real content that merely mentions the fixed texts', () => {
    expect(
      matchPollutedText(
        '【錯誤】網傳截圖中出現 404 Not Found 與登入 Facebook',
        'title'
      )
    ).toBeNull();
    expect(matchPollutedText('Facebook 宣布新政策', 'title')).toBeNull();
    expect(matchPollutedText('', 'title')).toBeNull();
    expect(matchPollutedText(undefined, 'title')).toBeNull();
  });

  it('keeps long login walls followed by real page content for review', () => {
    expect(
      matchPollutedText(
        `登入 Facebook${'粉絲專頁的影片介紹'.repeat(50)}`,
        'summary'
      )
    ).toBeNull();
  });

  it('only clears site names in summary', () => {
    expect(matchPollutedText('衛生福利部食品藥物管理署', 'title')).toBeNull();
    expect(categoryOf('衛生福利部食品藥物管理署', 'summary')).toBe('site_name');
  });
});

describe('cleanupPollutedText', () => {
  let dir;
  beforeAll(async () => {
    await loadFixtures(fixtures);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanupPollutedText-'));
  });
  afterAll(async () => {
    await unloadFixtures(fixtures);
    fs.rmSync(dir, { recursive: true });
  });

  it('plans, applies gradually, skips docs changed by others and restores', async () => {
    const { candidates, batches } = await plan({ dir });

    // 4 "登入 Facebook" titles + site name in summary only
    expect(candidates).toBe(5);
    expect(
      batches.map(({ category, changes, byIndex }) => ({
        category,
        changes,
        byIndex,
      }))
    ).toEqual([
      {
        category: 'login_wall',
        changes: 4,
        byIndex: { urls: 2, articles: 1, replies: 1 },
      },
      { category: 'site_name', changes: 1, byIndex: { urls: 1 } },
    ]);
    const { batch } = batches[0];

    // Dry run does not write DB nor count as attempted
    const dryRun = await apply({ dir, batch, limit: 10, dryRun: true });
    expect(dryRun.changes).toBe(4);
    expect((await getDoc('/urls/doc/fb-login')).title).toBe('登入 Facebook');

    // Someone updates a doc after plan
    await client.update({
      index: 'urls',
      id: 'fb-login-2',
      doc: { title: '新抓到的正確標題' },
    });

    const first = await apply({ dir, batch, limit: 2, delayMs: 0 });
    expect(first).toMatchObject({ changes: 2, done: 1, skipped: 1 });
    expect(await getDoc('/urls/doc/fb-login')).toMatchObject({
      title: '',
      summary: '真正的貼文內容',
    });
    expect((await getDoc('/urls/doc/fb-login-2')).title).toBe(
      '新抓到的正確標題'
    );

    // Second run only processes the rest
    const second = await apply({ dir, batch, limit: 10, delayMs: 0 });
    expect(second).toMatchObject({ changes: 2, done: 2 });
    expect((await getDoc('/articles/doc/a1')).hyperlinks).toEqual([
      {
        url: 'https://www.facebook.com/page/posts/1',
        title: '',
        summary: '真正的貼文內容',
      },
      fixtures['/articles/doc/a1'].hyperlinks[1],
    ]);
    expect((await getDoc('/replies/doc/r1')).hyperlinks[0].title).toBe('');
    expect(await apply({ dir, batch, limit: 10, delayMs: 0 })).toMatchObject({
      changes: 0,
    });

    // Site name batch is untouched
    expect((await getDoc('/urls/doc/site-name')).summary).toBe(
      '衛生福利部食品藥物管理署'
    );

    const restored = await restore({ dir, batch, delayMs: 0 });
    expect(restored).toMatchObject({ changes: 3, done: 3 });
    expect((await getDoc('/urls/doc/fb-login')).title).toBe('登入 Facebook');
    expect((await getDoc('/articles/doc/a1')).hyperlinks).toEqual(
      fixtures['/articles/doc/a1'].hyperlinks
    );
    expect((await getDoc('/replies/doc/r1')).hyperlinks[0].title).toBe(
      '登入 Facebook'
    );
    expect((await getDoc('/urls/doc/fb-login-2')).title).toBe(
      '新抓到的正確標題'
    );
  });
});

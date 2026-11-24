import { classifyPollutedText, cleanScrapResult } from '../pollutedText';

describe('classifyPollutedText', () => {
  it('classifies fixed texts', () => {
    expect(classifyPollutedText('登入 Facebook')).toBe('login_wall');
    expect(
      classifyPollutedText(
        'It looks like you were misusing this feature by going too fast.'
      )
    ).toBe('login_wall');
    expect(
      classifyPollutedText(
        'Access denied | kknews.cc used Cloudflare to restrict access'
      )
    ).toBe('bot_block');
    expect(classifyPollutedText('  404 Not Found\n')).toBe('error_page');
    expect(classifyPollutedText('SurveyCake')).toBe('site_boilerplate');
  });

  it('skips FB accessibility nav bar before the fixed text', () => {
    expect(
      classifyPollutedText(
        'Jump toPress alt + / to open this menuTo help personalise content, tailor and measure ads'
      )
    ).toBe('cookie_consent');
    expect(
      classifyPollutedText(
        '跳到此頁面的區塊無障礙環境說明按 opt + / 可開啟這個功能表註冊Notice你必須登入以繼續。登入 Facebook'
      )
    ).toBe('login_wall');
  });

  it('keeps real content that merely mentions the fixed texts', () => {
    expect(
      classifyPollutedText(
        '【錯誤】網傳截圖中出現 404 Not Found 與登入 Facebook'
      )
    ).toBeNull();
    expect(classifyPollutedText('Facebook 宣布新政策')).toBeNull();
    expect(classifyPollutedText('')).toBeNull();
    expect(classifyPollutedText(undefined)).toBeNull();
  });

  it('keeps long login walls followed by real page content for review', () => {
    expect(
      classifyPollutedText(`登入 Facebook${'粉絲專頁的影片介紹'.repeat(50)}`)
    ).toBeNull();
  });
});

describe('site names', () => {
  it('are kept as title but cleared as summary', () => {
    expect(
      classifyPollutedText('衛生福利部食品藥物管理署', 'title')
    ).toBeNull();
    expect(classifyPollutedText('衛生福利部食品藥物管理署', 'summary')).toBe(
      'site_name'
    );
    expect(
      cleanScrapResult({ title: '[周刊王CTWANT]', summary: '[周刊王CTWANT]' })
    ).toEqual({ title: '[周刊王CTWANT]', summary: '' });
  });
});

describe('cleanScrapResult', () => {
  it('clears only polluted fields', () => {
    expect(
      cleanScrapResult({
        url: 'https://www.facebook.com/foo/posts/1',
        title: 'Facebook',
        summary: '真正的貼文內容',
        status: 200,
      })
    ).toEqual({
      url: 'https://www.facebook.com/foo/posts/1',
      title: '',
      summary: '真正的貼文內容',
      status: 200,
    });
  });
});

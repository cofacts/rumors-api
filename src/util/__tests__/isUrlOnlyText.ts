import { describe, it, expect } from '@jest/globals';
import isUrlOnlyText from '../isUrlOnlyText';

describe('isUrlOnlyText', () => {
  it('is true for bare links and links with a word or two', () => {
    expect(
      isUrlOnlyText('https://youtu.be/QoJeDjBfVFE?si=0waZA-_y1Ew2po-e')
    ).toBe(true);
    expect(
      isUrlOnlyText(
        'https://www.facebook.com/share/r/1ZmxzxF11i/?mibextid=wwXIfr\nhttps://youtu.be/abc'
      )
    ).toBe(true);
    expect(isUrlOnlyText('轉傳 https://youtu.be/abc 這是真的嗎？')).toBe(true);
  });

  it('is true when one link is a prefix of another', () => {
    expect(isUrlOnlyText('https://a.com https://a.com/bcdefghijklmn')).toBe(
      true
    );
    expect(
      isUrlOnlyText(
        'https://youtu.be/abcdefghijk https://youtu.be/abcdefghijk?si=zzzzzzzzzz'
      )
    ).toBe(true);
  });

  it('counts text glued right after a link as text', () => {
    expect(
      isUrlOnlyText(
        'https://example.com/a。這是真的嗎？請大家幫忙轉傳給更多人知道'
      )
    ).toBe(false);
    expect(
      isUrlOnlyText('https://youtu.be/abc看完記得分享給家人朋友這是真的')
    ).toBe(false);
  });

  it('is false for text without links, or with enough text besides them', () => {
    expect(isUrlOnlyText('')).toBe(false);
    expect(isUrlOnlyText(null)).toBe(false);
    expect(isUrlOnlyText('開票')).toBe(false);
    expect(
      isUrlOnlyText(
        '切記！6月1號開始取締行人違規！只要不走斑馬線，一律開罰 https://example.com/a'
      )
    ).toBe(false);
  });
});

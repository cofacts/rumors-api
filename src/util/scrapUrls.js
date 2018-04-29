/* eslint-env browser */

import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const readabilityJsStr = fs.readFileSync(
  path.join(__dirname, '../../node_modules/readability/Readability.js'),
  { encoding: 'utf-8' }
);

/**
 * Executed in puppeteer browser.
 * Don't instrument page.evaluate callbacks, or instrumented vars cov_xxxx will cause error!
 */
/* eslint-disable no-undef */
/* istanbul ignore next */
function executor() {
  return new Readability({}, document).parse();
}
/* eslint-enable no-undef */

/**
 * Return type for scrapUrls
 * @typedef {Object} ScrapResult
 * @property {string} canonical Canonical URL
 * @property {string} title
 * @property {string} summary
 * @property {string} html
 * @property {string} topImageUrl
 */

/**
 * Fetches the given url
 * @param {browser} browser - Puppeteer browser instance
 * @param {string} url - The URL to scrap
 * @return {Promise<ScrapResult>}
 */
async function scrap(browser, url) {
  const page = await browser.newPage();

  page.setDefaultNavigationTimeout(5000);
  try {
    await page.goto(url);
  } catch (e) {
    // Something like timeout. Do nothing.
  }

  const html = await page.content();

  // Don't instrument page.evaluate callbacks, or instrumented vars cov_xxxx will cause error!
  /* istanbul ignore next */
  const canonical = await page.evaluate(() => {
    const canonicalLink = document.querySelector('link[rel=canonical]');
    if (canonicalLink) return canonicalLink.href;

    const ogUrlMeta = document.querySelector('meta[property="og:url"]');
    if (ogUrlMeta) return ogUrlMeta.content;

    return window.location.href;
  });

  const resultArticle = await page.evaluate(`
    (function(){
      ${readabilityJsStr}
      ${executor}
      return executor();
    }())
  `);

  // If the whole page is empty due to any error, just return null
  if (!resultArticle) return null;

  // Don't instrument page.evaluate callbacks, or instrumented vars cov_xxxx will cause error!
  /* istanbul ignore next */
  const topImageUrl = await page.evaluate(contentHTML => {
    const ogImageMeta = document.querySelector(
      'meta[property="og:image"], meta[property="og:image:url"]'
    );
    if (ogImageMeta) return ogImageMeta.content;

    const containerDiv = document.createElement('div');
    containerDiv.innerHTML = contentHTML;
    const contentImgs = Array.from(containerDiv.querySelectorAll('img'));
    if (contentImgs.length === 0) return '';

    const largestImg = contentImgs.slice(1).reduce((largestImage, img) => {
      return largestImage.width * largestImage.height >= img.width * img.height
        ? largestImage
        : img;
    }, contentImgs[0]);

    // src may be relative URL, resolve with current location.
    return new URL(largestImg.src, location.href).href;
  }, resultArticle.content);

  return {
    canonical,
    title: resultArticle.title,
    summary: resultArticle.textContent.trim(),
    topImageUrl,
    html,
  };
}

/**
 * Fetches the specified url data from cache or through scrapping
 *
 * @param {string[]} urls
 * @param {object} options
 * @param {boolean} options.cacheLoader - The dataloader that loads result from `urls`, given a URL.
 *                                        If not given, scrapUrls don't read `urls` cache.
 * @param {boolean} options.noFetch - If true, return null when cache does not hit. Default: false.
 * @return {Promise<ScrapResult[]>} - If cannot scrap, resolves to null
 */
async function scrapUrls(urls, { cacheLoader, noFetch = false } = {}) {
  let browserPromise;

  const result = await Promise.all(
    urls.map(async url => {
      if (cacheLoader) {
        const result = await cacheLoader.load(url);
        if (result) return result;
      }

      if (noFetch) return null;

      // Lazily instantiate puppeteer
      if (!browserPromise) browserPromise = puppeteer.launch();

      return scrap(await browserPromise, url);
    })
  );

  // Cleanup browser if opened
  if (browserPromise) {
    (await browserPromise).close();
  }

  return result;
}

export default scrapUrls;

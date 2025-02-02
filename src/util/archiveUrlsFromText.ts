/** Extract URLs from text and send to Internet Archive Wayback Machine */

import urlRegex from 'url-regex';
import { removeFBCLIDIfExist } from './scrapUrls';

export default async function archiveUrlsFromText(text: string) {
  const originalUrls = text.match(urlRegex()) || [];
  if (originalUrls.length === 0) return [];

  // Normalize URLs before sending to cache or scrapper to increase cache hit
  //
  const normalizedUrls = removeFBCLIDIfExist(originalUrls);

  const results = await Promise.all(
    normalizedUrls.map(async (url) => {
      const formData = new FormData();
      formData.append('url', url);
      formData.append('capture_screenshot', '1');
      formData.append('skip_first_archive', '1');
      formData.append('delay_wb_availability', '1'); // Help reduce load on IA servers

      return (
        await fetch('https://web.archive.org/save', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `LOW ${process.env.INTERNET_ARCHIVE_S3_ACCESS_KEY}:${process.env.INTERNET_ARCHIVE_S3_SECRET_KEY}`,
          },
          body: formData,
        })
      ).json();
    })
  );

  console.info(`[archiveUrlsFromText] Archiving ${results.length} URLs`);
  results.forEach((result, i) => {
    if (result.job_id) {
      console.info(`[archiveUrlsFromText] [ ${result.url} ]: ${result.job_id}`);
    } else {
      console.error(
        `[archiveUrlsFromText] [ ${normalizedUrls[i]} ]: ${JSON.stringify(
          result
        )}`
      );
    }
  });
  return results;
}

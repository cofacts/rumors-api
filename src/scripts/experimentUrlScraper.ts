/**
 * Script to test URL scraping using Gemini urlContext tool.
 *
 * Usage:
 *   npx tsx src/scripts/experimentUrlScraper.ts \
 *     --runName "url-scraper-experiment-1" \
 *     [--urls "https://example.com,https://another-site.com"] \
 *     [--single "https://single-test-url.com"]
 *
 * Required args:
 *   --runName: Name to identify this experiment run in Langfuse
 *
 * Optional args:
 *   --urls: Comma-separated list of URLs to test
 *   --single: Single URL to test (alternative to --urls)
 */
import 'dotenv/config';
import yargs from 'yargs';

import scrapeUrlsWithGemini from '../util/geminiUrlScraper.js';
import langfuse from 'util/langfuse';

// Default test URLs for experimentation
const DEFAULT_TEST_URLS = [
  'https://www.cofacts.tw',
  'https://github.com/cofacts/rumors-api',
  'https://www.taiwannews.com.tw/en/news/5023456',
];

async function main({
  urls,
  single,
  runName,
}: {
  urls?: string;
  single?: string;
  runName: string;
}) {
  let testUrls: string[];
  
  if (single) {
    testUrls = [single];
  } else if (urls) {
    testUrls = urls.split(',').map(url => url.trim()).filter(Boolean);
  } else {
    testUrls = DEFAULT_TEST_URLS;
    console.info('No URLs specified, using default test URLs:', testUrls);
  }

  if (testUrls.length === 0) {
    console.info('No valid URLs to process. Exiting.');
    return;
  }
  console.info(`Testing URL scraping with ${testUrls.length} URLs`);

  const trace = langfuse.trace({
    name: `URL Scraper Experiment: ${runName}`,
    input: testUrls,
    metadata: { 
      experimentType: 'url-scraping',
      tool: 'gemini-urlcontext',
      urlCount: testUrls.length,
    },
  });

  try {
    console.info('Starting URL scraping...');
    const startTime = Date.now();
    
    const results = await scrapeUrlsWithGemini(testUrls);
    
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.info(`\n=== RESULTS ===`);
    console.info(`Processed ${results.length} URLs in ${duration}ms`);
    console.info(`Average time per URL: ${Math.round(duration / results.length)}ms\n`);

    results.forEach((result, index) => {
      console.info(`--- URL ${index + 1}: ${result.url} ---`);
      console.info(`Status: ${result.status}`);
      
      if (result.status === 'SUCCESS') {
        console.info(`Title: ${result.title || 'N/A'}`);
        console.info(`Summary: ${result.summary ? result.summary.substring(0, 200) + '...' : 'N/A'}`);
        console.info(`Top Image: ${result.topImageUrl || 'N/A'}`);
      } else {
        console.info(`Error: ${result.error}`);
      }
      console.info('');
    });

    // Count success/failure rates
    const successCount = results.filter(r => r.status === 'SUCCESS').length;
    const errorCount = results.filter(r => r.status === 'ERROR').length;
    
    console.info('=== SUMMARY ===');
    console.info(`Success rate: ${successCount}/${results.length} (${Math.round(successCount / results.length * 100)}%)`);
    console.info(`Error rate: ${errorCount}/${results.length} (${Math.round(errorCount / results.length * 100)}%)`);
    console.info(`Total processing time: ${duration}ms`);

    // Record results in Langfuse
    trace.update({
      output: results,
      metadata: {
        successCount,
        errorCount,
        totalDuration: duration,
        averageDurationPerUrl: Math.round(duration / results.length),
      },
    });

    // Score the experiment based on success rate
    trace.score({
      name: 'success-rate',
      value: successCount / results.length,
      comment: `${successCount} successful out of ${results.length} URLs`,
    });

    // Score based on average processing time (lower is better, normalize to 0-1)
    const avgTimePerUrl = duration / results.length;
    const timeScore = Math.max(0, 1 - (avgTimePerUrl / 10000)); // Penalize if >10s per URL
    trace.score({
      name: 'processing-speed',
      value: timeScore,
      comment: `Average ${Math.round(avgTimePerUrl)}ms per URL`,
    });

  } catch (error) {
    console.error('Experiment failed:', error);
    trace.update({
      output: { error: error.message },
    });
    trace.score({
      name: 'success-rate',
      value: 0,
      comment: `Experiment failed: ${error.message}`,
    });
  }

  await langfuse.flushAsync();
}

/* istanbul ignore if */
if (require.main === module) {
  const argv = yargs
    .options({
      runName: {
        description: 'Name to identify this experiment run in Langfuse',
        type: 'string',
        demandOption: true,
      },
      urls: {
        description: 'Comma-separated list of URLs to test',
        type: 'string',
      },
      single: {
        description: 'Single URL to test (alternative to --urls)',
        type: 'string',
      },
    })
    .help('help')
    .parseSync();

  main(argv).catch(console.error);
}

export default main;
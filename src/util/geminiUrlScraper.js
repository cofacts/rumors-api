import { GoogleGenAI } from '@google/genai';
import { GoogleAuth } from 'google-auth-library';
import rollbar from '../rollbarInstance';

// Singleton client for reuse across requests
let genAI;

async function getGenAIClient() {
  if (genAI) return genAI;

  const project = await new GoogleAuth().getProjectId();
  genAI = new GoogleGenAI({
    vertexai: true,
    project,
    location: 'us-central1', // Using us-central1 for better availability
  });
  return genAI;
}

/**
 * Scrapes URL content using Gemini's urlContext tool
 * 
 * @param {string[]} urls - Array of URLs to scrape
 * @returns {Promise<Array<{url: string, canonical?: string, title?: string, summary?: string, topImageUrl?: string, html?: string, status: string, error?: string}>>}
 */
export default async function scrapeUrlsWithGemini(urls) {
  if (!urls || urls.length === 0) {
    return [];
  }

  const genAIClient = await getGenAIClient();

  try {
    // Process all URLs in a single LLM call for efficiency
    const urlList = urls.map((url, index) => `${index + 1}. ${url}`).join('\n');
    
    const generateContentArgs = {
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Please analyze the content at these URLs and extract information from each:

${urlList}

For each URL, extract and return a JSON array with objects having the following structure (no markdown formatting, no extra text):
[
  {
    "url": "original URL from the list",
    "canonical": "canonical URL if different from original, or same as original",
    "title": "The main title of the page",
    "summary": "A comprehensive summary of the content that captures the key information for fact-checking purposes",
    "topImageUrl": "URL of the most representative image on the page, or null if none exists"
  }
]

Requirements:
- url: Return the exact original URL from the input list
- canonical: Extract the canonical URL from meta tags or use the original URL if no canonical is found
- title: Extract the main page title
- summary: Should be detailed enough for search and fact-checking, capturing all important claims and information
- topImageUrl: Find the most representative image (not logos, ads, or decorative images), return null if no suitable image exists
- Return valid JSON array only, no markdown code blocks or explanations
- Process all URLs and return results for each, even if some fail`,
            },
          ],
        },
      ],
      config: {
        tools: [{ urlContext: {} }],
        systemInstruction: 'You are a web content analyzer that extracts structured information from web pages for fact-checking purposes.',
        responseModalities: ['TEXT'],
        temperature: 0.1, // Low temperature for consistent extraction
        maxOutputTokens: 4096,
      },
    };

    const response = await genAIClient.models.generateContent(generateContentArgs);
    
    if (!response.candidates || !response.candidates[0]) {
      throw new Error('No response candidates received');
    }

    const responseText = response.candidates[0].content.parts[0].text;
    
    // Parse the JSON response
    let extractedDataArray;
    try {
      // Clean the response text to extract JSON array
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        extractedDataArray = JSON.parse(jsonMatch[0]);
      } else {
        extractedDataArray = JSON.parse(responseText);
      }
    } catch (parseError) {
      console.warn('[geminiUrlScraper] Failed to parse JSON response:', responseText);
      // Fallback: create error results for all URLs
      return urls.map(url => ({
        url,
        canonical: url,
        title: null,
        summary: 'Unable to extract structured content',
        topImageUrl: null,
        html: '',
        status: 'ERROR',
        error: 'Failed to parse LLM response',
      }));
    }

    // Ensure we have results for all input URLs
    const results = urls.map(url => {
      const extracted = extractedDataArray.find(item => item.url === url) || {};
      return {
        url,
        canonical: extracted.canonical || url,
        title: extracted.title || null,
        summary: extracted.summary || null,
        topImageUrl: extracted.topImageUrl || null,
        html: '', // Leave empty as requested
        status: 'SUCCESS',
      };
    });

    return results;

  } catch (error) {
    console.error('[geminiUrlScraper] Error processing URLs:', error);
    
    rollbar.error('Gemini URL scraping error', {
      urls,
      error: error.message,
    });

    // Return error results for all URLs
    return urls.map(url => ({
      url,
      canonical: url,
      title: null,
      summary: null,
      topImageUrl: null,
      html: '',
      status: 'ERROR',
      error: error.message,
    }));
  }
}
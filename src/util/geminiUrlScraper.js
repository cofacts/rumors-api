import { GoogleGenAI } from '@google/genai';
import { GoogleAuth } from 'google-auth-library';
import rollbar from '../rollbarInstance';

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

  const project = await new GoogleAuth().getProjectId();
  const genAI = new GoogleGenAI({
    vertexai: true,
    project,
    location: 'us-central1', // Using us-central1 for better availability
  });

  const results = [];

  // Process URLs one by one to avoid overwhelming the API
  for (const url of urls) {
    try {
      const generateContentArgs = {
        model: 'gemini-2.0-flash-001',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Please analyze the content at this URL: ${url}

Extract and return ONLY a JSON object with the following structure (no markdown formatting, no extra text):
{
  "title": "The main title of the page",
  "summary": "A comprehensive summary of the content that captures the key information for fact-checking purposes",
  "topImageUrl": "URL of the most representative image on the page, or null if none exists"
}

Requirements:
- title: Extract the main page title
- summary: Should be detailed enough for search and fact-checking, capturing all important claims and information
- topImageUrl: Find the most representative image (not logos, ads, or decorative images), return null if no suitable image exists
- Return valid JSON only, no markdown code blocks or explanations`,
              },
            ],
          },
        ],
        tools: [
          {
            functionDeclarations: [
              {
                name: 'url_context',
                description: 'Retrieves content from the specified URL',
                parameters: {
                  type: 'object',
                  properties: {
                    url: {
                      type: 'string',
                      description: 'The URL to retrieve content from',
                    },
                  },
                  required: ['url'],
                },
              },
            ],
          },
        ],
        config: {
          systemInstruction: 'You are a web content analyzer that extracts structured information from web pages for fact-checking purposes.',
          responseModalities: ['TEXT'],
          temperature: 0.1, // Low temperature for consistent extraction
          maxOutputTokens: 2048,
        },
      };

      const response = await genAI.models.generateContent(generateContentArgs);
      
      if (!response.candidates || !response.candidates[0]) {
        throw new Error('No response candidates received');
      }

      const responseText = response.candidates[0].content.parts[0].text;
      
      // Parse the JSON response
      let extractedData;
      try {
        // Clean the response text to extract JSON
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          extractedData = JSON.parse(jsonMatch[0]);
        } else {
          extractedData = JSON.parse(responseText);
        }
      } catch (parseError) {
        console.warn('[geminiUrlScraper] Failed to parse JSON response:', responseText);
        extractedData = {
          title: null,
          summary: responseText.trim() || 'Unable to extract structured content',
          topImageUrl: null,
        };
      }

      results.push({
        url,
        canonical: url, // Use original URL as canonical for now
        title: extractedData.title || null,
        summary: extractedData.summary || null,
        topImageUrl: extractedData.topImageUrl || null,
        html: '', // Leave empty as requested
        status: 'SUCCESS',
      });

    } catch (error) {
      console.error('[geminiUrlScraper] Error processing URL:', url, error);
      
      rollbar.error('Gemini URL scraping error', {
        url,
        error: error.message,
      });

      results.push({
        url,
        canonical: url,
        title: null,
        summary: null,
        topImageUrl: null,
        html: '',
        status: 'ERROR',
        error: error.message,
      });
    }
  }

  return results;
}
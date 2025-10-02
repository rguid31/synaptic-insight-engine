import axios from 'axios';
import { load } from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { transformStructuredData } from '../lib/utils.js';

export const transformStructuredData = (data) => {
    if (!data || !Array.isArray(data)) {
        return {};
    }
    return data.reduce((obj, item) => {
        if (item && item.section) {
            obj[item.section] = item.content;
        }
        return obj;
    }, {});
};

export default async (req, res) => {
    try {
        console.log("Function started. Checking for API key...");
        if (!process.env.GEMINI_API_KEY) {
            console.error("CRITICAL: GEMINI_API_KEY is not defined.");
            return res.status(500).json({ error: 'Server configuration error: API key is missing.' });
        }
        console.log("API key found.");

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        console.log("AI Model initialized.");

        if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

        let { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });
        
        console.log(`Received URL: ${url}`);

        // Normalize arXiv URLs
        if (url.includes('arxiv.org')) {
            if (url.includes('/html/')) {
                url = url.replace('/html/', '/abs/').replace(/\.pdf$/, '');
                console.log(`Converted arXiv HTML URL to: ${url}`);
            } else if (url.includes('/pdf/')) {
                url = url.replace('/pdf/', '/abs/').replace(/\.pdf$/, '');
                console.log(`Converted arXiv PDF URL to: ${url}`);
            } else if (url.includes('/abs/')) {
                url = url.replace(/\.pdf$/, '');
                console.log(`Cleaned arXiv ABS URL to: ${url}`);
            }
        }

        console.log(`Attempting to scrape content from: ${url}`);
        let html;
        let retries = 2;
        let attempt = 0;
        while (attempt <= retries) {
            try {
                const response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Connection': 'keep-alive'
                    },
                    timeout: 15000 // Increased for Vercel
                });

                const contentType = response.headers['content-type'] || '';
                if (!contentType.includes('text/html')) {
                    console.error(`Invalid Content-Type: ${contentType}`);
                    return res.status(400).json({ error: 'Invalid content: The URL points to a non-HTML resource (e.g., PDF). Please use an arXiv abstract page (e.g., https://arxiv.org/abs/2307.12008).' });
                }

                html = response.data;
                console.log(`Scraping successful. Response length: ${html.length}`);
                break;
            } catch (axiosError) {
                attempt++;
                console.error(`Axios Error (Attempt ${attempt}):`, axiosError.message);
                if (axiosError.response) {
                    console.error('Response Status:', axiosError.response.status);
                    if (axiosError.response.status === 404) {
                        return res.status(400).json({ error: 'URL not found: The page does not exist. Please check the URL (e.g., https://arxiv.org/abs/2307.12008).' });
                    } else if (axiosError.response.status === 403) {
                        return res.status(400).json({ error: 'Access denied: The site may require authentication or block automated requests.' });
                    } else if (axiosError.response.status === 429) {
                        return res.status(429).json({ error: 'Rate limited: Too many requests to the site. Try again later.' });
                    }
                }
                if (attempt > retries) {
                    throw new Error('Could not access this URL after multiple attempts.');
                }
                console.log(`Retrying... (${attempt}/${retries})`);
            }
        }

        let $;
        try {
            $ = load(html);
        } catch (cheerioError) {
            console.error('Cheerio Error:', cheerioError.message);
            throw new Error('Failed to parse HTML content.');
        }

        let scrapedText = '';

        // Enhanced extraction for research papers - structured approach
        let extractedData = {};

        if ($('.abstract').length || $('#abstract').length) {
            // Extract title
            const titleElement = $('h1, .title, .article-title, .ltx_title, .citation_title').first();
            extractedData.title = titleElement.text().trim() || 'Title not found';

            // Extract authors
            const authorsElement = $('.authors, .author, .ltx_authors, .citation_author');
            let authorsText = '';
            if (authorsElement.length) {
                authorsText = authorsElement.text().trim();
            }
            extractedData.authors = authorsText || 'Authors not found';

            // Extract abstract
            const abstractElement = $('.abstract, #abstract');
            extractedData.abstract = abstractElement.text().trim() || 'Abstract not found';

            // Extract publication info (arXiv specific)
            const arxivId = url.match(/arxiv\.org\/abs\/([^\/]+)/);
            if (arxivId) {
                extractedData.arxiv_id = arxivId[1];
                extractedData.venue = 'arXiv';
            }

            // Extract subjects/categories
            const subjectElement = $('.tablecell.subjects, .subj-class');
            if (subjectElement.length) {
                extractedData.subjects = subjectElement.text().trim();
            }

            // Extract full content for analysis (combining key sections)
            scrapedText = `Title: ${extractedData.title}\nAuthors: ${extractedData.authors}\nAbstract: ${extractedData.abstract}`;

            if (extractedData.subjects) {
                scrapedText += `\nSubjects: ${extractedData.subjects}`;
            }

            console.log('Extracted structured academic paper content');
        } else if ($('article').length) {
            // Try to get full paper content for analysis
            const titleText = $('h1, .title, .article-title').first().text();
            const abstractText = $('article .abstract, article #abstract').text();
            const bodyText = $('article').text();
            scrapedText = abstractText ? `Title: ${titleText}\n\nAbstract: ${abstractText}\n\nFull Content: ${bodyText}` : `Title: ${titleText}\n\n${bodyText}`;
            console.log('Extracted full article content');
        } else if ($('main').length) {
            scrapedText = $('main').text();
            console.log('Extracted text from main');
        } else {
            scrapedText = $('body').text();
            console.log('Extracted text from body (fallback)');
        }
        
        scrapedText = scrapedText.replace(/\s\s+/g, ' ').trim();
        
        if (!scrapedText || scrapedText.length < 100) {
            console.error('Scraped text too short:', scrapedText.length);
            throw new Error('Failed to scrape meaningful text from the page.');
        }
        console.log(`Scraped text length: ${scrapedText.length}`);

        // First, extract structured data from the paper
        const structuredPrompt = `Extract structured information from this research paper and return ONLY a valid JSON array following this exact format:

[
  {
    "section": "title",
    "content": "extracted title here"
  },
  {
    "section": "authors",
    "content": {
      "main": "main institution or first author",
      "contributors": ["author1", "author2", "..."]
    }
  },
  {
    "section": "abstract",
    "content": "extracted abstract here"
  },
  {
    "section": "publication_info",
    "content": {
      "year": extracted_year_or_null,
      "venue": "venue name",
      "identifier": "paper identifier",
      "publisher": "publisher name"
    }
  },
  {
    "section": "keywords",
    "content": ["keyword1", "keyword2", "keyword3"]
  },
  {
    "section": "methods",
    "content": ["method1", "method2", "method3"]
  },
  {
    "section": "results",
    "content": ["result1", "result2", "result3"]
  },
  {
    "section": "limitations",
    "content": ["limitation1", "limitation2", "limitation3"]
  }
]

Extract information from this text: ${scrapedText}`;

        let structuredData;
        let structuredText;
        try {
            console.log('Extracting structured data...');
            const structuredResult = await model.generateContent([structuredPrompt]);
            structuredText = structuredResult.response.text();
            const jsonMatch = structuredText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                structuredData = JSON.parse(jsonMatch[0]);
                console.log('Structured data extracted successfully');
            } else {
                console.error('Failed to find JSON array in structured data response. Raw response:', structuredText);
                structuredData = null;
            }
        } catch (structuredError) {
            console.error('Structured extraction failed:', structuredError.message);
            if (structuredText) {
                console.error('Raw response that caused error:', structuredText);
            }
            structuredData = null;
        }

        const systemPrompt = `You are a highly analytical AI assistant for the "Synaptic Insight Engine." Your task is to analyze the provided research paper text and extract key information about potential exploits, scientific opportunities, knowledge gaps, and growth models.

        Analyze the following research paper content and respond ONLY with a valid JSON object. Do not include any explanatory text, comments, or markdown formatting like \`\`\`json.

        The JSON object must have these six keys: "exploits", "opportunities", "gaps", "models", "ethical_concerns", "reproducibility_issues".
        - Each key must have an array of objects as its value.
        - Provide 5-7 detailed, actionable findings per category.
        - Each finding must be an object with the following structure:
        {
          "rank": 1-5 (1=highest priority, 5=lowest priority),
          "status": "CRITICAL" | "HIGH" | "MODERATE" | "LOW",
          "confidence": 0.0-1.0 (confidence in this finding),
          "tags": ["tag1", "tag2"],
          "finding": "detailed explanation with exact quotes"
        }

        - "exploits": Identify unsubstantiated claims, methodological flaws, overstated conclusions, conflicts of interest, or misleading statistical presentations. Tags should include: ["methodology", "claims", "peer-review", "statistics", "conflicts"]. Rank by severity of the flaw.

        - "opportunities": Identify core scientific principles, technologies, or methodologies with legitimate research/commercial potential. Tags should include: ["technology", "commercial", "research", "innovation", "scalability"]. Rank by market/research potential.

        - "gaps": Identify missing elements such as control groups, statistical significance, replication studies, long-term data, sample size issues. Tags should include: ["controls", "statistics", "validation", "data", "methodology"]. Rank by impact on research validity.

        - "models": Identify mathematical models, growth patterns, performance metrics, theoretical frameworks. Tags should include: ["mathematical", "predictive", "performance", "theoretical", "quantitative"]. Rank by model sophistication and applicability.

        - "ethical_concerns": Identify ethical issues, bias, privacy concerns, social implications, fairness issues. Tags should include: ["bias", "privacy", "fairness", "social-impact", "ethics-review"]. Rank by potential societal harm.

        - "reproducibility_issues": Identify missing implementation details, insufficient data sharing, unclear procedures, validation gaps. Tags should include: ["code-availability", "data-sharing", "procedures", "parameters", "validation"]. Rank by impact on reproducibility.`;

        let aiResponseText;
        try {
            console.log('Sending text to Gemini API for analysis...');
            const result = await model.generateContent([systemPrompt, scrapedText]);
            aiResponseText = result.response.text();
            console.log('Received analysis from Gemini API.');
        } catch (aiError) {
            console.error('--- ERROR DURING GEMINI API CALL ---');
            console.error('AI Error Message:', aiError.message);
            throw new Error(`Gemini API Error: ${aiError.message}`);
        }
        
        console.log('Attempting to parse JSON...');
        let analysisResult;
        try {
            const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('invalid JSON: No JSON object found in AI response.');
            analysisResult = JSON.parse(jsonMatch[0]);
            console.log('JSON parsed successfully.');
        } catch (parseError) {
            console.error('JSON parsing failed:', parseError.message);
            throw new Error('invalid JSON: ' + parseError.message);
        }
        
        console.log('Sending final successful response.');
        res.status(200).json({
            sourceText: scrapedText,
            structuredData: transformStructuredData(structuredData),
            analysis: analysisResult
        });

    } catch (error) {
        console.error('--- A CRITICAL ERROR OCCURRED IN THE MAIN FUNCTION ---');
        console.error('Error Message:', error.message);
        
        let userErrorMessage = 'An unknown server error occurred.';
        if (error.isAxiosError) {
            userErrorMessage = error.message;
        } else if (error.message.includes('Failed to scrape')) {
            userErrorMessage = 'Could not extract readable text from this URL. The site structure is too complex for the scraper.';
        } else if (error.message.includes('invalid JSON')) {
            userErrorMessage = 'The AI returned a response that could not be understood.';
        } else if (error.message.includes('Gemini API Error')) {
            userErrorMessage = 'The AI analysis failed. This may be a temporary issue with the API.';
        } else if (error.message.includes('Failed to parse HTML')) {
            userErrorMessage = 'Failed to parse the page content. Please ensure the URL points to a valid HTML page.';
        }

        res.status(500).json({ error: userErrorMessage });
    }
};
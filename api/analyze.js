import axios from 'axios';
import { load } from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
        if ($('.abstract').length) {
            scrapedText = $('.abstract').text();
            console.log('Extracted text from .abstract');
        } else if ($('#abstract').length) {
            scrapedText = $('#abstract').text();
            console.log('Extracted text from #abstract');
        } else if ($('article').length) {
            scrapedText = $('article').text();
            console.log('Extracted text from article');
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

        const systemPrompt = `You are a highly analytical AI assistant for the "Synaptic Insight Engine." Your task is to analyze the provided text from a scientific paper or tech case study. Your goal is to identify potential exploits, opportunities, knowledge gaps, and underlying growth models.
        Analyze the following text and respond ONLY with a valid JSON object. Do not include any explanatory text, comments, or markdown formatting like \`\`\`json.
        The JSON object must have these four keys: "exploits", "opportunities", "gaps", "models".
        - Each key must have an array of strings as its value.
        - "exploits": Identify hyperbolic buzzwords, claims that lack evidence (e.g., "secret formula," "data is confidential"), and red flags that suggest marketing over science. Each finding should be a complete sentence and include the exact quote it's based on, like: 'The claim of a "secret formula" is an exploit because it lacks scientific transparency.'
        - "opportunities": Identify the core technology or scientific principle that has legitimate potential, even if the claims are exaggerated. Each finding should be a complete sentence and include the exact quote it's based on.
        - "gaps": Identify what's missing, such as a lack of peer-reviewed data, an unexplained scientific mechanism, or missing trial information. Each finding should be a complete sentence and include the exact quote or concept it's based on.
        - "models": Identify any phrases that suggest a specific type of growth or improvement model (e.g., "exponential growth," "10x improvement"). Each finding should be a complete sentence and include the exact quote it's based on.`;

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
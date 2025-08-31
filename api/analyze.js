const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- AI SETUP ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
// --- END AI SETUP ---

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    let { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        // --- SMART URL FIX ---
        if (url.includes('arxiv.org/abs/')) {
            console.log('arXiv abstract URL detected. Converting to HTML version.');
            url = url.replace('/abs/', '/html/');
        }
        // --- END SMART URL FIX ---

        // --- STEP 1: SCRAPE THE TEXT ---
        console.log(`Scraping content from: ${url}`);
        const { data: html } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });
        const $ = cheerio.load(html);

        let scrapedText = '';
        // Prioritize specific, content-rich tags for better accuracy
        if ($('.abstract').length) {
            scrapedText = $('.abstract').text();
        } else if ($('article').length) {
            scrapedText = $('article').text();
        } else if ($('main').length) {
            scrapedText = $('main').text();
        } else {
            scrapedText = $('body').text();
        }
        
        scrapedText = scrapedText.replace(/\s\s+/g, ' ').trim();
        
        // Added a length check for more robust error handling
        if (!scrapedText || scrapedText.length < 100) {
            throw new Error('Failed to scrape any meaningful text from the URL.');
        }

        console.log(`Scraping successful. Text length: ${scrapedText.length}`);

        // --- STEP 2: ANALYZE WITH GEMINI AI ---
        const systemPrompt = `
            You are a highly analytical AI assistant for the "Synaptic Insight Engine." Your task is to analyze the provided text from a scientific paper or tech case study. Your goal is to identify potential exploits, opportunities, knowledge gaps, and underlying growth models.

            Analyze the following text and respond ONLY with a valid JSON object. Do not include any explanatory text, comments, or markdown formatting like \`\`\`json.

            The JSON object must have these four keys: "exploits", "opportunities", "gaps", "models".
            - Each key must have an array of strings as its value.
            - "exploits": Identify hyperbolic buzzwords, claims that lack evidence (e.g., "secret formula," "data is confidential"), and red flags that suggest marketing over science. Each finding should be a complete sentence and include the exact quote it's based on, like: 'The claim of a "secret formula" is an exploit because it lacks scientific transparency.'
            - "opportunities": Identify the core technology or scientific principle that has legitimate potential, even if the claims are exaggerated. Each finding should be a complete sentence and include the exact quote it's based on.
            - "gaps": Identify what's missing, such as a lack of peer-reviewed data, an unexplained scientific mechanism, or missing trial information. Each finding should be a complete sentence and include the exact quote or concept it's based on.
            - "models": Identify any phrases that suggest a specific type of growth or improvement model (e.g., "exponential growth," "10x improvement"). Each finding should be a complete sentence and include the exact quote it's based on.
        `;
        
        console.log('Sending text to Gemini API for analysis...');
        const result = await model.generateContent([systemPrompt, scrapedText]);
        const aiResponseText = result.response.text();
        console.log('Received analysis from Gemini API.');

        let analysisResult;
        try {
            analysisResult = JSON.parse(aiResponseText);
        } catch (e) {
            console.error('Failed to parse JSON from AI response:', aiResponseText);
            // Throw a new, more specific error to be caught by our main catch block.
            throw new Error('AI returned an invalid response format.');
        }
        
        // --- STEP 3: SEND THE RESULT BACK ---
        res.status(200).json({
            sourceText: scrapedText,
            analysis: analysisResult
        });

    } catch (error) {
        // Log the full error for server-side debugging
        console.error('Error in /api/analyze function:', error); 

        // Craft a more user-friendly error message
        let userErrorMessage = 'An unknown error occurred during analysis.';
        if (error.response && error.response.status === 404) {
            userErrorMessage = 'Could not find the requested URL (404 Not Found). Please check the link.';
        } else if (error.code === 'ENOTFOUND') {
            userErrorMessage = 'Could not resolve the domain name. Please check the URL and try again.';
        } else if (error.message.includes('AI returned an invalid response format')) {
            userErrorMessage = 'The AI failed to structure its analysis correctly. This can happen with very complex or unusual articles.';
        } else if (error.message.includes('Failed to scrape any meaningful text')) {
            userErrorMessage = 'Could not extract readable text from this URL. The site may be too complex or block automated scraping.';
        }
        
        res.status(500).json({ error: userErrorMessage });
    }
};


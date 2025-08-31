const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- AI SETUP ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
// --- END AI SETUP ---

// This is the main function Vercel will run when the /api/analyze endpoint is called
module.exports = async (req, res) => {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    let { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        // --- SMART URL FIX ---
        // If the user provides an abstract link from arXiv, convert it to the HTML version
        if (url.includes('arxiv.org/abs/')) {
            console.log('arXiv abstract URL detected. Converting to HTML version.');
            url = url.replace('/abs/', '/html/');
        }
        // --- END SMART URL FIX ---

        // --- STEP 1: SCRAPE THE TEXT ---
        console.log(`Scraping content from: ${url}`);
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });
        const html = response.data;
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

        // Clean up excessive whitespace and newlines
        scrapedText = scrapedText.replace(/\s\s+/g, ' ').trim();
        
        if (!scrapedText) {
            return res.status(500).json({ error: 'Failed to scrape any meaningful text from the URL.' });
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
            // The AI should return a JSON string. We parse it into an object.
            analysisResult = JSON.parse(aiResponseText);
        } catch (e) {
            console.error('Failed to parse JSON from AI response:', aiResponseText);
            // If the AI response isn't valid JSON, we send an error.
            return res.status(500).json({ error: 'AI returned an invalid response format.' });
        }
        
        // --- STEP 3: SEND THE RESULT BACK ---
        res.status(200).json({
            sourceText: scrapedText,
            analysis: analysisResult
        });

    } catch (error) {
        console.error('Error in /api/analyze function:', error.message);
        let userErrorMessage = 'An error occurred during analysis.';
        if (error.response && error.response.status === 404) {
            userErrorMessage = 'Could not find the requested URL (404 Not Found).';
        } else if (error.code === 'ENOTFOUND') {
            userErrorMessage = 'Could not resolve the domain name. Please check the URL.';
        }
        res.status(500).json({ error: userErrorMessage });
    }
};


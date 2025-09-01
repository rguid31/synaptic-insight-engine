const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const winston = require('winston');

const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
    ),
    transports: [
        new winston.transports.Console()
    ]
});

module.exports = async (req, res) => {
    try {
        logger.debug("Function started. Checking for API key...");
        if (!process.env.GEMINI_API_KEY) {
            logger.error("CRITICAL: GEMINI_API_KEY is not defined.");
            return res.status(500).json({ error: 'Server configuration error: API key is missing.' });
        }
        logger.debug("API key found.");

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        logger.debug("AI Model initialized.");

        if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

        let { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });
        
        logger.info(`Received URL: ${url}`);

        if (url.includes('arxiv.org/abs/')) {
            url = url.replace('/abs/', '/html/');
            logger.info(`Converted arXiv URL to: ${url}`);
        }

        logger.info(`Attempting to scrape content from: ${url}`);
        const { data: html } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
        const $ = cheerio.load(html);

        let scrapedText = '';
        // Helper function to extract main text content
        function extractMainText($) {
            if ($('.abstract').length) return $('.abstract').text();
            if ($('article').length) return $('article').text();
            if ($('main').length) return $('main').text();
            return $('body').text();
        }

        scrapedText = extractMainText($);
        scrapedText = scrapedText.replace(/\s\s+/g, ' ').trim();
        
        if (!scrapedText || scrapedText.length < 100) throw new Error('Failed to scrape any meaningful text.');
        logger.info(`Scraping successful. Text length: ${scrapedText.length}`);
        const systemPrompt = `
        The JSON object must have these four keys: "exploits", "opportunities", "gaps", "models".
        - Each key must have an array of strings as its value.
        - "exploits": Identify hyperbolic buzzwords, claims that lack evidence (e.g., "secret formula," "data is confidential"), and red flags that suggest marketing over science. Each finding should be a complete sentence and include the exact quote it's based on, like: 'The claim of a "secret formula" is an exploit because it lacks scientific transparency.'
        - "opportunities": Identify the core technology or scientific principle that has legitimate potential, even if the claims are exaggerated. Each finding should be a complete sentence and include the exact quote it's based on.
        - "gaps": Identify what's missing, such as a lack of peer-reviewed data, an unexplained scientific mechanism, or missing trial information. Each finding should be a complete sentence and include the exact quote or concept it's based on.
        - "models": Identify any phrases that suggest a specific type of growth or improvement model (e.g., "exponential growth," "10x improvement"). Each finding should be a complete sentence and include the exact quote it's based on.
        `;

        let aiResponseText;
        try {
            logger.info('Sending text to Gemini API for analysis...');
            const result = await model.generateContent([systemPrompt, scrapedText]);
            aiResponseText = result.response.text();
            logger.info('Received analysis from Gemini API.');
        } catch (aiError) {
            logger.error('--- ERROR DURING GEMINI API CALL ---');
            logger.error('AI Error Message:', aiError.message);
            throw new Error(`Gemini API Error: ${aiError.message}`);
        }
        logger.info('Attempting to parse JSON...');
        let analysisResult;
        try {
            // Extract the first JSON object from the response text
            const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('invalid JSON: No JSON object found in AI response.');
            analysisResult = JSON.parse(jsonMatch[0]);
            logger.info('JSON parsed successfully.');
        } catch (parseError) {
            logger.error('JSON parsing failed:', parseError.message);
            throw new Error('invalid JSON: ' + parseError.message);
        }
        
        logger.info('Sending final successful response.');
        res.status(200).json({
            sourceText: scrapedText,
            analysis: analysisResult
        });
    } catch (error) {
        // --- THIS IS THE NEW, SMARTER ERROR HANDLING ---
        let userErrorMessage = 'An unexpected error occurred.';
        if (error.isAxiosError) {
            userErrorMessage = 'Could not access this URL. The site may have a paywall, require a login, or actively block automated analysis tools.';
        } else if (error.message && error.message.includes('Failed to scrape')) {
            userErrorMessage = 'Could not extract readable text from this URL. The site structure is too complex for the scraper.';
        } else if (error.message && (error.message.includes('invalid JSON') || error instanceof SyntaxError)) {
            userErrorMessage = 'The AI returned a response that could not be understood.';
        } else if (error.message && error.message.includes('Gemini API Error')) {
            userErrorMessage = 'The AI analysis failed. This may be a temporary issue with the API.';
        }
        logger.error('Sending error response:', userErrorMessage);
        res.status(500).json({ error: userErrorMessage });
    }
};


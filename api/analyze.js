const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
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

        if (url.includes('arxiv.org/abs/')) {
            url = url.replace('/abs/', '/html/');
            console.log(`Converted arXiv URL to: ${url}`);
        }

        console.log(`Attempting to scrape content from: ${url}`);
        const { data: html } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(html);

        let scrapedText = '';
        if ($('.abstract').length) scrapedText = $('.abstract').text();
        else if ($('article').length) scrapedText = $('article').text();
        else if ($('main').length) scrapedText = $('main').text();
        else scrapedText = $('body').text();
        
        scrapedText = scrapedText.replace(/\s\s+/g, ' ').trim();
        
        if (!scrapedText || scrapedText.length < 100) throw new Error('Failed to scrape any meaningful text.');
        console.log(`Scraping successful. Text length: ${scrapedText.length}`);

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
            // Extract the first JSON object from the response text
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
            userErrorMessage = 'Could not access this URL. The site may have a paywall, require a login, or actively block automated analysis tools.';
        } else if (error.message.includes('Failed to scrape')) {
            userErrorMessage = 'Could not extract readable text from this URL. The site structure is too complex for the scraper.';
        } else if (error.message.includes('invalid JSON')) {
            userErrorMessage = 'The AI returned a response that could not be understood.';
        } else if (error.message.includes('Gemini API Error')) {
            userErrorMessage = 'The AI analysis failed. This may be a temporary issue with the API.';
        }

        res.status(500).json({ error: userErrorMessage });
    }
};
import { Analytics } from "@vercel/analytics"; // <-- Added import
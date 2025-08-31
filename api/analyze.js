// server.js

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
require('dotenv').config(); // <-- Load environment variables from .env file

// --- AI SETUP ---
// Import the Google AI SDK
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize the Generative AI client with the API key from our .env file
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
// --- END AI SETUP ---


const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello from the Synaptic Insight Engine Backend!');
});

app.post('/analyze', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    // --- STEP 1: SCRAPE THE TEXT (from previous phase) ---
    const response = await axios.get(url, {
        // Some sites block requests that don't look like they're from a real browser.
        // This header helps us look more like a legitimate user.
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
    });
    const html = response.data;
    const $ = cheerio.load(html);

    // Let's try to be smarter about scraping. We'll look for common article tags first.
    let scrapedText = $('article').text() || $('main').text() || $('body').text();
    // Clean up extra whitespace
    scrapedText = scrapedText.replace(/\s\s+/g, ' ').trim();

    console.log('--- SCRAPED TEXT (first 500 chars) ---');
    console.log(scrapedText.substring(0, 500) + '...');
    console.log('--------------------');

    // --- STEP 2: ANALYZE WITH GEMINI AI ---
    const systemPrompt = `
        You are a highly analytical AI assistant for the "Synaptic Insight Engine." Your task is to analyze the provided text from a scientific paper or tech case study. Your goal is to identify potential exploits, opportunities, knowledge gaps, and underlying growth models.

        Analyze the following text and respond ONLY with a valid JSON object. Do not include any explanatory text before or after the JSON.

        The JSON object must have these four keys: "exploits", "opportunities", "gaps", "models".
        - Each key should have an array of strings as its value.
        - "exploits": Identify hyperbolic buzzwords, claims that lack evidence (e.g., "secret formula," "data is confidential"), and red flags that suggest marketing over science.
        - "opportunities": Identify the core technology or scientific principle that has legitimate potential, even if the claims are exaggerated.
        - "gaps": Identify what's missing, such as a lack of peer-reviewed data, an unexplained scientific mechanism, or missing trial information.
        - "models": Identify any phrases that suggest a specific type of growth or improvement model (e.g., "exponential growth," "10x improvement").

        Here is the text to analyze:
    `;

    const result = await model.generateContent([systemPrompt, scrapedText]);
    const aiResponseText = result.response.text();

    console.log('--- AI RESPONSE ---');
    console.log(aiResponseText);
    console.log('--------------------');

    // Parse the JSON string from the AI into a real JavaScript object
    const analysisResult = JSON.parse(aiResponseText);

    // --- STEP 3: SEND THE RESULT BACK ---
    res.json({
        sourceText: scrapedText,
        analysis: analysisResult
    });

  } catch (error) {
    console.error('Error in /analyze endpoint:', error);
    res.status(500).json({ error: 'An error occurred during analysis.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

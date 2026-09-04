# Synaptic Insight Engine

AI-assisted web application for analyzing scientific papers and technology case studies from a URL.

**Live demo:** https://synaptic-insight-engine.vercel.app

![Synaptic Insight Engine screenshot](https://github.com/user-attachments/assets/12a217ad-79bd-4612-8ff4-95f11e0766d2)

## What it does

Synaptic Insight Engine fetches content from a user-provided URL and uses the Google Gemini API to organize the material into a structured analysis. The application is designed to surface questionable claims, legitimate opportunities, knowledge gaps, and possible MVP directions.

### Key features

- Fetches and parses article or case-study content from a URL
- Uses Gemini for structured AI-assisted analysis
- Highlights claims, opportunities, missing information, and growth-model considerations
- Generates an MVP-oriented blueprint from the analysis
- Provides a responsive browser interface with dynamic results
- Runs on Vercel using serverless API functions

## Tech stack

- **Frontend:** HTML5, CSS3, JavaScript
- **Backend:** Node.js serverless functions
- **AI:** Google Gemini API
- **Data:** Supabase / PostgreSQL
- **Libraries:** Axios, Cheerio, `@google/generative-ai`
- **Deployment:** Vercel
- **Version control:** Git and GitHub

## Local setup

1. Clone the repository:

```bash
git clone https://github.com/rguid31/synaptic-insight-engine.git
cd synaptic-insight-engine
```

2. Install dependencies:

```bash
npm install
```

3. Create a local environment file from the example:

```bash
cp .env.example .env
```

Add your Gemini API key to `.env`:

```text
GEMINI_API_KEY=YOUR_SECRET_API_KEY_HERE
```

4. Run the project locally with the Vercel CLI:

```bash
vercel dev
```

## Project status

Active portfolio project. Features and implementation may continue to evolve.

## Author

Ryan Guidry

- Portfolio: https://ryanguidry.com
- LinkedIn: https://www.linkedin.com/in/rmguidry
- GitHub: https://github.com/rguid31

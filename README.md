# Synaptic Insight Engine

AI-assisted web application for analyzing scientific papers and technology case studies from a URL.

**Live demo:** https://synaptic-insight-engine.vercel.app

![Synaptic Insight Engine screenshot](https://github.com/user-attachments/assets/12a217ad-79bd-4612-8ff4-95f11e0766d2)

## What it does

Synaptic Insight Engine resolves a user-provided article URL, reads available article text or verified abstract metadata, and routes that text through Vercel AI Gateway for structured analysis. It reports whether the analysis used full text or an abstract.

### Key features

- Reads public HTML and PDF article text
- Accepts direct PDF uploads up to 4 MB when the user already has the paper
- Searches Europe PMC, OpenAlex, and Crossref by DOI when the publisher page is unavailable
- Uses Europe PMC open-access full text or a verified abstract when no full text can be read
- Uses Vercel AI Gateway for structured AI-assisted analysis
- Highlights claims, opportunities, missing information, and growth-model considerations
- Generates an evidence-validation and MVP blueprint with verification steps, falsifying signals, experiments, pass conditions, risks, and a 30-day plan
- Keeps up to 50 completed analyses in browser-local history for quick reopening
- Provides a responsive browser interface with dynamic results
- Runs on Vercel using serverless API functions

## Tech stack

- **Frontend:** HTML5, CSS3, JavaScript
- **Backend:** Node.js serverless functions
- **AI:** A structured-output model through Vercel AI Gateway
- **Data:** Supabase / PostgreSQL
- **Libraries:** Cheerio, pdf-parse, Vercel AI SDK
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

3. Link the Vercel project and pull a short-lived OIDC token for AI Gateway:

```bash
vercel link
vercel env pull .env.local
```

The model can be overridden locally if needed:

```text
AI_MODEL=nvidia/nemotron-3.5-lightning-free
```

An optional `OPENALEX_API_KEY` raises OpenAlex lookup capacity. The Crossref and Europe PMC paths need no key. An article with no accessible text or abstract still returns a clear error; the application does not claim to have read subscriber-only text when it has only metadata.

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

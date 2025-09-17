# Synaptic Insight Engine Agent Instructions

This document provides instructions for AI agents working on the Synaptic Insight Engine codebase.

## Project Overview

This is a full-stack web application that analyzes scientific papers and tech case studies.

-   **Frontend**: Vanilla HTML, CSS, and JavaScript. The main file is `index.html`. Static assets are in `public/`.
-   **Backend**: Node.js serverless functions located in the `api/` directory. The main function is `api/analyze.js`.
-   **Database**: The project uses Supabase for database interactions, as indicated by `lib/supabase.js` and `supabase-schema.sql`.
-   **Deployment**: The application is deployed on Vercel. Configuration is in `vercel.json`.

## Development Setup

1.  **Dependencies**: Install dependencies using `npm install`.
2.  **Environment Variables**: Create a `.env` file in the root directory and add your `GEMINI_API_KEY`. Refer to `.env.example` for the required format.
3.  **Running Locally**: Use the Vercel CLI to run the application locally: `vercel dev`.

## Coding Conventions

-   **Code Style**: Follow standard JavaScript best practices. Use a code formatter like Prettier if possible.
-   **Modularity**: Keep frontend code modular. CSS should be in `public/css/style.css` and JavaScript in `public/js/script.js`. Avoid inlining styles or scripts in `index.html`.
-   **Dependencies**: All dependencies should be managed through `package.json`.

## Testing

There is currently no testing framework in place. If you add new features, consider adding tests using a framework like Jest or Playwright.

## Commits and Pull Requests

-   Follow conventional commit message standards.
-   Ensure all changes are verified before submitting.
-   Update this `AGENTS.md` file if you make significant changes to the project structure or development process.

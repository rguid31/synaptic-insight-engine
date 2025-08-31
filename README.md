# Synaptic Insight Engine

[![Vercel Deployment](https://img.shields.io/badge/Deployment-Vercel-black?style=for-the-badge&logo=vercel)](https://synaptic-insight-engine.vercel.app/)

**Live Demo:** [**synaptic-insight-engine.vercel.app**](https://synaptic-insight-engine.vercel.app)

---

An AI-powered web application designed to analyze scientific papers and tech case studies. The engine scrapes content from a provided URL, identifies potential red flags, uncovers legitimate opportunities, and generates a strategic MVP blueprint based on its findings.

This project was built from the ground up, demonstrating a full-stack development process from front-end UI/UX design to backend AI integration and serverless deployment.

![Synaptic Insight Engine Screenshot](https://github.com/user-attachments/assets/12a217ad-79bd-4612-8ff4-95f11e0766d2)

### Key Features

* **Real-Time Web Scraping:** Utilizes a Node.js backend to fetch and parse article content directly from user-provided URLs.
* **AI-Powered Analysis:** Leverages the Google Gemini API to perform a deep contextual analysis of the scraped text, identifying:
    * Exploits & Unscientific Claims
    * Legitimate Opportunities & Core Technologies
    * Knowledge Gaps & Missing Data
    * Underlying Growth Models
* **Interactive UI:** A polished, fully responsive front-end with interactive elements like a domain carousel, toast notifications, and dynamic content highlighting.
* **Blueprint Generation:** Automatically generates a downloadable MVP (Minimum Viable Product) blueprint based on the AI's analysis.
* **Serverless Deployment:** A modern full-stack architecture deployed on Vercel, using serverless functions for the backend API.

### Tech Stack

| Category     | Technology                                                 |
| :----------- | :--------------------------------------------------------- |
| **Frontend** | `HTML5`, `CSS3` (with Flexbox & Grid), `JavaScript (ES6+)` |
| **Backend** | `Node.js` (adapted for serverless functions)               |
| **Deployment** | `Vercel`, `Git & GitHub` (for version control)             |
| **AI** | `Google Gemini API` (`gemini-1.5-flash`)                   |
| **Libraries**| `Axios`, `Cheerio`, `@google/generative-ai`                |

---

### Local Setup & Installation

To run this project on your local machine, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/rguid31/synaptic-insight-engine.git](https://github.com/rguid31/synaptic-insight-engine.git)
    cd synaptic-insight-engine
    ```

2.  **Install dependencies:**
    This project uses Node.js. The `package.json` file in the root directory lists all necessary dependencies.
    ```bash
    npm install
    ```

3.  **Set up your Environment Variables:**
    The backend requires a secret API key for the Google Gemini API.
    * Create a new file in the root directory named `.env`.
    * Add your API key to this file:
        ```
        GEMINI_API_KEY=YOUR_SECRET_API_KEY_HERE
        ```

4.  **Run the application:**
    This project uses Vercel's CLI for a local development experience that mirrors the production environment.
    ```bash
    vercel dev
    ```
    The application will be available at a local URL provided by the command, typically `http://localhost:3000`.

### Author

**Ryan Guidry** - A self-taught developer passionate about building innovative and user-centric web applications.

* **Portfolio:** [rguidry.dev](https://rguidry.dev)
* **LinkedIn:** [linkedin.com/in/rmguidry](https://linkedin.com/in/rmguidry)
* **GitHub:** [@rguid31](https://github.com/rguid31)
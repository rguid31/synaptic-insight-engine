import { load } from 'cheerio';
import { generateText } from 'ai';

export const config = { maxDuration: 60 };

const MODEL_NAME = process.env.AI_MODEL || 'nvidia/nemotron-3.5-lightning-free';
const REQUEST_TIMEOUT_MS = 12000;
const MAX_SOURCE_CHARS = 50000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

const findingSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        rank: { type: 'integer', minimum: 1, maximum: 5 },
        status: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MODERATE', 'LOW'] },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        tags: { type: 'array', items: { type: 'string' }, maxItems: 5 },
        finding: { type: 'string' }
    },
    required: ['rank', 'status', 'confidence', 'tags', 'finding']
};

const analysisSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        exploits: { type: 'array', items: findingSchema, minItems: 1, maxItems: 5 },
        opportunities: { type: 'array', items: findingSchema, minItems: 1, maxItems: 5 },
        gaps: { type: 'array', items: findingSchema, minItems: 1, maxItems: 5 },
        models: { type: 'array', items: findingSchema, minItems: 1, maxItems: 5 },
        ethical_concerns: { type: 'array', items: findingSchema, minItems: 1, maxItems: 5 },
        reproducibility_issues: { type: 'array', items: findingSchema, minItems: 1, maxItems: 5 }
    },
    required: [
        'exploits',
        'opportunities',
        'gaps',
        'models',
        'ethical_concerns',
        'reproducibility_issues'
    ]
};

function isPrivateIpv4(hostname) {
    const parts = hostname.split('.').map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
        return false;
    }

    return parts[0] === 10
        || parts[0] === 127
        || (parts[0] === 169 && parts[1] === 254)
        || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
        || (parts[0] === 192 && parts[1] === 168)
        || parts[0] === 0;
}

export function normalizeSourceUrl(value) {
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw Object.assign(new Error('Please enter a valid, fully qualified URL.'), { statusCode: 400 });
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw Object.assign(new Error('Only HTTP and HTTPS URLs are supported.'), { statusCode: 400 });
    }

    const hostname = parsed.hostname.toLowerCase();
    if (
        parsed.username
        || parsed.password
        || hostname === 'localhost'
        || hostname === '::1'
        || hostname.endsWith('.local')
        || isPrivateIpv4(hostname)
    ) {
        throw Object.assign(new Error('This URL cannot be accessed by the analyzer.'), { statusCode: 400 });
    }

    if (hostname === 'arxiv.org' || hostname === 'www.arxiv.org') {
        const match = parsed.pathname.match(/^\/(?:abs|pdf|html)\/(.+?)(?:\.pdf)?$/i);
        if (match) {
            parsed.protocol = 'https:';
            parsed.hostname = 'arxiv.org';
            parsed.pathname = `/abs/${match[1].replace(/\.pdf$/i, '')}`;
            parsed.search = '';
            parsed.hash = '';
        }
    }

    return parsed.toString();
}

async function fetchWithValidatedRedirects(startUrl, signal) {
    let currentUrl = startUrl;

    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
        const response = await fetch(currentUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; SynapticInsightEngine/1.0; +https://synaptic-insight-engine.vercel.app)',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.8'
            },
            redirect: 'manual',
            signal
        });

        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (!location) throw Object.assign(new Error('The source returned an invalid redirect.'), { statusCode: 502 });
            currentUrl = normalizeSourceUrl(new URL(location, currentUrl).toString());
            continue;
        }

        return response;
    }

    throw Object.assign(new Error('The source redirected too many times.'), { statusCode: 502 });
}

async function readLimitedText(response) {
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        throw Object.assign(new Error('The source page is too large to analyze.'), { statusCode: 413 });
    }

    const reader = response.body?.getReader();
    if (!reader) return '';
    const chunks = [];
    let totalBytes = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw Object.assign(new Error('The source page is too large to analyze.'), { statusCode: 413 });
        }
        chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks).toString('utf8');
}

async function fetchHtml(url) {
    let lastError;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const response = await fetchWithValidatedRedirects(url, AbortSignal.timeout(REQUEST_TIMEOUT_MS));

            if (response.status === 404) {
                throw Object.assign(new Error('URL not found. Please check the address and try again.'), { statusCode: 400 });
            }
            if (response.status === 401 || response.status === 403) {
                throw Object.assign(new Error('Access denied by the source website. Try a public article or arXiv abstract.'), { statusCode: 400 });
            }
            if (response.status === 429) {
                throw Object.assign(new Error('The source website is rate limiting requests. Please try again shortly.'), { statusCode: 429, retryable: true });
            }
            if (response.status >= 500) {
                throw Object.assign(new Error('The source website is temporarily unavailable.'), { statusCode: 502, retryable: true });
            }
            if (!response.ok) {
                throw Object.assign(new Error(`The source website returned HTTP ${response.status}.`), { statusCode: 400 });
            }

            const contentType = response.headers.get('content-type') || '';
            if (!contentType.toLowerCase().includes('text/html')) {
                throw Object.assign(
                    new Error('The URL did not return an HTML page. arXiv PDF links are supported and will be converted automatically.'),
                    { statusCode: 400 }
                );
            }

            return await readLimitedText(response);
        } catch (error) {
            lastError = error;
            if (!error.retryable || attempt === 1) break;
        }
    }

    if (lastError?.statusCode) throw lastError;
    throw Object.assign(new Error('The source website could not be reached in time.'), { statusCode: 502 });
}

export function extractSourceData(html, url) {
    const $ = load(html);
    $('script, style, noscript, nav, footer, form').remove();

    const title = $('meta[name="citation_title"]').attr('content')
        || $('meta[property="og:title"]').attr('content')
        || $('h1, .title, .article-title, .ltx_title').first().text()
        || $('title').text()
        || 'Title not found';
    const authors = $('meta[name="citation_author"]').map((_, element) => $(element).attr('content')).get();
    const authorText = authors.length
        ? authors.join(', ')
        : $('.authors, .author, .ltx_authors').first().text().trim() || 'Authors not found';
    const abstract = $('.abstract, #abstract, .ltx_abstract').first().text().trim();
    const subjects = $('.tablecell.subjects, .subj-class').first().text().trim();
    const selectedText = abstract
        || $('article').first().text().trim()
        || $('main').first().text().trim()
        || $('body').text().trim();
    const cleanedText = selectedText.replace(/\s+/g, ' ').trim().slice(0, MAX_SOURCE_CHARS);

    if (cleanedText.length < 100) {
        throw Object.assign(
            new Error('Could not extract enough readable text from this page. It may require JavaScript, authentication, or a subscription.'),
            { statusCode: 422 }
        );
    }

    const parsedUrl = new URL(url);
    const arxivId = parsedUrl.hostname === 'arxiv.org'
        ? parsedUrl.pathname.match(/^\/abs\/(.+)$/)?.[1]
        : null;
    const cleanTitle = title.replace(/\s+/g, ' ').trim();
    const cleanAuthors = authorText.replace(/\s+/g, ' ').trim();
    const sourceText = [
        `Title: ${cleanTitle}`,
        `Authors: ${cleanAuthors}`,
        `Abstract: ${cleanedText}`,
        subjects ? `Subjects: ${subjects.replace(/\s+/g, ' ').trim()}` : ''
    ].filter(Boolean).join('\n');
    const structuredData = [
        { section: 'title', content: cleanTitle },
        { section: 'authors', content: cleanAuthors },
        { section: 'abstract', content: cleanedText },
        {
            section: 'publication_info',
            content: {
                venue: arxivId ? 'arXiv' : parsedUrl.hostname,
                identifier: arxivId || url
            }
        }
    ];
    if (subjects) structuredData.push({ section: 'subjects', content: subjects.replace(/\s+/g, ' ').trim() });

    return { sourceText, structuredData };
}

function validateAnalysis(value) {
    const categories = analysisSchema.required;
    if (!value || typeof value !== 'object' || categories.some(key => !Array.isArray(value[key]))) {
        throw new Error('The AI response did not match the expected analysis format.');
    }
    return value;
}

export function parseAnalysisText(text) {
    if (typeof text !== 'string' || !text.trim()) {
        throw new Error('The AI returned an empty response.');
    }

    const candidates = [];
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === '"') inString = false;
            continue;
        }

        if (character === '"') inString = true;
        else if (character === '{') {
            if (depth === 0) start = index;
            depth += 1;
        } else if (character === '}' && depth > 0) {
            depth -= 1;
            if (depth === 0 && start !== -1) candidates.push(text.slice(start, index + 1));
        }
    }

    for (const candidate of candidates.reverse()) {
        try {
            return validateAnalysis(JSON.parse(candidate));
        } catch {
            // Reasoning models may emit scratch objects before their final answer.
        }
    }

    throw new Error('The AI response did not contain a valid analysis object.');
}

async function analyzeText(sourceText) {
    const prompt = `Analyze the research paper or technology case study below for the Synaptic Insight Engine.

Return only one valid JSON object, without Markdown fences or commentary. Return 3-5 detailed, evidence-based findings in each category. Every finding must quote or precisely reference the source text. Use rank 1 for the highest priority and 5 for the lowest.

- exploits: unsubstantiated claims, methodological flaws, overstated conclusions, conflicts, or misleading statistics.
- opportunities: legitimate technologies, methods, or commercial/research opportunities.
- gaps: missing controls, statistical evidence, validation, long-term data, or important context.
- models: mathematical models, growth patterns, metrics, or theoretical frameworks.
- ethical_concerns: bias, privacy, fairness, safety, or social implications.
- reproducibility_issues: missing code, data, parameters, procedures, or independent validation.

Use exactly this shape for every item:
{"exploits":[{"title":"...","description":"...","rank":1}],"opportunities":[{"title":"...","description":"...","rank":1}],"gaps":[{"title":"...","description":"...","rank":1}],"models":[{"title":"...","description":"...","rank":1}],"ethical_concerns":[{"title":"...","description":"...","rank":1}],"reproducibility_issues":[{"title":"...","description":"...","rank":1}]}

SOURCE TEXT:
${sourceText}`;
    const result = await generateText({
        model: MODEL_NAME,
        prompt,
        reasoning: 'none',
        temperature: 0.2,
        maxOutputTokens: 8192,
        maxRetries: 1,
        timeout: 45000,
        providerOptions: {
            gateway: {
                tags: ['feature:paper-analysis', `env:${process.env.VERCEL_ENV || 'development'}`]
            }
        }
    });

    return parseAnalysisText(result.text || result.reasoningText);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        if (!body?.url || typeof body.url !== 'string') {
            return res.status(400).json({ error: 'A URL is required.' });
        }

        const url = normalizeSourceUrl(body.url.trim());
        const html = await fetchHtml(url);
        const { sourceText, structuredData } = extractSourceData(html, url);
        const analysis = await analyzeText(sourceText);

        return res.status(200).json({ sourceText, structuredData, analysis });
    } catch (error) {
        console.error('Analysis request failed:', error.message);
        const providerStatus = Number(error.statusCode);
        const statusCode = [402, 429, 503].includes(providerStatus)
            ? providerStatus
            : (error.name === 'TimeoutError' ? 504 : (error.statusCode || 500));
        const message = statusCode >= 500
            ? 'The analysis could not be completed right now. Please try again.'
            : error.message;
        return res.status(statusCode).json({ error: message });
    }
}

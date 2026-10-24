jest.mock('ai', () => ({
    generateText: jest.fn()
}));

import handler, { createFallbackAnalysis, extractDoi, extractSourceData, normalizeSourceUrl, parseAnalysisText, resolveSource } from './analyze.js';

function createResponse() {
    return {
        headers: {},
        statusCode: null,
        body: null,
        setHeader(name, value) {
            this.headers[name] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(value) {
            this.body = value;
            return this;
        }
    };
}

describe('normalizeSourceUrl', () => {
    it('normalizes arXiv PDF and HTML URLs to the abstract page', () => {
        expect(normalizeSourceUrl('https://arxiv.org/pdf/2307.12008.pdf'))
            .toBe('https://arxiv.org/abs/2307.12008');
        expect(normalizeSourceUrl('https://www.arxiv.org/html/2307.12008#section'))
            .toBe('https://arxiv.org/abs/2307.12008');
    });

    it('rejects unsupported and private URLs', () => {
        expect(() => normalizeSourceUrl('file:///etc/passwd')).toThrow('Only HTTP and HTTPS');
        expect(() => normalizeSourceUrl('http://127.0.0.1/private')).toThrow('cannot be accessed');
        expect(() => normalizeSourceUrl('http://192.168.1.10/private')).toThrow('cannot be accessed');
        expect(() => normalizeSourceUrl('http://[::1]/private')).toThrow('cannot be accessed');
    });
});

describe('extractSourceData', () => {
    it('extracts deterministic metadata and readable text', () => {
        const html = `
            <html>
                <head>
                    <meta name="citation_title" content="A Useful Paper">
                    <meta name="citation_author" content="Ada Lovelace">
                </head>
                <body>
                    <blockquote class="abstract">Abstract: This paper presents a carefully tested method with enough explanatory text to pass the minimum extraction threshold for analysis.</blockquote>
                </body>
            </html>`;
        const result = extractSourceData(html, 'https://arxiv.org/abs/2307.12008');

        expect(result.sourceText).toContain('Title: A Useful Paper');
        expect(result.sourceText).toContain('Ada Lovelace');
        expect(result.structuredData).toContainEqual({ section: 'title', content: 'A Useful Paper' });
    });
});

describe('publication retrieval', () => {
    const originalFetch = global.fetch;
    afterEach(() => { global.fetch = originalFetch; });

    it('recognizes a DOI in a publisher query string', () => {
        expect(extractDoi('https://example.org/article?id=10.1234/example.2026'))
            .toBe('10.1234/example.2026');
        expect(extractDoi('https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.0266781&type=printable'))
            .toBe('10.1371/journal.pone.0266781');
    });

    it('uses a verified abstract when the DOI landing page is blocked', async () => {
        global.fetch = jest.fn(async url => {
            if (url.startsWith('https://doi.org/')) return new Response('Forbidden', { status: 403 });
            if (url.startsWith('https://api.crossref.org/works/')) {
                return Response.json({ message: {
                    DOI: '10.1234/example',
                    title: ['A peer-reviewed study'],
                    author: [{ given: 'Ada', family: 'Lovelace' }],
                    abstract: '<p>This study reports an observed result with sufficient context to support a careful abstract-only analysis of its stated claims and limitations.</p>'
                } });
            }
            return new Response('Not found', { status: 404 });
        });

        const result = await resolveSource('https://doi.org/10.1234/example');
        expect(result.access).toMatchObject({ level: 'abstract', provider: 'Crossref abstract' });
        expect(result.sourceText).toContain('A peer-reviewed study');
        expect(result.sourceText).toContain('abstract-only analysis');
    });

    it('uses Europe PMC open-access full text after a blocked publisher page', async () => {
        global.fetch = jest.fn(async url => {
            if (url.startsWith('https://doi.org/')) return new Response('Forbidden', { status: 403 });
            if (url.includes('/search?query=')) {
                return Response.json({ resultList: { result: [{
                    doi: '10.1234/example', pmcid: 'PMC12345', isOpenAccess: 'Y',
                    title: 'A published experiment', authorString: 'Ada Lovelace'
                }] } });
            }
            if (url.endsWith('/PMC12345/fullTextXML')) {
                return new Response(`<article><front><article-meta><title-group><article-title>A published experiment</article-title></title-group></article-meta></front><body><sec><p>${'The full text describes measurements and repeatable methods. '.repeat(5)}</p></sec></body></article>`, {
                    headers: { 'content-type': 'application/xml' }
                });
            }
            return new Response('Not found', { status: 404 });
        });

        const result = await resolveSource('https://doi.org/10.1234/example');
        expect(result.access).toMatchObject({ level: 'full_text', provider: 'Europe PMC open-access full text' });
        expect(result.sourceText).toContain('repeatable methods');
    });
});

describe('parseAnalysisText', () => {
    const analysis = Object.fromEntries([
        'exploits',
        'opportunities',
        'gaps',
        'models',
        'ethical_concerns',
        'reproducibility_issues'
    ].map(key => [key, []]));

    it('extracts a valid JSON object from surrounding model text', () => {
        expect(parseAnalysisText(`Result:\n\`\`\`json\n${JSON.stringify(analysis)}\n\`\`\``)).toEqual(analysis);
    });

    it('selects the final valid object when reasoning contains multiple objects', () => {
        expect(parseAnalysisText(`Scratch: {"step":1}\nFinal: ${JSON.stringify(analysis)}\n{"note":"done"}`)).toEqual(analysis);
    });

    it('rejects incomplete analysis objects', () => {
        expect(() => parseAnalysisText('{"exploits":[]}')).toThrow('valid analysis object');
    });
});

describe('createFallbackAnalysis', () => {
    it('returns every required category with source-grounded findings', () => {
        const fallback = createFallbackAnalysis('The source reports a testable claim with limited supporting detail.');

        expect(Object.keys(fallback)).toEqual([
            'exploits',
            'opportunities',
            'gaps',
            'models',
            'ethical_concerns',
            'reproducibility_issues'
        ]);
        expect(Object.values(fallback).every(items => items.length === 1)).toBe(true);
        expect(fallback.gaps[0].description).toContain('The source reports');
    });
});

describe('handler request validation', () => {
    it('returns 405 before checking runtime configuration', async () => {
        const response = createResponse();
        await handler({ method: 'GET' }, response);

        expect(response.statusCode).toBe(405);
        expect(response.headers.Allow).toBe('POST');
    });
});

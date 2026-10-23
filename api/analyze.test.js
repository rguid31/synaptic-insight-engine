jest.mock('ai', () => ({
    generateText: jest.fn()
}));

import handler, { extractSourceData, normalizeSourceUrl, parseAnalysisText } from './analyze.js';

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

    it('rejects incomplete analysis objects', () => {
        expect(() => parseAnalysisText('{"exploits":[]}')).toThrow('expected analysis format');
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

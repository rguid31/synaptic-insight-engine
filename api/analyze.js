import { load } from 'cheerio';
import { generateText } from 'ai';
import { DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import { isIP } from 'node:net';

globalThis.DOMMatrix ||= DOMMatrix;
globalThis.ImageData ||= ImageData;
globalThis.Path2D ||= Path2D;

export const config = { maxDuration: 60 };

const MODEL_NAME = process.env.AI_MODEL || 'nvidia/nemotron-3.5-lightning-free';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_SOURCE_CHARS = 50000;
const MAX_RESPONSE_BYTES = 15 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

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
        || parts[0] >= 224
        || (parts[0] === 169 && parts[1] === 254)
        || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
        || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
        || (parts[0] === 192 && parts[1] === 168)
        || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19))
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
        || isIP(hostname.replace(/^\[|\]$/g, '')) === 6
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
                Accept: 'text/html,application/xhtml+xml,application/pdf,application/xml;q=0.9,*/*;q=0.8',
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

async function readLimitedBuffer(response) {
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        throw Object.assign(new Error('The source page is too large to analyze.'), { statusCode: 413 });
    }

    const reader = response.body?.getReader();
    if (!reader) return Buffer.alloc(0);
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

    return Buffer.concat(chunks);
}

async function parsePdfBuffer(body, { firstPages, includeInfo = false } = {}) {
    if (!Buffer.isBuffer(body) || body.length < 5 || body.subarray(0, 5).toString() !== '%PDF-') {
        throw Object.assign(new Error('The uploaded file is not a valid PDF.'), { statusCode: 400 });
    }

    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: body });
    try {
        const info = includeInfo ? await parser.getInfo() : null;
        const result = await parser.getText(firstPages ? { first: firstPages } : undefined);
        const text = result.text?.replace(/\u0000/g, '').trim();
        if (!text || text.length < 100) {
            throw Object.assign(new Error('This PDF does not contain enough selectable text to analyze. It may be image-only or scanned.'), { statusCode: 422 });
        }
        return { text, info };
    } finally {
        await parser.destroy();
    }
}

async function fetchDocument(url) {
    const response = await fetchWithValidatedRedirects(url, AbortSignal.timeout(REQUEST_TIMEOUT_MS));
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!/html|xml|pdf/.test(contentType) && !/\.pdf(?:$|\?)/i.test(url)) {
        throw new Error('Source did not return a readable article or PDF');
    }
    const body = await readLimitedBuffer(response);
    if (contentType.includes('pdf') || body.subarray(0, 4).toString() === '%PDF') {
        const result = await parsePdfBuffer(body, { firstPages: 25 });
        return { kind: 'pdf', content: result.text, url };
    }
    return { kind: contentType.includes('xml') ? 'xml' : 'html', content: body.toString('utf8'), url };
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
    const abstract = ($('.abstract, #abstract, .ltx_abstract').first().text()
        || $('meta[name="citation_abstract"]').attr('content')
        || $('meta[name="description"]').attr('content')
        || '').replace(/\s+/g, ' ').trim();
    const subjects = $('.tablecell.subjects, .subj-class').first().text().trim();
    const articleText = $('article, .article-body, #article-body, .fulltext, #fulltext, .ltx_document').first().text().trim();
    const mainText = $('main').first().text().trim();
    const hasFullText = articleText.replace(/\s+/g, ' ').length > Math.max(1200, abstract.length + 500);
    const selectedText = hasFullText ? articleText : abstract || mainText || $('body').text().trim();
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
        `${hasFullText ? 'Article text' : 'Abstract or page text'}: ${cleanedText}`,
        subjects ? `Subjects: ${subjects.replace(/\s+/g, ' ').trim()}` : ''
    ].filter(Boolean).join('\n');
    const structuredData = [
        { section: 'title', content: cleanTitle },
        { section: 'authors', content: cleanAuthors },
        { section: hasFullText ? 'article_text' : 'abstract', content: cleanedText },
        {
            section: 'publication_info',
            content: {
                venue: arxivId ? 'arXiv' : parsedUrl.hostname,
                identifier: arxivId || url
            }
        }
    ];
    if (subjects) structuredData.push({ section: 'subjects', content: subjects.replace(/\s+/g, ' ').trim() });

    return {
        sourceText,
        structuredData,
        access: { level: hasFullText ? 'full_text' : 'abstract', provider: 'source website', url }
    };
}

function plainText(markup) {
    return load(markup || '').text().replace(/\s+/g, ' ').trim();
}

export function extractDoi(url, html = '') {
    const $ = load(html);
    let urlCandidates = [];
    try {
        const parsed = new URL(url);
        urlCandidates = [...parsed.searchParams.values(), decodeURIComponent(parsed.pathname)];
    } catch { /* The metadata tags may still contain a DOI. */ }
    const candidates = [
        $('meta[name="citation_doi"]').attr('content'),
        $('meta[name="dc.identifier"]').attr('content'),
        ...urlCandidates
    ];
    for (const candidate of candidates) {
        const doi = String(candidate || '').match(/10\.\d{4,9}\/[^\s<>"?#&]+/i)?.[0]?.replace(/[.,;)]$/, '');
        if (doi) return doi.toLowerCase();
    }
    return null;
}

function extractDoiFromText(text) {
    const doi = String(text || '').slice(0, 15000).match(/10\.\d{4,9}\/[^\s<>"?#&]+/i)?.[0]?.replace(/[.,;)]$/, '');
    return doi ? doi.toLowerCase() : null;
}

async function fetchJson(url, headers = {}) {
    const response = await fetch(url, {
        headers: { Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) return null;
    const size = Number(response.headers.get('content-length'));
    if (size > 2 * 1024 * 1024) return null;
    return response.json();
}

function restoreAbstract(index) {
    if (!index || typeof index !== 'object') return '';
    const words = [];
    for (const [word, positions] of Object.entries(index)) {
        for (const position of positions) words[position] = word;
    }
    return words.filter(Boolean).join(' ');
}

function metadataSource({ title, authors, abstract, articleText, doi, venue, originalUrl, actualUrl, provider }) {
    const text = (articleText || abstract || '').replace(/\s+/g, ' ').trim().slice(0, MAX_SOURCE_CHARS);
    if (text.length < 100) return null;
    const fullText = Boolean(articleText);
    const cleanTitle = plainText(title) || 'Untitled publication';
    const authorText = Array.isArray(authors) ? authors.filter(Boolean).join(', ') : authors || 'Authors not listed';
    const structuredData = [
        { section: 'title', content: cleanTitle },
        { section: 'authors', content: authorText },
        { section: fullText ? 'article_text' : 'abstract', content: text },
        { section: 'publication_info', content: { venue: venue || 'Publication', identifier: doi || originalUrl } }
    ];
    return {
        sourceText: `Title: ${cleanTitle}\nAuthors: ${authorText}\n${fullText ? 'Article text' : 'Abstract'}: ${text}`,
        structuredData,
        access: { level: fullText ? 'full_text' : 'abstract', provider, url: actualUrl || originalUrl }
    };
}

function extractEuropePmcXml(xml, metadata, originalUrl, doi) {
    const $ = load(xml, { xmlMode: true });
    $('ref-list, back, table-wrap, fig').remove();
    const articleText = $('article > body').text().replace(/\s+/g, ' ').trim();
    return metadataSource({
        title: $('article-title').first().text() || metadata?.title,
        authors: metadata?.authorString,
        abstract: plainText(metadata?.abstractText),
        articleText,
        doi,
        venue: metadata?.journalTitle,
        originalUrl,
        actualUrl: `https://europepmc.org/articles/${metadata.pmcid}`,
        provider: 'Europe PMC open-access full text'
    });
}

async function lookupMetadata(doi) {
    const encodedDoi = encodeURIComponent(doi);
    const openAlexHeaders = process.env.OPENALEX_API_KEY
        ? { Authorization: `Bearer ${process.env.OPENALEX_API_KEY}` }
        : {};
    const [crossref, europePmc, openAlex] = await Promise.allSettled([
        fetchJson(`https://api.crossref.org/works/${encodedDoi}`),
        fetchJson(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(`DOI:${doi}`)}&format=json&resultType=core&pageSize=1`),
        fetchJson(`https://api.openalex.org/works/${encodeURIComponent(`https://doi.org/${doi}`)}`, openAlexHeaders)
    ]);
    return {
        crossref: crossref.status === 'fulfilled' ? crossref.value?.message : null,
        europePmc: europePmc.status === 'fulfilled' ? europePmc.value?.resultList?.result?.[0] : null,
        openAlex: openAlex.status === 'fulfilled' ? openAlex.value : null
    };
}

async function findDoiFromPublicationUrl(url, html = '') {
    const parsed = new URL(url);
    const pmcid = parsed.pathname.match(/PMC\d+/i)?.[0];
    const pmid = parsed.hostname.includes('pubmed.ncbi.nlm.nih.gov')
        ? parsed.pathname.match(/\b\d{5,10}\b/)?.[0]
        : null;
    if (pmcid || pmid) {
        const identifier = pmcid || pmid;
        const result = await fetchJson(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(`EXT_ID:${identifier}`)}&format=json&pageSize=1`);
        const record = result?.resultList?.result?.[0];
        if (record?.doi) return record.doi.toLowerCase();
    }

    const pii = parsed.pathname.match(/\/pii\/([A-Za-z0-9()\-]+)/i)?.[1];
    if (pii) {
        const result = await fetchJson(`https://api.crossref.org/works?filter=${encodeURIComponent(`alternative-id:${pii}`)}&rows=1`);
        const record = result?.message?.items?.[0];
        if (record?.DOI && record['alternative-id']?.some(id => id.toLowerCase() === pii.toLowerCase())) {
            return record.DOI.toLowerCase();
        }
    }

    const openAlexHeaders = process.env.OPENALEX_API_KEY
        ? { Authorization: `Bearer ${process.env.OPENALEX_API_KEY}` }
        : {};
    const locationResult = await fetchJson(
        `https://api.openalex.org/works?filter=${encodeURIComponent(`locations.landing_page_url:${url}`)}&per_page=1`,
        openAlexHeaders
    ).catch(() => null);
    const locationDoi = locationResult?.results?.[0]?.doi;
    if (locationDoi && locationResult.results[0].locations?.some(location => location.landing_page_url === url)) {
        return locationDoi.replace(/^https?:\/\/doi\.org\//i, '').toLowerCase();
    }

    const title = load(html)('meta[name="citation_title"]').attr('content');
    if (title && title.length >= 20 && title.length <= 250) {
        const result = await fetchJson(`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(title)}&rows=1`);
        const record = result?.message?.items?.[0];
        const clean = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        if (record?.DOI && clean(record.title?.[0]) === clean(title)) return record.DOI.toLowerCase();
    }
    return null;
}

export async function resolveSource(inputUrl) {
    const startedAt = Date.now();
    const url = normalizeSourceUrl(inputUrl);
    let direct = null;
    let directSource = null;
    try {
        direct = await fetchDocument(url);
        if (direct.kind === 'pdf') {
            const pdfDoi = extractDoi(url);
            const record = pdfDoi
                ? await fetchJson(`https://api.crossref.org/works/${encodeURIComponent(pdfDoi)}`).catch(() => null)
                : null;
            const citation = record?.message;
            directSource = metadataSource({
                title: citation?.title?.[0],
                authors: citation?.author?.map(author => [author.given, author.family].filter(Boolean).join(' ')),
                articleText: direct.content,
                doi: pdfDoi,
                venue: citation?.['container-title']?.[0],
                originalUrl: url,
                actualUrl: url,
                provider: 'source PDF'
            });
        } else if (direct.kind === 'html') {
            directSource = extractSourceData(direct.content, url);
        }
        if (directSource?.access.level === 'full_text') return directSource;
    } catch (error) {
        console.info('Direct source unavailable; checking scholarly indexes:', error.message);
    }

    const html = direct?.kind === 'html' ? direct.content : '';
    const doi = extractDoi(url, html) || await findDoiFromPublicationUrl(url, html);
    if (!doi) {
        if (directSource) return directSource;
        throw Object.assign(new Error('No readable article or verified publication record was found for this URL.'), { statusCode: 422 });
    }

    const { crossref, europePmc, openAlex } = await lookupMetadata(doi);
    if (europePmc?.pmcid && europePmc.isOpenAccess === 'Y') {
        try {
            const xml = await fetchDocument(`https://www.ebi.ac.uk/europepmc/webservices/rest/${encodeURIComponent(europePmc.pmcid)}/fullTextXML`);
            const fullText = extractEuropePmcXml(xml.content, europePmc, url, doi);
            if (fullText?.access.level === 'full_text') return fullText;
        } catch (error) {
            console.info('Europe PMC full text unavailable:', error.message);
        }
    }

    const oa = openAlex?.best_oa_location;
    const candidates = [oa?.pdf_url, oa?.landing_page_url].filter(Boolean).slice(0, 2);
    for (const candidate of candidates) {
        if (Date.now() - startedAt > 18000) break;
        try {
            const normalized = normalizeSourceUrl(candidate);
            if (normalized === url) continue;
            const document = await fetchDocument(normalized);
            const source = document.kind === 'pdf'
                ? metadataSource({ title: openAlex.title, authors: openAlex.authorships?.map(entry => entry.author?.display_name), articleText: document.content, doi, venue: openAlex.primary_location?.source?.display_name, originalUrl: url, actualUrl: normalized, provider: 'OpenAlex open-access copy' })
                : document.kind === 'html' ? extractSourceData(document.content, normalized) : null;
            if (source?.access.level === 'full_text') {
                source.access.provider = 'OpenAlex open-access copy';
                return source;
            }
        } catch (error) {
            console.info('Open-access copy unavailable:', error.message);
        }
    }

    const indexedAbstract = metadataSource({
        title: europePmc?.title || crossref?.title?.[0] || openAlex?.title,
        authors: europePmc?.authorString || crossref?.author?.map(author => [author.given, author.family].filter(Boolean).join(' ')) || openAlex?.authorships?.map(entry => entry.author?.display_name),
        abstract: plainText(europePmc?.abstractText || crossref?.abstract) || restoreAbstract(openAlex?.abstract_inverted_index),
        doi,
        venue: europePmc?.journalTitle || crossref?.['container-title']?.[0] || openAlex?.primary_location?.source?.display_name,
        originalUrl: url,
        actualUrl: europePmc?.pmcid ? `https://europepmc.org/articles/${europePmc.pmcid}` : `https://doi.org/${doi}`,
        provider: europePmc?.abstractText ? 'Europe PMC abstract' : crossref?.abstract ? 'Crossref abstract' : 'OpenAlex abstract'
    });
    if (indexedAbstract) return indexedAbstract;
    if (directSource) return directSource;
    throw Object.assign(new Error('This paper has no accessible full text or verified abstract in the connected scholarly indexes.'), { statusCode: 422 });
}

export async function resolvePdfUpload(body, filename = 'uploaded-paper.pdf') {
    if (body.length > MAX_UPLOAD_BYTES) {
        throw Object.assign(new Error('PDF uploads must be 4 MB or smaller.'), { statusCode: 413 });
    }

    const { text, info } = await parsePdfBuffer(body, { includeInfo: true });
    const doi = extractDoiFromText(text);
    const crossref = doi
        ? await fetchJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`).catch(() => null)
        : null;
    const citation = crossref?.message;
    const pdfTitle = info?.info?.Title;
    const cleanFilename = String(filename || 'uploaded-paper.pdf').replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
    return metadataSource({
        title: citation?.title?.[0] || pdfTitle || cleanFilename || 'Uploaded paper',
        authors: citation?.author?.map(author => [author.given, author.family].filter(Boolean).join(' ')) || info?.info?.Author,
        articleText: text,
        doi,
        venue: citation?.['container-title']?.[0] || 'Uploaded PDF',
        originalUrl: `file:${encodeURIComponent(filename)}`,
        actualUrl: `file:${encodeURIComponent(filename)}`,
        provider: 'uploaded PDF'
    });
}

function validateAnalysis(value) {
    const categories = ['exploits', 'opportunities', 'gaps', 'models', 'ethical_concerns', 'reproducibility_issues'];
    if (
        !value
        || typeof value !== 'object'
        || categories.some(key => !Array.isArray(value[key]))
    ) {
        throw new Error('The AI response did not match the expected analysis format.');
    }
    return value;
}

function findingText(item) {
    if (typeof item === 'string') return item;
    return item?.finding || item?.description || item?.content || item?.title || '';
}

export function createBlueprintFromAnalysis(analysis, access = { level: 'abstract' }) {
    const candidates = [
        { kind: 'red flag', item: analysis.exploits?.[0] },
        { kind: 'evidence gap', item: analysis.gaps?.[0] },
        { kind: 'opportunity', item: analysis.opportunities?.[0] }
    ].filter(entry => findingText(entry.item));
    const primaryGap = findingText(analysis.gaps?.[0]) || 'The central evidence and assumptions need independent validation.';
    const primaryOpportunity = findingText(analysis.opportunities?.[0]) || 'Convert the publication’s central mechanism into a measurable, reproducible workflow.';
    const primaryModel = findingText(analysis.models?.[0]) || 'Use the publication’s primary outcome metric and uncertainty interval.';

    const evidenceToVerify = candidates.map(({ kind, item }) => {
        const claim = findingText(item);
        return {
            claim,
            why_it_matters: `This ${kind} can change whether the publication should be trusted, challenged, or used as the foundation for an MVP.`,
            verification_steps: [
                `Trace this finding to the exact passage, table, figure, or citation in the publication: ${claim}`,
                'Acquire the corresponding methods, supplements, raw or minimally processed data, code, parameter settings, and exclusion criteria.',
                'Recalculate the reported result with the published procedure and record every discrepancy in sample size, preprocessing, assumptions, and uncertainty.',
                'Run a counter-test using an alternative plausible specification, negative control, or held-out sample chosen before viewing the outcome.'
            ],
            required_data: ['Full methods and supplementary materials', 'Raw or minimally processed measurements with provenance', 'Versioned code, parameters, exclusions, and random seeds'],
            supporting_signal: 'An independent reproduction preserves the reported direction, practical effect, and uncertainty bounds under the prespecified robustness checks.',
            falsifying_signal: 'The direction reverses, the practical effect disappears, the uncertainty crosses the decision threshold, or the result depends on an undisclosed assumption or excluded observation.'
        };
    });

    return {
        executive_thesis: `Test the publication’s highest-value opportunity against its most consequential evidence gap before committing product resources. Opportunity: ${primaryOpportunity} Evidence gap: ${primaryGap}`,
        evidence_to_verify: evidenceToVerify.length ? evidenceToVerify : createFallbackAnalysis('').blueprint.evidence_to_verify,
        mvp_plan: {
            problem_statement: `Users cannot confidently act on the publication until this uncertainty is resolved: ${primaryGap}`,
            target_user: 'Researchers, technical reviewers, innovation teams, and evidence-driven product decision makers',
            value_proposition: `Turn this publication-specific opportunity into a traceable test rather than an unverified claim: ${primaryOpportunity}`,
            core_features: [
                'Claim-to-evidence matrix linking every conclusion to its source passage, dataset, calculation, and confidence level',
                'Versioned reproduction runner that records data lineage, parameters, exclusions, seeds, and output artifacts',
                `Metric dashboard centered on the publication’s own decision logic: ${primaryModel}`,
                'Counter-evidence workspace for negative controls, alternative specifications, held-out validation, and failed replications'
            ],
            experiments: [{
                hypothesis: primaryOpportunity,
                method: 'Implement the narrowest reproducible version of the published method, benchmark it against the paper’s baseline, then repeat on a held-out sample and under at least two alternative assumptions.',
                metric: `Use the reported primary outcome plus effect size, uncertainty interval, replication error, execution cost, and failure rate. Reported model context: ${primaryModel}`,
                pass_condition: 'Advance only if the effect keeps the reported direction, meets a prespecified practical threshold, and survives the held-out test and the strongest reasonable counter-test.'
            }],
            data_and_tools: [
                access.level === 'abstract' ? 'Full paper, methods, results, tables, figures, and supplements before drawing method-level conclusions' : 'Full text plus all cited supplements and appendices',
                'Lawfully accessible original data or a documented proxy dataset with known limitations',
                'Version-controlled analysis environment with locked dependencies and reproducible execution',
                'Decision log containing thresholds, counter-hypotheses, deviations, and negative results'
            ],
            risks_and_mitigations: [
                'Missing data or code — mark affected claims unverifiable and request or reconstruct only with documented assumptions.',
                'Confirmation bias — preregister the hypothesis, primary metric, pass threshold, exclusions, and counter-test.',
                'Proxy-data mismatch — quantify distribution differences and keep proxy results separate from direct replication.',
                'MVP overreach — ship only the validated narrow workflow, with uncertainty and provenance visible to users.'
            ],
            next_30_days: [
                'Days 1–5: extract the top claims, cited evidence, variables, baselines, reported metrics, assumptions, and decision thresholds.',
                'Days 6–12: obtain the lawful data and code, lock the environment, and reproduce the published baseline.',
                'Days 13–20: run the primary reproduction, negative control, held-out validation, and sensitivity analyses.',
                'Days 21–25: build the claim matrix and comparison dashboard around the strongest validated opportunity.',
                'Days 26–30: publish discrepancies, residual uncertainty, and a go, revise, or stop decision against the prespecified pass condition.'
            ]
        }
    };
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

export function createFallbackAnalysis(sourceText) {
    const excerpt = sourceText.replace(/\s+/g, ' ').trim().slice(0, 320);
    const evidence = excerpt ? `The extracted source states: “${excerpt}${sourceText.length > 320 ? '…' : ''}”` : 'The source text was too limited to quote directly.';

    return {
        exploits: [{ title: 'Claims require independent validation', description: `${evidence} Treat the central claims as provisional until the underlying evidence is independently checked.`, rank: 1 }],
        opportunities: [{ title: 'Source presents a testable research direction', description: `${evidence} The described mechanism can be treated as a hypothesis for controlled follow-up work.`, rank: 2 }],
        gaps: [{ title: 'Evidence is limited in the extracted source', description: `${evidence} Full methods, measurements, uncertainty estimates, and comparison data should be reviewed before drawing conclusions.`, rank: 1 }],
        models: [{ title: 'Evaluate the proposed mechanism quantitatively', description: `${evidence} A useful next step is to translate the claimed mechanism into measurable variables and falsifiable predictions.`, rank: 2 }],
        ethical_concerns: [{ title: 'Communicate uncertainty clearly', description: `${evidence} Public or commercial communication should distinguish reported claims from independently established results.`, rank: 2 }],
        reproducibility_issues: [{ title: 'Replication details need verification', description: `${evidence} Confirm that complete procedures, parameters, raw data, and independent replication evidence are available.`, rank: 1 }],
        blueprint: {
            executive_thesis: 'Treat the central publication claim as a testable hypothesis until its methods, data, and effect size have been independently verified.',
            evidence_to_verify: [{
                claim: excerpt || 'The publication’s central reported result',
                why_it_matters: 'This claim is the foundation for any follow-up research or product decision.',
                verification_steps: ['Obtain the full methods, supplements, raw data, and code.', 'Recreate the primary analysis with the published parameters.', 'Run robustness checks with alternative assumptions and a held-out dataset.'],
                required_data: ['Primary measurements', 'Sampling and exclusion criteria', 'Analysis code and parameter settings'],
                supporting_signal: 'The reported direction and practical effect size persist across the reproduction and robustness checks.',
                falsifying_signal: 'The result disappears, reverses, or falls below the prespecified practical-effect threshold.'
            }],
            mvp_plan: {
                problem_statement: 'Researchers need a transparent way to test whether the publication’s central claim survives independent reproduction.',
                target_user: 'Independent researchers, technical reviewers, and evidence-driven product teams',
                value_proposition: 'Turn a public claim into a traceable verification workflow with explicit evidence and pass/fail criteria.',
                core_features: ['Evidence and source registry', 'Reproducible analysis pipeline', 'Assumption and sensitivity testing', 'Results comparison dashboard'],
                experiments: [{
                    hypothesis: 'The publication’s central effect can be independently reproduced.',
                    method: 'Re-run the reported procedure on the original or closest lawful dataset, then repeat on a held-out sample.',
                    metric: 'Direction, effect size, uncertainty interval, and replication error relative to the published result',
                    pass_condition: 'The direction matches and the effect remains practically meaningful under the prespecified robustness checks.'
                }],
                data_and_tools: ['Full publication and supplement', 'Versioned data and analysis environment', 'Documented statistical or computational pipeline'],
                risks_and_mitigations: ['Incomplete source material — label unverifiable steps and request missing artifacts.', 'Selection or confirmation bias — preregister thresholds and retain negative results.'],
                next_30_days: ['Days 1–5: extract claims, variables, assumptions, and reported thresholds.', 'Days 6–12: acquire lawful data and recreate the analysis environment.', 'Days 13–21: reproduce the primary result and run sensitivity tests.', 'Days 22–30: publish the evidence matrix, discrepancies, and MVP go/no-go decision.']
            }
        }
    };
}

async function analyzeText(sourceText, access) {
    const prompt = `Analyze the research paper or technology case study below for the Synaptic Insight Engine.

Available source: ${access.level === 'full_text' ? 'article text' : 'abstract only'}. Make claims only about the available text. If only an abstract is available, explicitly identify methods, data, or results that cannot be assessed from it.

Return only one valid JSON object, without Markdown fences or commentary. Give 1-3 distinct, evidence-based findings in each category; use fewer when the available text is limited. Every finding must quote or precisely reference the source text. Do not infer a missing detail is absent from the paper when only an abstract is available. Use rank 1 for the highest priority and 5 for the lowest.

- exploits: unsubstantiated claims, methodological flaws, overstated conclusions, conflicts, or misleading statistics.
- opportunities: legitimate technologies, methods, or commercial/research opportunities.
- gaps: missing controls, statistical evidence, validation, long-term data, or important context.
- models: mathematical models, growth patterns, metrics, or theoretical frameworks.
- ethical_concerns: bias, privacy, fairness, safety, or social implications.
- reproducibility_issues: missing code, data, parameters, procedures, or independent validation.

Use this exact top-level shape. A finding is the complete source-grounded explanation, not a short label:
{"exploits":[{"rank":1,"status":"CRITICAL","confidence":0.9,"tags":["claim"],"finding":"..."}],"opportunities":[{"rank":1,"status":"HIGH","confidence":0.9,"tags":["method"],"finding":"..."}],"gaps":[{"rank":1,"status":"HIGH","confidence":0.9,"tags":["evidence"],"finding":"..."}],"models":[{"rank":1,"status":"HIGH","confidence":0.9,"tags":["metric"],"finding":"..."}],"ethical_concerns":[{"rank":1,"status":"HIGH","confidence":0.9,"tags":["ethics"],"finding":"..."}],"reproducibility_issues":[{"rank":1,"status":"HIGH","confidence":0.9,"tags":["replication"],"finding":"..."}]}

SOURCE TEXT:
${sourceText}`;
    try {
        const result = await generateText({
            model: MODEL_NAME,
            prompt,
            reasoning: 'none',
            temperature: 0.2,
            maxOutputTokens: 6000,
            maxRetries: 0,
            timeout: 35000,
            providerOptions: {
                gateway: {
                    tags: ['feature:paper-analysis', `env:${process.env.VERCEL_ENV || 'development'}`]
                }
            }
        });
        const analysis = parseAnalysisText(result.text || result.reasoningText);
        analysis.blueprint = createBlueprintFromAnalysis(analysis, access);
        return { analysis, mode: 'ai' };
    } catch (error) {
        console.warn('AI analysis unavailable; using source-grounded fallback:', error.message);
        return { analysis: createFallbackAnalysis(sourceText), mode: 'source_fallback' };
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Name');
    if (req.method === 'OPTIONS') return res.status(204).json({});

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    try {
        const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
        let source;
        if (contentType.startsWith('application/pdf') || contentType.startsWith('application/octet-stream')) {
            const declaredLength = Number(req.headers?.['content-length']);
            if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
                return res.status(413).json({ error: 'PDF uploads must be 4 MB or smaller.' });
            }
            let pdfBody;
            if (Buffer.isBuffer(req.body)) pdfBody = req.body;
            else if (req.body instanceof Uint8Array) pdfBody = Buffer.from(req.body);
            else if (typeof req.body === 'string') pdfBody = Buffer.from(req.body, 'binary');
            else {
                const chunks = [];
                let totalBytes = 0;
                for await (const chunk of req) {
                    const buffer = Buffer.from(chunk);
                    totalBytes += buffer.length;
                    if (totalBytes > MAX_UPLOAD_BYTES) {
                        throw Object.assign(new Error('PDF uploads must be 4 MB or smaller.'), { statusCode: 413 });
                    }
                    chunks.push(buffer);
                }
                pdfBody = Buffer.concat(chunks);
            }
            const encodedFilename = String(req.headers?.['x-file-name'] || 'uploaded-paper.pdf');
            let filename = encodedFilename;
            try { filename = decodeURIComponent(encodedFilename); } catch { /* Use the received name. */ }
            source = await resolvePdfUpload(pdfBody, filename.slice(0, 180));
        } else {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            if (!body?.url || typeof body.url !== 'string') {
                return res.status(400).json({ error: 'Enter an article URL or upload a PDF.' });
            }
            source = await resolveSource(body.url.trim());
        }

        const { sourceText, structuredData, access } = source;
        const { analysis, mode } = await analyzeText(sourceText, access);

        return res.status(200).json({ sourceText, structuredData, sourceAccess: access, analysisMode: mode, analysis });
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

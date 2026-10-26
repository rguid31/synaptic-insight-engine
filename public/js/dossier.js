/* Structured, source-aware dossier renderer. No publication text is inserted as HTML. */
(function () {
    const VERSION = 1;
    const VIEWS = [
        { id: 'executive', label: 'Executive' },
        { id: 'validation', label: 'Scientific Validation' },
        { id: 'build', label: 'MVP Build Plan' }
    ];
    let active = null;

    function node(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined && text !== null) element.textContent = String(text);
        return element;
    }

    function add(parent, ...children) {
        for (const child of children) if (child) parent.appendChild(child);
        return parent;
    }

    function textOf(item) {
        if (typeof item === 'string') return item;
        return item?.finding || item?.description || item?.content || item?.title || '';
    }

    function titleOf(result) {
        const title = result.structuredData?.find?.(entry => entry.section === 'title')?.content;
        if (title) return title;
        const match = String(result.sourceText || '').match(/^Title:\s*(.+)$/m);
        return match?.[1] || 'Untitled publication';
    }

    function short(value, maximum = 115) {
        const clean = String(value || '').replace(/\s+/g, ' ').trim();
        return clean.length > maximum ? `${clean.slice(0, maximum - 1).trimEnd()}…` : clean;
    }

    function list(values) {
        const ul = node('ul', 'dossier-list');
        for (const value of values || []) add(ul, node('li', '', value));
        return ul;
    }

    function block(label, value) {
        const div = node('div', 'dossier-fact');
        add(div, node('span', 'dossier-label', label), node('p', '', value || 'Not established in the available source.'));
        return div;
    }

    function badge(text, tone = 'neutral') {
        return node('span', `dossier-badge dossier-badge-${tone}`, text);
    }

    function card(title, body, extraClass = '') {
        const article = node('article', `dossier-card ${extraClass}`);
        add(article, node('h4', '', title), body);
        return article;
    }

    function section(title, subtitle) {
        const wrapper = node('section', 'dossier-group');
        add(wrapper, node('h3', '', title));
        if (subtitle) add(wrapper, node('p', 'dossier-section-note', subtitle));
        return wrapper;
    }

    function sourceScope(result) {
        const abstract = result.sourceAccess?.level === 'abstract';
        const fallback = result.analysisMode === 'source_fallback';
        return {
            label: abstract ? 'Abstract only' : 'Full text',
            note: abstract
                ? 'Methods, results, tables, and supplementary material have not been reviewed. Treat any inferred gap as provisional.'
                : fallback
                    ? 'AI analysis was unavailable. These source-based prompts are limited; rerun the article for publication-specific findings.'
                    : 'The article text was analyzed. Original data, code, tables, and supplements still require direct review.',
            provider: result.sourceAccess?.provider || 'source supplied by user'
        };
    }

    function build(result, reference) {
        const analysis = result.analysis || {};
        const blueprint = analysis.blueprint || {};
        const plan = blueprint.mvp_plan || {};
        const scope = sourceScope(result);
        const findings = {
            redFlag: textOf(analysis.exploits?.[0]),
            opportunity: textOf(analysis.opportunities?.[0]),
            gap: textOf(analysis.gaps?.[0]),
            model: textOf(analysis.models?.[0])
        };
        const fallbackClaims = [
            { kind: 'Red flag', item: analysis.exploits?.[0] },
            { kind: 'Evidence gap', item: analysis.gaps?.[0] },
            { kind: 'Opportunity', item: analysis.opportunities?.[0] }
        ].filter(entry => textOf(entry.item)).map(entry => ({
            claim: textOf(entry.item),
            kind: entry.kind,
            verification_steps: ['Locate the source passage or table.', 'Reproduce the reported result.', 'Run a prespecified counter-test.']
        }));
        const candidateEntries = [
            { type: 'Red flag', original: analysis.exploits?.[0] },
            { type: 'Evidence gap', original: analysis.gaps?.[0] },
            { type: 'Opportunity', original: analysis.opportunities?.[0] }
        ].filter(entry => textOf(entry.original));
        const rawClaims = result.analysisMode === 'source_fallback'
            ? [{
                claim: `Identify the central testable claim in ${titleOf(result)}.`,
                why_it_matters: 'The automated analysis was unavailable, so no publication-specific conclusion can yet support a build decision.',
                verification_steps: [
                    'Read the abstract and conclusions; record the central claim and exact page or section.',
                    'Identify the reported outcome, comparison, sample, and uncertainty in the methods and results.',
                    'Acquire the original data and code, then reproduce the reported comparison.',
                    'Run a prespecified counter-test or independent validation sample.'
                ],
                required_data: ['Full article and supplements', 'Original data and code', 'Reported outcome and baseline'],
                supporting_signal: 'An independent reproduction preserves the reported direction and practical effect.',
                falsifying_signal: 'The result disappears, reverses, or depends on undocumented assumptions.'
            }]
            : blueprint.evidence_to_verify?.length ? blueprint.evidence_to_verify : fallbackClaims;
        const claims = rawClaims.map((entry, index) => {
            const match = candidateEntries.find(candidate => candidate.original && entry.claim === textOf(candidate.original));
            const type = match?.type || entry.kind || 'Claim';
            const original = match?.original;
            return {
                id: `claim-${index + 1}`,
                type,
                priority: index === 0 ? 'Highest' : index === 1 ? 'High' : 'Review',
                statement: entry.claim || 'Claim requires review',
                rationale: entry.why_it_matters || 'This finding affects whether the result is suitable for further research or a product.',
                confidence: typeof original?.confidence === 'number' ? original.confidence : null,
                sourceLocation: '',
                evidenceFor: '',
                evidenceAgainst: '',
                nextAction: entry.verification_steps?.[0] || 'Locate the exact source passage.',
                protocol: {
                    hypothesis: entry.claim || 'The reported finding can be reproduced.',
                    data: entry.required_data || plan.data_and_tools || [],
                    steps: entry.verification_steps || [],
                    counterTest: entry.verification_steps?.at(-1) || 'Run a prespecified alternative specification or negative control.',
                    success: entry.supporting_signal || 'The result reproduces under the original and robustness checks.',
                    falsification: entry.falsifying_signal || 'The result reverses or loses practical significance.',
                    estimate: 'Set after checking data access and compute requirements'
                }
            };
        });
        const features = (plan.core_features || []).map((name, index) => ({
            id: `feature-${index + 1}`,
            priority: index < 2 ? 'P0 · first release' : 'P1 · after validation',
            name,
            acceptance: index === 0
                ? 'Each recorded claim links to a source location and shows its verification status.'
                : index === 1
                    ? 'A second reviewer can rerun the analysis from versioned inputs and obtain the recorded result.'
                    : index === 2
                        ? 'The dashboard displays baseline, observed result, threshold, and uncertainty for each metric.'
                        : 'A failed or contradictory test remains visible beside the supporting result.'
        }));
        const experiment = plan.experiments?.[0] || {};
        const phaseCount = plan.next_30_days?.length || 0;
        const phases = (plan.next_30_days || []).map((description, index) => ({
            id: `phase-${index + 1}`,
            window: description.match(/Days?\s*[\d–-]+/i)?.[0] || `Phase ${index + 1}`,
            description,
            owner: index < 2 ? 'Research lead' : index === 2 ? 'Methods reviewer' : index === 3 ? 'Product engineer' : 'Decision owner',
            dependency: index === 0 ? 'Publication and scope' : `Phase ${index}`,
            gate: index === phaseCount - 1 ? 'Go / revise / stop decision' : 'Artifacts reviewed and recorded'
        }));
        const risks = (plan.risks_and_mitigations || []).map((value, index) => {
            const [name, ...rest] = value.split(/\s+[—–-]\s+/);
            return { id: `risk-${index + 1}`, name, severity: index < 2 ? 'High' : 'Moderate', likelihood: 'Assess', mitigation: rest.join(' — ') || 'Document the risk and the response.', trigger: 'Review if the underlying assumption fails.' };
        });
        return {
            schemaVersion: VERSION,
            source: { title: titleOf(result), reference: reference || '', ...scope, analysisMode: result.analysisMode || 'unknown' },
            decision: {
                recommendation: result.analysisMode === 'source_fallback' ? 'Retry analysis' : 'Investigate',
                reason: result.analysisMode === 'source_fallback'
                    ? 'The AI analysis was unavailable. This source checklist is provisional and does not establish publication-specific conclusions.'
                    : 'The leading claim and the strongest counter-test need independent verification before a build decision.',
                opportunity: result.analysisMode === 'source_fallback' ? 'Publication-specific opportunity not established. Retry analysis or review the paper directly.' : findings.opportunity || 'No specific opportunity was established in the available source.',
                gap: result.analysisMode === 'source_fallback' ? 'The paper’s methods, results, and supporting data still need direct review.' : findings.gap || 'The strongest evidence gap needs to be located and tested.',
                redFlag: result.analysisMode === 'source_fallback' ? 'No paper-specific red flag was established in this limited run.' : findings.redFlag || 'No specific red flag was extracted; inspect the publication directly.',
                thesis: result.analysisMode === 'source_fallback' ? 'Complete the source review and rerun the analysis before treating any conclusion as established.' : blueprint.executive_thesis || 'Validate the central claim and its practical value before committing product resources.'
            },
            claims,
            mvp: {
                targetUser: plan.target_user || 'Researchers and evidence-driven product teams',
                problem: plan.problem_statement || findings.gap,
                solution: plan.value_proposition || findings.opportunity,
                features,
                inputs: plan.data_and_tools || [],
                outputs: ['Linked claim and evidence record', 'Reproduction results with uncertainty', 'MVP go / revise / stop decision'],
                excluded: ['Broad claims beyond the analyzed publication', 'Automatic declaration that a result is independently proven'],
                experiment: {
                    hypothesis: experiment.hypothesis || findings.opportunity,
                    method: experiment.method || 'Reproduce the main result and test it on a held-out sample.',
                    metricContext: experiment.metric || findings.model || 'Define the primary reported outcome and uncertainty.',
                    passCondition: experiment.pass_condition || 'Set a practical threshold before running the test.'
                },
                architecture: [
                    { label: 'Publication & data', detail: 'Article, supplement, datasets' },
                    { label: 'Evidence registry', detail: 'Claims and source locations' },
                    { label: 'Reproduction', detail: 'Published method under test' },
                    { label: 'Validation', detail: 'Baseline, counter-test, uncertainty' },
                    { label: 'Decision interface', detail: 'Results, status, next action' }
                ],
                risks,
                roadmap: phases,
                decisionRule: 'Advance only after the prespecified metric passes, the strongest counter-test fails to overturn the result, and remaining uncertainty is acceptable for the target user.'
            }
        };
    }

    function stateKey(reference) { return `sie:dossier:v${VERSION}:${reference || 'untitled'}`; }
    function loadState(reference) {
        try { return JSON.parse(localStorage.getItem(stateKey(reference)) || '{}'); }
        catch { return {}; }
    }
    function saveState() {
        if (!active) return;
        try { localStorage.setItem(stateKey(active.data.source.reference), JSON.stringify(active.workspace)); }
        catch { /* The dossier still works in memory if browser storage is unavailable. */ }
    }
    function setWorkspace(group, id, value) {
        active.workspace[group] ||= {};
        active.workspace[group][id] = value;
        saveState();
        refreshProgress();
    }

    function editable(label, id, placeholder, multiline = false) {
        const wrap = node('label', 'dossier-input-wrap');
        const input = node(multiline ? 'textarea' : 'input', 'dossier-input');
        input.dataset.field = id;
        input.placeholder = placeholder;
        input.value = active.workspace.fields?.[id] || '';
        if (multiline) input.rows = 3;
        add(wrap, node('span', 'dossier-label', label), input);
        return wrap;
    }

    function checklist(items, prefix) {
        const wrap = node('ul', 'dossier-checklist');
        items.forEach((item, index) => {
            const id = `${prefix}-${index}`;
            const label = node('label', 'dossier-check');
            const input = node('input');
            input.type = 'checkbox';
            input.dataset.check = id;
            input.checked = Boolean(active.workspace.checks?.[id]);
            add(label, input, node('span', '', item));
            add(wrap, add(node('li'), label));
        });
        return wrap;
    }

    function progress() {
        const ids = active.data.claims.flatMap(c => c.protocol.steps.map((_, index) => `${c.id}-step-${index}`))
            .concat(active.data.claims.map((_, index) => `executive-action-${index}`))
            .concat(active.data.mvp.roadmap.map(p => `${p.id}-done-0`));
        const done = ids.filter(id => active.workspace.checks?.[id]).length;
        return { done, total: ids.length };
    }
    function refreshProgress() {
        const target = document.getElementById('dossierProgress');
        if (!target || !active) return;
        const { done, total } = progress();
        target.textContent = `${done} of ${total} actions completed`;
    }

    function executiveView() {
        const { data } = active;
        const view = node('div', 'dossier-view');
        const lead = node('div', 'dossier-lead');
        const decision = node('div');
        add(decision, badge(data.decision.recommendation, 'amber'), node('h3', '', data.source.title), node('p', '', data.decision.thesis));
        if (data.source.analysisMode === 'source_fallback') add(decision, badge('Limited source fallback', 'red'));
        const source = node('div', 'dossier-source');
        add(source, badge(data.source.label, data.source.label === 'Full text' ? 'green' : 'amber'),
            node('span', '', `Via ${data.source.provider}`));
        if (data.source.reference) {
            if (/^https?:\/\//i.test(data.source.reference)) {
                const link = node('a', 'dossier-reference', short(data.source.reference, 65));
                link.href = data.source.reference;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                add(source, link);
            } else add(source, node('span', 'dossier-reference', data.source.reference.replace(/^pdf:/, 'PDF: ')));
        }
        add(lead, decision, source);
        add(view, lead);
        const grid = node('div', 'dossier-card-grid');
        add(grid,
            card('Most valuable opportunity', findingBody(data.decision.opportunity), 'dossier-accent-green'),
            card('Critical evidence gap', findingBody(data.decision.gap), 'dossier-accent-amber'),
            card('Claim to challenge', findingBody(data.decision.redFlag), 'dossier-accent-red'));
        add(view, grid);
        const decisionSection = section('Decision summary', 'Use these gates before committing to a product direction.');
        const facts = node('div', 'dossier-facts');
        add(facts,
            block('Recommendation', `${data.decision.recommendation}: ${data.decision.reason}`),
            block('Source limit', data.source.note),
            block('Decision gate', data.mvp.decisionRule));
        add(decisionSection, facts);
        add(view, decisionSection);
        const next = section('First actions');
        add(next, checklist(data.claims.map(c => `${c.type}: ${short(c.nextAction, 155)}`), 'executive-action'));
        add(view, next);
        return view;
    }

    function findingBody(value) {
        const body = node('div');
        add(body, node('p', '', short(value, 290)));
        if (value.length > 290) {
            const detail = node('details', 'dossier-details');
            add(detail, node('summary', '', 'Read complete finding'), node('p', '', value));
            add(body, detail);
        }
        return body;
    }

    function claimMatrix() {
        const wrap = node('div', 'dossier-table-wrap');
        const table = node('table', 'dossier-table');
        const header = node('tr');
        ['Claim / finding', 'Priority', 'Source location', 'Status', 'Next action'].forEach(name => add(header, node('th', '', name)));
        add(table, add(node('thead'), header));
        const body = node('tbody');
        for (const claim of active.data.claims) {
            const tr = node('tr');
            const status = active.workspace.status?.[claim.id] || 'Unverified';
            const sourceCell = node('td');
            add(sourceCell, node('span', '', active.workspace.fields?.[`${claim.id}-source`] || 'Location needed'));
            const sourceLink = node('a', 'dossier-source-link', 'Review source text');
            sourceLink.href = '#sourceTextSection';
            add(sourceCell, sourceLink);
            add(tr,
                add(node('td'), node('strong', '', claim.type), node('p', '', claim.statement)),
                add(node('td'), badge(claim.priority, claim.priority === 'Highest' ? 'red' : 'amber')),
                sourceCell,
                add(node('td'), badge(status, status === 'Supported' ? 'green' : status === 'Countered' ? 'red' : 'neutral')),
                node('td', '', short(claim.nextAction, 135)));
            add(body, tr);
        }
        add(table, body);
        add(wrap, table);
        return wrap;
    }

    function protocolCard(claim) {
        const article = node('article', 'dossier-protocol dossier-card');
        const header = node('div', 'dossier-protocol-header');
        add(header, node('h4', '', claim.statement), badge(claim.priority, claim.priority === 'Highest' ? 'red' : 'amber'));
        add(article, header, node('p', 'dossier-muted', claim.rationale));
        const meta = node('div', 'dossier-protocol-meta');
        add(meta, block('Hypothesis', claim.protocol.hypothesis), block('Time / cost estimate', claim.protocol.estimate));
        add(article, meta);
        const detail = node('details', 'dossier-details');
        add(detail, node('summary', '', 'Verification protocol and evidence record'));
        const inner = node('div', 'dossier-details-body');
        add(inner, node('h5', '', 'Reproduction steps'), checklist(claim.protocol.steps, `${claim.id}-step`),
            node('h5', '', 'Required data'), list(claim.protocol.data),
            block('Strongest counter-test', claim.protocol.counterTest),
            block('What would support it', claim.protocol.success),
            block('What would falsify it', claim.protocol.falsification));
        const fields = node('div', 'dossier-edit-grid');
        add(fields,
            editable('Exact page, passage, table, or DOI', `${claim.id}-source`, 'Record a precise source location'),
            editable('Evidence supporting the claim', `${claim.id}-for`, 'Add data, calculation, or citation', true),
            editable('Contradicting evidence', `${claim.id}-against`, 'Add failed tests or alternative explanations', true));
        add(inner, fields);
        add(inner, editable('Estimated time and cost', `${claim.id}-estimate`, 'Example: 2 reviewer days plus API costs'));
        const statusLabel = node('label', 'dossier-input-wrap');
        const select = node('select', 'dossier-input');
        select.dataset.status = claim.id;
        ['Unverified', 'In progress', 'Supported', 'Countered', 'Inconclusive'].forEach(value => {
            const option = node('option', '', value);
            option.value = value;
            add(select, option);
        });
        select.value = active.workspace.status?.[claim.id] || 'Unverified';
        add(statusLabel, node('span', 'dossier-label', 'Verification status'), select);
        add(inner, statusLabel);
        add(detail, inner);
        add(article, detail);
        return article;
    }

    function validationView() {
        const view = node('div', 'dossier-view');
        const matrix = section('Claim–evidence matrix', 'Source locations and verification results start as unverified. Add them as you review the paper and data.');
        add(matrix, claimMatrix());
        add(view, matrix);
        const protocols = section('Verification protocols', 'Open each card to record evidence, complete the steps, and mark the result.');
        for (const claim of active.data.claims) add(protocols, protocolCard(claim));
        add(view, protocols);
        return view;
    }

    function architecture() {
        const flow = node('div', 'dossier-flow');
        flow.setAttribute('role', 'img');
        flow.setAttribute('aria-label', active.data.mvp.architecture.map(step => step.label).join(' to '));
        active.data.mvp.architecture.forEach((step, index) => {
            const stage = node('div', 'dossier-flow-stage');
            add(stage, node('span', 'dossier-stage-number', String(index + 1).padStart(2, '0')),
                node('strong', '', step.label), node('p', '', step.detail));
            add(flow, stage);
            if (index < active.data.mvp.architecture.length - 1) add(flow, node('span', 'dossier-flow-arrow', '→'));
        });
        return flow;
    }

    function metricDashboard() {
        const wrap = node('div', 'dossier-metric-dashboard');
        add(wrap, node('p', 'dossier-section-note', active.data.mvp.experiment.metricContext));
        const grid = node('div', 'dossier-edit-grid');
        add(grid,
            editable('Primary metric and unit', 'metric-name', 'Example: RMSE (lower is better)'),
            editable('Published or baseline result', 'metric-baseline', 'Enter the cited result'),
            editable('Prespecified pass threshold', 'metric-threshold', 'Define before testing'),
            editable('Observed independent result', 'metric-observed', 'Record after reproduction'),
            editable('Uncertainty interval', 'metric-uncertainty', 'Record CI or credible interval'),
            editable('Result / decision', 'metric-decision', 'Pending / pass / fail, with reasoning'));
        add(wrap, grid);
        return wrap;
    }

    function featureCard(feature) {
        const content = node('div');
        add(content, badge(feature.priority, feature.priority.startsWith('P0') ? 'green' : 'neutral'),
            block('Acceptance criterion', feature.acceptance));
        return card(feature.name, content);
    }

    function riskRegister() {
        const wrap = node('div', 'dossier-table-wrap');
        const table = node('table', 'dossier-table');
        const head = node('tr');
        ['Risk', 'Severity', 'Likelihood', 'Mitigation / trigger'].forEach(value => add(head, node('th', '', value)));
        add(table, add(node('thead'), head));
        const body = node('tbody');
        for (const risk of active.data.mvp.risks) {
            const tr = node('tr');
            const likelihood = node('select', 'dossier-input dossier-risk-select');
            likelihood.dataset.risk = risk.id;
            ['Not assessed', 'Low', 'Moderate', 'High'].forEach(value => {
                const option = node('option', '', value);
                option.value = value;
                add(likelihood, option);
            });
            likelihood.value = active.workspace.risks?.[risk.id] || 'Not assessed';
            likelihood.setAttribute('aria-label', `Likelihood of ${risk.name}`);
            add(tr, node('td', '', risk.name), add(node('td'), badge(risk.severity, risk.severity === 'High' ? 'red' : 'amber')),
                add(node('td'), likelihood), node('td', '', `${risk.mitigation} Review when: ${risk.trigger}`));
            add(body, tr);
        }
        add(table, body);
        add(wrap, table);
        return wrap;
    }

    function roadmap() {
        const board = node('div', 'dossier-roadmap');
        for (const phase of active.data.mvp.roadmap) {
            const item = node('article', 'dossier-roadmap-card dossier-card');
            add(item, badge(phase.window, 'green'), node('h4', '', phase.description.replace(/^Days?\s*[\d–-]+:\s*/i, '')),
                block('Owner role', phase.owner), block('Dependency', phase.dependency), block('Decision gate', phase.gate),
                checklist(['Deliverable complete and reviewed'], `${phase.id}-done`.replace(/-done$/, '')));
            add(board, item);
        }
        return board;
    }

    function buildView() {
        const view = node('div', 'dossier-view');
        const adaptation = section('Your implementation brief', 'Adapt the publication to the product or study you actually intend to build.');
        const adaptationFields = node('div', 'dossier-edit-grid');
        add(adaptationFields,
            editable('Project or study name', 'project-name', 'Give this effort a working title'),
            editable('Specific target user', 'project-user', 'Who has the problem?'),
            editable('First deliverable', 'project-deliverable', 'What will you ship or publish first?'),
            editable('Budget, access, or regulatory constraints', 'project-constraints', 'Record practical limits', true));
        add(adaptation, adaptationFields);
        add(view, adaptation);
        const brief = section('MVP specification');
        const facts = node('div', 'dossier-facts');
        add(facts, block('Target user', active.data.mvp.targetUser), block('Problem', active.data.mvp.problem),
            block('Proposed solution', active.data.mvp.solution));
        add(brief, facts);
        const io = node('div', 'dossier-two-col');
        add(io, card('Required inputs', list(active.data.mvp.inputs)), card('Expected outputs', list(active.data.mvp.outputs)));
        add(brief, io, block('Outside this MVP', active.data.mvp.excluded.join('; ')));
        add(view, brief);
        const features = section('Prioritized features', 'The first release should satisfy the P0 acceptance criteria.');
        const featureGrid = node('div', 'dossier-two-col');
        active.data.mvp.features.forEach(feature => add(featureGrid, featureCard(feature)));
        add(features, featureGrid);
        add(view, features);
        const system = section('System architecture', 'A traceable path from publication data to a defensible decision.');
        add(system, architecture(), block('Publication-specific method', active.data.decision.opportunity));
        add(view, system);
        const experiment = section('Experiment & metric dashboard', 'Record values from the paper, choose a threshold before testing, and enter independent results.');
        add(experiment, block('Hypothesis', active.data.mvp.experiment.hypothesis),
            block('Method', active.data.mvp.experiment.method), metricDashboard(),
            block('Pass condition', active.data.mvp.experiment.passCondition));
        add(view, experiment);
        const risks = section('Risks and assumptions');
        add(risks, riskRegister());
        add(view, risks);
        const schedule = section('Execution roadmap', 'Check off each phase when its deliverable and decision gate are reviewed.');
        add(schedule, roadmap());
        add(view, schedule);
        return view;
    }

    function filename() {
        return (active?.data.source.title || 'evidence-to-mvp-dossier').toLowerCase()
            .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'evidence-to-mvp-dossier';
    }

    function downloadBlob(blob, suffix) {
        const url = URL.createObjectURL(blob);
        const link = node('a');
        link.href = url;
        link.download = `${filename()}.${suffix}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function download(content, suffix, type) {
        downloadBlob(new Blob([content], { type }), suffix);
    }

    function exportData() {
        if (!active) return null;
        return { ...active.data, workspace: active.workspace, exportedAt: new Date().toISOString() };
    }

    function markdown() {
        if (!active) return '';
        const d = exportData();
        const lines = [
            `# Evidence-to-MVP Dossier: ${d.source.title}`, '',
            `Source: ${d.source.reference || 'Uploaded publication'}`, `Scope: ${d.source.label} via ${d.source.provider}`, d.source.note, '',
            '## Executive decision', '', `Recommendation: ${d.decision.recommendation}`, d.decision.reason, '',
            `Opportunity: ${d.decision.opportunity}`, `Evidence gap: ${d.decision.gap}`, `Red flag: ${d.decision.redFlag}`, '',
            '## Claim–evidence matrix and verification protocols', ''
        ];
        for (const claim of d.claims) {
            lines.push(`### ${claim.id}: ${claim.statement}`, '',
                `Type: ${claim.type} | Priority: ${claim.priority} | Status: ${d.workspace.status?.[claim.id] || 'Unverified'}`,
                `Source location: ${d.workspace.fields?.[`${claim.id}-source`] || 'Not yet recorded'}`,
                `Evidence for: ${d.workspace.fields?.[`${claim.id}-for`] || 'Not yet recorded'}`,
                `Evidence against: ${d.workspace.fields?.[`${claim.id}-against`] || 'Not yet recorded'}`,
                `Why it matters: ${claim.rationale}`, '', 'Verification steps:');
            claim.protocol.steps.forEach((step, index) => lines.push(`- [${d.workspace.checks?.[`${claim.id}-step-${index}`] ? 'x' : ' '}] ${step}`));
            lines.push('', 'Required data:', ...claim.protocol.data.map(item => `- ${item}`), '',
                `Estimated time and cost: ${d.workspace.fields?.[`${claim.id}-estimate`] || claim.protocol.estimate}`,
                `Counter-test: ${claim.protocol.counterTest}`, `Supporting signal: ${claim.protocol.success}`,
                `Falsifying signal: ${claim.protocol.falsification}`, '');
        }
        lines.push('## MVP specification', '', `Target user: ${d.mvp.targetUser}`, `Problem: ${d.mvp.problem}`,
            `Solution: ${d.mvp.solution}`, '',
            `Your project: ${d.workspace.fields?.['project-name'] || 'Not yet recorded'}`,
            `Your target user: ${d.workspace.fields?.['project-user'] || 'Not yet recorded'}`,
            `First deliverable: ${d.workspace.fields?.['project-deliverable'] || 'Not yet recorded'}`,
            `Constraints: ${d.workspace.fields?.['project-constraints'] || 'Not yet recorded'}`, '',
            '### Features', '',
            ...d.mvp.features.map(f => `- ${f.priority}: ${f.name}. Acceptance: ${f.acceptance}`), '',
            'Inputs:', ...d.mvp.inputs.map(x => `- ${x}`), 'Outputs:', ...d.mvp.outputs.map(x => `- ${x}`),
            `Excluded: ${d.mvp.excluded.join('; ')}`, '', '### Architecture', '',
            d.mvp.architecture.map(x => x.label).join(' → '),
            ...d.mvp.architecture.map(x => `- ${x.label}: ${x.detail}`), '',
            '### Experiment and metrics', '', `Hypothesis: ${d.mvp.experiment.hypothesis}`,
            `Method: ${d.mvp.experiment.method}`, `Reported metric context: ${d.mvp.experiment.metricContext}`,
            ...['name', 'baseline', 'threshold', 'observed', 'uncertainty', 'decision'].map(key => `Metric ${key}: ${d.workspace.fields?.[`metric-${key}`] || 'Not yet recorded'}`),
            `Pass condition: ${d.mvp.experiment.passCondition}`, '', '### Risks', '',
            ...d.mvp.risks.map(r => `- ${r.name} (${r.severity}; likelihood: ${d.workspace.risks?.[r.id] || 'Not assessed'}): ${r.mitigation}`), '',
            '### Roadmap', '',
            ...d.mvp.roadmap.map(p => `- [${d.workspace.checks?.[`${p.id}-done-0`] ? 'x' : ' '}] ${p.description} Owner: ${p.owner}. Dependency: ${p.dependency}. Gate: ${p.gate}.`), '',
            `Decision rule: ${d.mvp.decisionRule}`, '');
        return lines.join('\n');
    }

    function csv() {
        if (!active) return '';
        const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const rows = [['Claim ID', 'Type', 'Priority', 'Claim', 'Source location', 'Evidence for', 'Evidence against', 'Verification status', 'Next action']];
        for (const c of active.data.claims) rows.push([
            c.id, c.type, c.priority, c.statement, active.workspace.fields?.[`${c.id}-source`] || '',
            active.workspace.fields?.[`${c.id}-for`] || '', active.workspace.fields?.[`${c.id}-against`] || '',
            active.workspace.status?.[c.id] || 'Unverified', c.nextAction
        ]);
        return rows.map(row => row.map(quote).join(',')).join('\r\n');
    }

    async function exportAs(type) {
        if (!active) return;
        if (type === 'pdf') {
            const status = active.root.querySelector('#dossierExportStatus');
            status.textContent = 'Preparing designed PDF…';
            try {
                const endpoint = window.location.protocol === 'file:'
                    ? 'https://synaptic-insight-engine.vercel.app/api/export-dossier'
                    : '/api/export-dossier';
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(exportData())
                });
                if (!response.ok) throw new Error(`PDF service returned ${response.status}`);
                downloadBlob(await response.blob(), 'pdf');
                status.textContent = 'PDF downloaded.';
            } catch (error) {
                status.textContent = `PDF download failed: ${error.message}`;
            }
            return;
        }
        if (type === 'json') download(JSON.stringify(exportData(), null, 2), 'json', 'application/json');
        if (type === 'csv') download(csv(), 'csv', 'text/csv');
        if (type === 'md') download(markdown(), 'md', 'text/markdown');
        if (type === 'txt') download(markdown().replace(/^#{1,6}\s+/gm, ''), 'txt', 'text/plain');
    }

    function switchView(id) {
        if (!active) return;
        for (const button of active.root.querySelectorAll('[data-view]')) {
            const selected = button.dataset.view === id;
            button.setAttribute('aria-selected', String(selected));
            button.tabIndex = selected ? 0 : -1;
        }
        for (const panel of active.root.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== id;
    }

    function render(result, reference, container) {
        active = { data: build(result, reference), workspace: loadState(reference), root: container };
        container.replaceChildren();
        const toolbar = node('div', 'dossier-toolbar');
        const tabs = node('div', 'dossier-tabs');
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', 'Dossier views');
        VIEWS.forEach(({ id, label }) => {
            const button = node('button', 'dossier-tab', label);
            button.type = 'button';
            button.dataset.view = id;
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-controls', `dossier-panel-${id}`);
            add(tabs, button);
        });
        add(toolbar, tabs, node('span', 'dossier-progress', '0 actions completed'));
        add(container, toolbar);
        const panels = { executive: executiveView(), validation: validationView(), build: buildView() };
        for (const { id } of VIEWS) {
            panels[id].dataset.panel = id;
            panels[id].id = `dossier-panel-${id}`;
            panels[id].setAttribute('role', 'tabpanel');
            add(container, panels[id]);
        }
        const exportSection = section('Export dossier', 'Download a designed PDF, a technical brief, machine-readable data, or the claim matrix.');
        exportSection.classList.add('dossier-export');
        const exportButtons = node('div', 'dossier-export-buttons');
        [['pdf', 'Download PDF'], ['md', 'Markdown brief'], ['json', 'Structured JSON'], ['csv', 'Claim matrix CSV'], ['txt', 'Plain text']]
            .forEach(([format, label]) => {
                const button = node('button', 'dossier-export-button', label);
                button.type = 'button';
                button.dataset.export = format;
                add(exportButtons, button);
            });
        const exportStatus = node('p', 'dossier-export-status');
        exportStatus.id = 'dossierExportStatus';
        exportStatus.setAttribute('role', 'status');
        add(exportSection, exportButtons, exportStatus);
        add(container, exportSection);
        const progressNode = toolbar.querySelector('.dossier-progress');
        progressNode.id = 'dossierProgress';
        refreshProgress();
        switchView('executive');
        if (!container.dataset.bound) {
            container.addEventListener('click', event => {
                const view = event.target.closest('[data-view]');
                if (view) switchView(view.dataset.view);
                const exportButton = event.target.closest('[data-export]');
                if (exportButton) exportAs(exportButton.dataset.export);
            });
            container.addEventListener('change', event => {
                if (event.target.dataset.check) setWorkspace('checks', event.target.dataset.check, event.target.checked);
                if (event.target.dataset.status) { setWorkspace('status', event.target.dataset.status, event.target.value); updateMatrix(); }
                if (event.target.dataset.risk) setWorkspace('risks', event.target.dataset.risk, event.target.value);
            });
            container.addEventListener('input', event => {
                if (event.target.dataset.field) {
                    setWorkspace('fields', event.target.dataset.field, event.target.value);
                    if (event.target.dataset.field.endsWith('-source')) updateMatrix();
                }
            });
            container.addEventListener('keydown', event => {
                const tab = event.target.closest('[data-view]');
                if (!tab || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
                event.preventDefault();
                const index = VIEWS.findIndex(view => view.id === tab.dataset.view);
                const next = VIEWS[(index + (event.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length];
                switchView(next.id);
                container.querySelector(`[data-view="${next.id}"]`).focus();
            });
            container.dataset.bound = 'true';
        }
        return active.data;
    }

    function updateMatrix() {
        const matrix = active?.root.querySelector('.dossier-table-wrap');
        if (matrix) matrix.replaceWith(claimMatrix());
    }

    let printOpenDetails = [];
    window.addEventListener('beforeprint', () => {
        if (!active) return;
        printOpenDetails = Array.from(active.root.querySelectorAll('details:not([open])'));
        printOpenDetails.forEach(detail => { detail.open = true; });
    });
    window.addEventListener('afterprint', () => {
        printOpenDetails.forEach(detail => { detail.open = false; });
        printOpenDetails = [];
    });

    window.EvidenceDossier = { render, exportAs, exportData, build, markdown, csv };
})();

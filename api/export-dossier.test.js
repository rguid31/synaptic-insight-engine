import handler, { renderDossierPdf } from './export-dossier.js';

const sample = {
    source: { title: 'A publication-specific research test', label: 'Full text', provider: 'uploaded PDF', note: 'Original data need review.' },
    decision: { recommendation: 'Investigate', reason: 'Replication is pending.', thesis: 'Test the core effect.', opportunity: 'A reproducible method.', gap: 'No external validation.', redFlag: 'Effect may be overstated.' },
    claims: [{
        id: 'claim-1', type: 'Red flag', priority: 'Highest', statement: 'Reported improvement may be overstated.', rationale: 'The result drives the build decision.',
        protocol: { hypothesis: 'The reported improvement persists.', steps: ['Locate Table 2.', 'Recalculate the effect.'], data: ['Raw observations'], counterTest: 'Run on held-out data.', success: 'Effect remains.', falsification: 'Effect disappears.', estimate: 'Two reviewer days' }
    }],
    mvp: {
        decisionRule: 'Proceed only after independent validation.', targetUser: 'Researchers', problem: 'Evidence is uncertain.', solution: 'A reproducibility tool.',
        features: [{ priority: 'P0', name: 'Claim registry', acceptance: 'Every claim has a source location.' }],
        inputs: ['Publication', 'Data'], outputs: ['Validation record'], excluded: ['Unverified claims'],
        architecture: [{ label: 'Source', detail: 'Publication' }, { label: 'Decision', detail: 'Go or stop' }],
        experiment: { hypothesis: 'The effect persists.', method: 'Reproduce it.', metricContext: 'Mean error', passCondition: 'Beat baseline.' },
        risks: [{ id: 'risk-1', name: 'Missing data', severity: 'High', mitigation: 'Request the dataset.' }],
        roadmap: [{ id: 'phase-1', window: 'Days 1-5', description: 'Inventory claims.', owner: 'Researcher', dependency: 'Publication', gate: 'Reviewed' }]
    },
    workspace: { fields: { 'claim-1-source': 'Page 8, Table 2', 'metric-baseline': '0.41' }, status: { 'claim-1': 'In progress' }, checks: { 'claim-1-step-0': true } }
};

it('generates an actual PDF from structured dossier data', async () => {
    const pdf = await renderDossierPdf(sample);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5000);
});

it('rejects malformed PDF export requests', async () => {
    const res = {
        headers: {}, statusCode: 0, body: null,
        setHeader(key, value) { this.headers[key] = value; },
        status(value) { this.statusCode = value; return this; },
        json(value) { this.body = value; return this; }
    };
    await handler({ method: 'POST', body: { invalid: true } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('valid dossier');
});

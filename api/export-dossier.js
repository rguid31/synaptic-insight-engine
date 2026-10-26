import PDFDocument from 'pdfkit';

const INK = '#18312B';
const MUTED = '#52665F';
const GREEN = '#136F51';
const PALE = '#EAF4EE';
const LINE = '#D3E0D8';
const AMBER = '#8A5B13';

function clean(value) {
    return String(value ?? '')
        .replace(/[αβγδεηθλμπσφωΔΣ]/g, character => ({
            α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', η: 'eta', θ: 'theta',
            λ: 'lambda', μ: 'mu', π: 'pi', σ: 'sigma', φ: 'phi', ω: 'omega', Δ: 'Delta', Σ: 'Sigma'
        })[character])
        .replace(/²/g, '^2').replace(/³/g, '^3').replace(/≥/g, '>=').replace(/≤/g, '<=')
        .replace(/≠/g, '!=').replace(/≈/g, '~').replace(/±/g, '+/-').replace(/×/g, 'x')
        .replace(/[\u2010-\u2015]/g, '-')
        .replace(/\u2192/g, ' to ')
        .replace(/\u2026/g, '...')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function workspaceValue(data, key, fallback = 'Not yet recorded') {
    return clean(data.workspace?.fields?.[key] || fallback);
}

export function renderDossierPdf(data) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margins: { top: 80, left: 50, right: 50, bottom: 30 }, bufferPages: true, info: {
            Title: `Evidence-to-MVP Dossier - ${clean(data.source.title)}`,
            Author: 'Synaptic Insight Engine',
            Subject: 'Research verification and MVP planning'
        } });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('error', reject);
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        const pageWidth = doc.page.width;
        const width = pageWidth - 100;
        const bottom = doc.page.height - 75;

        const ensure = height => { if (doc.y + height > bottom) doc.addPage(); };
        const heading = (label, level = 1) => {
            ensure(level === 1 ? 65 : 42);
            doc.moveDown(level === 1 ? 1.1 : 0.7);
            doc.font('Helvetica-Bold').fontSize(level === 1 ? 18 : 11).fillColor(INK)
                .text(clean(label), 50, doc.y, { width, continued: false });
            doc.moveDown(level === 1 ? 0.55 : 0.35);
        };
        const text = (value, options = {}) => {
            const content = clean(value || 'Not established in the available source.');
            ensure(34);
            doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
                .fontSize(options.size || 9.5).fillColor(options.color || INK)
                .text(content, 50 + (options.indent || 0), doc.y, {
                    width: width - (options.indent || 0), lineGap: 3,
                    paragraphGap: options.gap ?? 8
                });
        };
        const fact = (label, value) => {
            ensure(50);
            doc.font('Helvetica-Bold').fontSize(8).fillColor(GREEN).text(clean(label).toUpperCase(), 50, doc.y, { width });
            doc.moveDown(0.18);
            text(value);
        };
        const bullets = values => {
            for (const value of values || []) {
                ensure(28);
                doc.font('Helvetica').fontSize(9.2).fillColor(INK)
                    .text(`- ${clean(value)}`, 60, doc.y, { width: width - 10, lineGap: 2, paragraphGap: 5 });
            }
            doc.moveDown(0.25);
        };
        const rule = () => {
            ensure(18);
            doc.moveTo(50, doc.y + 4).lineTo(pageWidth - 50, doc.y + 4).strokeColor(LINE).stroke();
            doc.moveDown(0.6);
        };

        // Executive cover
        doc.moveDown(0.8);
        doc.font('Helvetica-Bold').fontSize(29).fillColor(GREEN)
            .text('Evidence-to-MVP\nDossier', 50, doc.y, { width, lineGap: 1 });
        doc.moveDown(0.6);
        doc.font('Helvetica-Bold').fontSize(14).fillColor(INK).text(clean(data.source.title), 50, doc.y, { width });
        doc.moveDown(0.5);
        text(`${clean(data.source.label)} | ${clean(data.source.provider)} | ${new Date().toISOString().slice(0, 10)}`, { color: MUTED });
        if (data.source.reference) text(`Source: ${data.source.reference}`, { color: MUTED, size: 8.5 });
        rule();
        heading('Executive decision');
        fact('Recommendation', `${data.decision.recommendation}: ${data.decision.reason}`);
        fact('Working thesis', data.decision.thesis);
        fact('Most valuable opportunity', data.decision.opportunity);
        fact('Critical evidence gap', data.decision.gap);
        fact('Claim to challenge', data.decision.redFlag);
        fact('Source scope', data.source.note);
        fact('Decision gate', data.mvp.decisionRule);

        // Scientific validation
        doc.addPage();
        heading('Scientific Validation');
        text('Claims and source locations are unverified until a reviewer records evidence and completes the protocol.', { color: MUTED });
        for (const claim of data.claims || []) {
            ensure(95);
            rule();
            heading(`${clean(claim.id).toUpperCase()}  |  ${claim.type}  |  ${claim.priority}`, 2);
            text(claim.statement, { bold: true });
            fact('Verification status', data.workspace?.status?.[claim.id] || 'Unverified');
            fact('Source location', workspaceValue(data, `${claim.id}-source`));
            fact('Evidence for', workspaceValue(data, `${claim.id}-for`));
            fact('Evidence against', workspaceValue(data, `${claim.id}-against`));
            fact('Why it matters', claim.rationale);
            heading('Verification protocol', 2);
            fact('Hypothesis', claim.protocol?.hypothesis);
            (claim.protocol?.steps || []).forEach((step, index) => {
                const checked = data.workspace?.checks?.[`${claim.id}-step-${index}`] ? '[x]' : '[ ]';
                bullets([`${checked} ${step}`]);
            });
            fact('Required data', (claim.protocol?.data || []).join('; '));
            fact('Counter-test', claim.protocol?.counterTest);
            fact('Supporting signal', claim.protocol?.success);
            fact('Falsifying signal', claim.protocol?.falsification);
            fact('Estimated time and cost', workspaceValue(data, `${claim.id}-estimate`, claim.protocol?.estimate));
        }

        // Product specification
        doc.addPage();
        heading('MVP Build Plan');
        fact('Your project', workspaceValue(data, 'project-name'));
        fact('Your target user', workspaceValue(data, 'project-user'));
        fact('First deliverable', workspaceValue(data, 'project-deliverable'));
        fact('Constraints', workspaceValue(data, 'project-constraints'));
        rule();
        fact('Target user suggested by analysis', data.mvp.targetUser);
        fact('Problem', data.mvp.problem);
        fact('Proposed solution', data.mvp.solution);
        heading('Prioritized features');
        for (const feature of data.mvp.features || []) {
            ensure(52);
            text(`${feature.priority}  ${feature.name}`, { bold: true });
            text(`Acceptance: ${feature.acceptance}`, { indent: 10 });
        }
        heading('Inputs and outputs');
        fact('Inputs', (data.mvp.inputs || []).join('; '));
        fact('Outputs', (data.mvp.outputs || []).join('; '));
        fact('Outside this MVP', (data.mvp.excluded || []).join('; '));

        // Vector architecture figure
        ensure(150);
        heading('System architecture');
        const stages = data.mvp.architecture || [];
        const gap = 9;
        const boxWidth = (width - gap * (stages.length - 1)) / Math.max(stages.length, 1);
        const top = doc.y + 5;
        stages.forEach((stage, index) => {
            const x = 50 + index * (boxWidth + gap);
            doc.roundedRect(x, top, boxWidth, 72, 6).fillColor(PALE).fill();
            doc.font('Helvetica-Bold').fontSize(8.1).fillColor(GREEN)
                .text(clean(stage.label), x + 7, top + 10, { width: boxWidth - 14, height: 25 });
            doc.font('Helvetica').fontSize(7.3).fillColor(MUTED)
                .text(clean(stage.detail), x + 7, top + 35, { width: boxWidth - 14, height: 30 });
            if (index < stages.length - 1) {
                doc.moveTo(x + boxWidth + 1, top + 36).lineTo(x + boxWidth + gap - 1, top + 36)
                    .strokeColor(GREEN).lineWidth(1.5).stroke();
            }
        });
        doc.y = top + 88;

        heading('Experiment and metric dashboard');
        fact('Hypothesis', data.mvp.experiment?.hypothesis);
        fact('Method', data.mvp.experiment?.method);
        fact('Reported metric context', data.mvp.experiment?.metricContext);
        [
            ['Primary metric and unit', 'metric-name'], ['Published or baseline result', 'metric-baseline'],
            ['Prespecified pass threshold', 'metric-threshold'], ['Observed independent result', 'metric-observed'],
            ['Uncertainty interval', 'metric-uncertainty'], ['Result and decision', 'metric-decision']
        ].forEach(([label, key]) => fact(label, workspaceValue(data, key)));
        fact('Pass condition', data.mvp.experiment?.passCondition);

        heading('Risk register');
        for (const risk of data.mvp.risks || []) {
            ensure(55);
            text(`${risk.name} | Severity: ${risk.severity} | Likelihood: ${data.workspace?.risks?.[risk.id] || 'Not assessed'}`, { bold: true });
            text(`Mitigation: ${risk.mitigation}`);
        }

        heading('Execution roadmap');
        for (const phase of data.mvp.roadmap || []) {
            ensure(80);
            const done = data.workspace?.checks?.[`${phase.id}-done-0`] ? 'Complete' : 'Open';
            text(`${phase.window} | ${done} | ${phase.description}`, { bold: true });
            text(`Owner: ${phase.owner} | Dependency: ${phase.dependency} | Gate: ${phase.gate}`);
        }

        const pageCount = doc.bufferedPageRange().count;
        for (let index = 0; index < pageCount; index += 1) {
            doc.switchToPage(index);
            doc.font('Helvetica-Bold').fontSize(8).fillColor(GREEN)
                .text('SYNAPTIC INSIGHT ENGINE  /  EVIDENCE-TO-MVP DOSSIER', 50, 25, { width, lineBreak: false });
            doc.moveTo(50, 44).lineTo(pageWidth - 50, 44).strokeColor(LINE).stroke();
            doc.font('Helvetica').fontSize(8).fillColor(MUTED)
                .text(`Synaptic Insight Engine  |  ${index + 1} / ${pageCount}`, 50, doc.page.height - 50,
                    { width, align: 'right', lineBreak: false });
        }
        doc.end();
    });
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    try {
        const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        if (!data?.source?.title || !Array.isArray(data.claims) || !data.mvp || JSON.stringify(data).length > 512_000) {
            return res.status(400).json({ error: 'A valid dossier of 512 KB or less is required.' });
        }
        const pdf = await renderDossierPdf(data);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="evidence-to-mvp-dossier.pdf"');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send(pdf);
    } catch (error) {
        console.error('Dossier PDF export failed:', error.message);
        return res.status(500).json({ error: 'The dossier PDF could not be generated.' });
    }
}

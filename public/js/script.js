// --- DOM ELEMENTS ---
        const urlInput = document.getElementById('urlInput');
        const analyzeForm = document.getElementById('analyzeForm');
        const errorDiv = document.getElementById('error');
        const resultsDiv = document.getElementById('results');
        const loadingDiv = document.querySelector('.loading');
        const blueprintSection = document.getElementById('blueprintSection');
        const blueprintContent = document.getElementById('blueprintContent');
        const sourceTextSection = document.getElementById('sourceTextSection');
        const sourceTextContent = document.getElementById('sourceTextContent');
        const carouselPagesContainer = document.getElementById('carouselPages');
        const carouselIndicators = document.getElementById('carouselIndicators');

        // --- GLOBAL STATE ---
        let currentAnalysisResult = null;
        let currentPage = 0;
        let analysisHistory = JSON.parse(localStorage.getItem('analysisHistory') || '[]');
        let bookmarkedPapers = JSON.parse(localStorage.getItem('bookmarkedPapers') || '[]');

        // --- DOMAINS & CAROUSEL SETUP ---
        const domains = [
            { name: "AI/ML", icon: "🤖", url: "https://arxiv.org/list/cs.AI/recent" },
            { name: "AI in Drug Discovery", icon: "💊", url: "https://scholar.google.com/scholar?q=AI+in+drug+discovery" },
            { name: "Biotechnology", icon: "🧬", url: "https://arxiv.org/list/q-bio.BM/recent" },
            { name: "Data Science", icon: "📊", url: "https://arxiv.org/list/cs.DB/recent" },
            { name: "Personalized Med", icon: "🩺", url: "https://scholar.google.com/scholar?q=personalized+medicine" },
            { name: "Cybersecurity", icon: "🛡️", url: "https://arxiv.org/list/cs.CR/recent" },
            { name: "Climate Mitigation", icon: "🌍", url: "https://scholar.google.com/scholar?q=climate+change+mitigation" },
            { name: "Sustainable Agri", icon: "🌾", url: "https://scholar.google.com/scholar?q=sustainable+agriculture" },
            { name: "Quantum Computing", icon: "🌀", url: "https://arxiv.org/list/quant-ph/recent" },
            { name: "Neurodegenerative", icon: "🧠", url: "https://scholar.google.com/scholar?q=neurodegenerative+disease+research" },
            { name: "Blockchain", icon: "🔗", url: "https://scholar.google.com/scholar?q=blockchain+technology" },
            { name: "Waste Management", icon: "♻️", url: "https://scholar.google.com/scholar?q=waste+management+circular+economy" },
            { name: "Space Exploration", icon: "🚀", url: "https://arxiv.org/list/astro-ph/recent" },
            { name: "Advanced Materials", icon: "🔩", url: "https://scholar.google.com/scholar?q=advanced+materials+research" },
            { name: "Robotics & Automation", icon: "🤖", url: "https://arxiv.org/list/cs.RO/recent" },
            { name: "Bioinformatics", icon: "💻", url: "https://scholar.google.com/scholar?q=bioinformatics" },
            { name: "Renewable Energy", icon: "☀️", url: "https://scholar.google.com/scholar?q=renewable+energy+technology" },
            { name: "Mental Health Research", icon: "🧘", url: "https://scholar.google.com/scholar?q=mental+health+research" },
            { name: "Ecosystem Conservation", icon: "🌳", url: "https://scholar.google.com/scholar?q=ecosystem+conservation" },
            { name: "Sociology", icon: "👥", url: "https://scholar.google.com/scholar?q=sociology+research" },
            { name: "Business/Economics", icon: "📈", url: "https://arxiv.org/list/econ.GN/recent" },
            { name: "Physics", icon: "⚛️", url: "https://arxiv.org/list/physics/recent" },
            { name: "AI Engineering", icon: "⚙️", url: "https://scholar.google.com/scholar?q=AI+engineering" },
            { name: "Nanotechnology", icon: "🔬", url: "https://scholar.google.com/scholar?q=nanotechnology" }
        ];

        const totalPages = Math.ceil(domains.length / 8);

        function setupCarousel() {
            carouselPagesContainer.innerHTML = '';
            carouselIndicators.innerHTML = '';

            for (let i = 0; i < totalPages; i++) {
                const page = document.createElement('div');
                page.className = 'carousel-page';
                if (i === 0) page.classList.add('active');

                const pageDomains = domains.slice(i * 8, (i + 1) * 8);
                pageDomains.forEach((domain, index) => {
                    const domainIndex = i * 8 + index;
                    page.innerHTML += `
                        <div class="category-btn" onclick="window.open('${domain.url}', '_blank')" aria-label="Find case studies in ${domain.name}">
                            <span class="category-icon">${domain.icon}</span>
                            ${domainIndex + 1}. ${domain.name}
                        </div>
                    `;
                });
                carouselPagesContainer.appendChild(page);

                const indicator = document.createElement('div');
                indicator.className = 'indicator';
                if (i === 0) indicator.classList.add('active');
                indicator.onclick = () => goToPage(i);
                carouselIndicators.appendChild(indicator);
            }
        }

        function updateCarousel() {
            const offset = -currentPage * (100 + 5);
            carouselPagesContainer.style.transform = `translateX(${offset}%)`;
            document.querySelectorAll('.indicator').forEach((ind, i) => ind.classList.toggle('active', i === currentPage));
        }

        function nextCarouselPage() {
            currentPage = (currentPage + 1) % totalPages;
            updateCarousel();
        }

        function prevCarouselPage() {
            currentPage = (currentPage - 1 + totalPages) % totalPages;
            updateCarousel();
        }

        function goToPage(pageNumber) {
            currentPage = pageNumber;
            updateCarousel();
        }

        // --- CORE APPLICATION LOGIC ---
        async function analyzeCase() {
            const url = urlInput.value.trim();
            if (!url) {
                showToast('Please enter a valid URL', true);
                errorDiv.textContent = 'Please enter a valid URL';
                return;
            }

            // Validate URL format
            if (url.includes('arxiv.org') && url.includes('.pdf')) {
                showToast('Please use an arXiv abstract URL (e.g., https://arxiv.org/abs/2307.12008), not a PDF.', true);
                errorDiv.textContent = 'Please use an arXiv abstract URL (e.g., https://arxiv.org/abs/2307.12008), not a PDF.';
                return;
            }

            resetUI(true);

            // Auto-scroll to loading section
            const loadingSection = document.getElementById('loadingSection');
            loadingSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Initialize progress tracking
            startProgressTracking();
            updateLoadingText('🔍 Fetching research paper content...');

            try {
                const response = await fetch('/api/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                if (!response.ok) {
                    const text = await response.text();
                    let errorMessage = `HTTP error! Status: ${response.status}, Body: ${text}`;
                    try {
                        const errorData = JSON.parse(text);
                        errorMessage = errorData.error || errorMessage;
                    } catch (e) {
                        // Non-JSON response
                    }
                    throw new Error(errorMessage);
                }
                const data = await response.json();
                currentAnalysisResult = data;

                // Save to analysis history
                saveToHistory(url, data);

                displayResults(data.analysis);
                displaySourceText(data.structuredData || data.sourceText);
                generateBlueprint();
                addBookmarkButton();
                completeProgress();
                showToast('Analysis complete!');
            } catch (error) {
                console.error('Error during analysis:', error);
                let userMessage = error.message;
                if (userMessage.includes('URL not found')) {
                    userMessage += ' Ensure the arXiv URL is valid (e.g., https://arxiv.org/abs/2307.12008).';
                } else if (userMessage.includes('non-HTML resource')) {
                    userMessage += ' Use an arXiv abstract page (e.g., https://arxiv.org/abs/2307.12008).';
                } else if (userMessage.includes('Access denied') || userMessage.includes('paywall')) {
                    userMessage += ' Try an arXiv abstract URL (e.g., https://arxiv.org/abs/2307.12008) for best results.';
                }
                showToast(userMessage, true);
                errorDiv.textContent = userMessage;
            } finally {
                stopProgressTracking();
                loadingDiv.style.display = 'none';
            }
        }

        function formatRankedItem(item, baseClass) {
            // Handle both old string format and new object format for backward compatibility
            if (typeof item === 'string') {
                return `<div class="${baseClass}">${highlightTextInString(item)}</div>`;
            }

            const statusClass = getStatusClass(item.status);
            const confidenceClass = getConfidenceClass(item.confidence);
            const rankBadge = `<span class="rank-badge rank-${item.rank}">#${item.rank}</span>`;
            const statusBadge = `<span class="status-badge ${statusClass}">${item.status}</span>`;
            const confidenceBadge = item.confidence ? `<span class="confidence-badge ${confidenceClass}">${Math.round(item.confidence * 100)}%</span>` : '';
            const tagsBadges = item.tags ? item.tags.map(tag => `<span class="tag-badge">${tag}</span>`).join('') : '';

            return `
                <div class="${baseClass} ranked-item">
                    <div class="item-header">
                        ${rankBadge}
                        ${statusBadge}
                        ${confidenceBadge}
                        <div class="tags-container">${tagsBadges}</div>
                    </div>
                    <div class="item-content">${highlightTextInString(item.finding || item)}</div>
                </div>
            `;
        }

        function getStatusClass(status) {
            const statusMap = {
                'CRITICAL': 'status-critical',
                'HIGH': 'status-high',
                'MODERATE': 'status-moderate',
                'LOW': 'status-low'
            };
            return statusMap[status] || 'status-moderate';
        }

        function getConfidenceClass(confidence) {
            if (!confidence) return '';
            if (confidence >= 0.9) return 'confidence-very-high';
            if (confidence >= 0.75) return 'confidence-high';
            if (confidence >= 0.6) return 'confidence-medium';
            if (confidence >= 0.4) return 'confidence-low';
            return 'confidence-very-low';
        }

        function displayResults(analysis) {
            resultsDiv.innerHTML = '';
            const categories = {
                exploits: { title: "Exploits & Red Flags", icon: "🚩", class: "exploit-item" },
                opportunities: { title: "Opportunities & Core Tech", icon: "💡", class: "opportunity-item" },
                gaps: { title: "Knowledge Gaps", icon: "❓", class: "gap-item" },
                models: { title: "Growth Models", icon: "📈", class: "model-item" },
                ethical_concerns: { title: "Ethical Concerns & Bias", icon: "⚖️", class: "ethical-item" },
                reproducibility_issues: { title: "Reproducibility Issues", icon: "🔄", class: "reproducibility-item" }
            };

            for (const key in categories) {
                const category = categories[key];
                const items = analysis[key] || [];
                let itemsHtml = items.length > 0
                    ? items.map(item => formatRankedItem(item, category.class)).join('')
                    : `<p>No significant items found.</p>`;

                const cardHtml = `
                    <div class="result-card">
                        <h3 class="card-title"><span class="card-icon">${category.icon}</span> ${category.title}</h3>
                        ${itemsHtml}
                    </div>
                `;
                resultsDiv.innerHTML += cardHtml;
            }
            resultsDiv.style.display = 'grid';
            document.querySelector('.reset-btn').style.display = 'flex';

            // Generate and display research paper score
            displayResearchScore(analysis);

            // Add search and filter functionality
            setTimeout(() => addSearchAndFilterControls(), 100);
        }

        function calculateResearchScore(analysis) {
            const scoring = {
                methodological_rigor: 0,
                reproducibility: 0,
                ethical_compliance: 0,
                statistical_validity: 0,
                transparency: 0,
                innovation_potential: 0,
                overall_quality: 0
            };

            // Calculate scores based on analysis results
            const exploits = analysis.exploits || [];
            const opportunities = analysis.opportunities || [];
            const gaps = analysis.gaps || [];
            const ethicalConcerns = analysis.ethical_concerns || [];
            const reproducibilityIssues = analysis.reproducibility_issues || [];
            const models = analysis.models || [];

            // Methodological Rigor (0-100) - penalized by exploits and gaps
            const criticalExploits = exploits.filter(item =>
                (typeof item === 'object' && item.status === 'CRITICAL') ||
                (typeof item === 'string' && item.includes('critical'))
            ).length;
            const methodologicalGaps = gaps.filter(item => {
                const content = typeof item === 'object' ? item.finding : item;
                return content.toLowerCase().includes('control') ||
                       content.toLowerCase().includes('methodology') ||
                       content.toLowerCase().includes('sample');
            }).length;
            scoring.methodological_rigor = Math.max(0, 100 - (criticalExploits * 25) - (methodologicalGaps * 15));

            // Reproducibility (0-100) - based on reproducibility issues
            const criticalRepro = reproducibilityIssues.filter(item =>
                (typeof item === 'object' && item.status === 'CRITICAL') ||
                (typeof item === 'string')
            ).length;
            scoring.reproducibility = Math.max(0, 100 - (criticalRepro * 20));

            // Ethical Compliance (0-100) - penalized by ethical concerns
            const criticalEthical = ethicalConcerns.filter(item =>
                (typeof item === 'object' && (item.status === 'CRITICAL' || item.status === 'HIGH')) ||
                (typeof item === 'string')
            ).length;
            scoring.ethical_compliance = Math.max(0, 100 - (criticalEthical * 18));

            // Statistical Validity (0-100) - based on statistical gaps and model quality
            const statisticalIssues = gaps.filter(item => {
                const content = typeof item === 'object' ? item.finding : item;
                return content.toLowerCase().includes('statistical') ||
                       content.toLowerCase().includes('significance') ||
                       content.toLowerCase().includes('p-value');
            }).length;
            scoring.statistical_validity = Math.max(0, 100 - (statisticalIssues * 20));

            // Transparency (0-100) - based on data sharing and openness issues
            const transparencyIssues = reproducibilityIssues.filter(item => {
                const content = typeof item === 'object' ? item.finding : item;
                return content.toLowerCase().includes('data') ||
                       content.toLowerCase().includes('code') ||
                       content.toLowerCase().includes('sharing');
            }).length;
            scoring.transparency = Math.max(0, 100 - (transparencyIssues * 22));

            // Innovation Potential (0-100) - boosted by high-quality opportunities
            const highValueOpportunities = opportunities.filter(item =>
                (typeof item === 'object' && (item.status === 'HIGH' || item.rank <= 2)) ||
                (typeof item === 'string')
            ).length;
            scoring.innovation_potential = Math.min(100, 40 + (highValueOpportunities * 15));

            // Overall Quality (weighted average)
            scoring.overall_quality = Math.round(
                (scoring.methodological_rigor * 0.25) +
                (scoring.reproducibility * 0.20) +
                (scoring.ethical_compliance * 0.15) +
                (scoring.statistical_validity * 0.20) +
                (scoring.transparency * 0.10) +
                (scoring.innovation_potential * 0.10)
            );

            return scoring;
        }

        function displayResearchScore(analysis) {
            const scores = calculateResearchScore(analysis);

            const scoreHtml = `
                <div class="research-score-section">
                    <h3 class="score-title">📊 Research Paper Quality Score</h3>
                    <div class="score-chart">
                        <div class="overall-score">
                            <div class="overall-score-circle ${getScoreClass(scores.overall_quality)}">
                                <span class="score-number">${scores.overall_quality}</span>
                                <span class="score-label">Overall</span>
                            </div>
                        </div>
                        <div class="detailed-scores">
                            ${Object.entries(scores).filter(([key]) => key !== 'overall_quality').map(([key, value]) => `
                                <div class="score-metric">
                                    <div class="metric-label">${formatMetricName(key)}</div>
                                    <div class="metric-bar">
                                        <div class="metric-fill ${getScoreClass(value)}" style="width: ${value}%"></div>
                                        <span class="metric-value">${value}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="score-recommendations">
                        ${generateRecommendations(scores)}
                    </div>
                </div>
            `;

            resultsDiv.innerHTML += scoreHtml;

            // Add export functionality
            addExportButtons();
        }

        function formatMetricName(key) {
            return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        }

        function getScoreClass(score) {
            if (score >= 80) return 'score-excellent';
            if (score >= 70) return 'score-good';
            if (score >= 60) return 'score-fair';
            if (score >= 40) return 'score-poor';
            return 'score-critical';
        }

        function generateRecommendations(scores) {
            const recommendations = [];

            if (scores.methodological_rigor < 70) {
                recommendations.push("🔬 <strong>Strengthen methodology:</strong> Add proper control groups, increase sample size, and clarify experimental design.");
            }

            if (scores.reproducibility < 60) {
                recommendations.push("🔄 <strong>Improve reproducibility:</strong> Share code, data, and detailed procedures. Provide clear replication instructions.");
            }

            if (scores.ethical_compliance < 80) {
                recommendations.push("⚖️ <strong>Address ethical concerns:</strong> Implement bias mitigation, ensure diverse datasets, and conduct ethical review.");
            }

            if (scores.statistical_validity < 70) {
                recommendations.push("📈 <strong>Enhance statistical rigor:</strong> Add significance testing, confidence intervals, and effect size reporting.");
            }

            if (scores.transparency < 60) {
                recommendations.push("📊 <strong>Increase transparency:</strong> Make data publicly available, document all analysis steps, and disclose conflicts of interest.");
            }

            if (recommendations.length === 0) {
                recommendations.push("✅ <strong>Excellent work!</strong> This research demonstrates high quality across all evaluation metrics.");
            }

            return recommendations.map(rec => `<div class="recommendation">${rec}</div>`).join('');
        }

        // --- HISTORY & BOOKMARKING FUNCTIONS ---
        function saveToHistory(url, data) {
            const historyItem = {
                id: Date.now().toString(),
                url: url,
                title: extractTitle(data.structuredData || data.sourceText),
                timestamp: new Date().toISOString(),
                overallScore: calculateResearchScore(data.analysis).overall_quality,
                analysis: data.analysis,
                structuredData: data.structuredData,
                sourceText: data.sourceText
            };

            // Add to beginning and limit to 50 items
            analysisHistory.unshift(historyItem);
            analysisHistory = analysisHistory.slice(0, 50);

            localStorage.setItem('analysisHistory', JSON.stringify(analysisHistory));
            updateHistoryDisplay();
        }

        function extractTitle(data) {
            if (Array.isArray(data)) {
                const titleSection = data.find(section => section.section === 'title');
                return titleSection ? titleSection.content.substring(0, 100) : 'Untitled Paper';
            }
            // Extract title from text format
            const titleMatch = data.match(/Title:\s*([^\n]+)/);
            return titleMatch ? titleMatch[1].substring(0, 100) : 'Untitled Paper';
        }

        async function addBookmarkButton() {
            if (!currentAnalysisResult) return;

            // Remove existing bookmark button if present
            const existingBtn = document.querySelector('.bookmark-btn');
            if (existingBtn) {
                existingBtn.remove();
            }

            const bookmarkBtn = document.createElement('button');
            bookmarkBtn.className = 'bookmark-btn';
            const url = urlInput.value.trim();

            // Show loading state initially
            bookmarkBtn.innerHTML = '⏳ Loading...';
            bookmarkBtn.onclick = toggleBookmark;
            bookmarkBtn.style.display = 'flex';

            const resetBtn = document.querySelector('.reset-btn');
            if (resetBtn) {
                resetBtn.parentNode.insertBefore(bookmarkBtn, resetBtn);
            }

            // Update button text asynchronously
            try {
                const isBookmarkedResult = await isBookmarked(url);
                bookmarkBtn.innerHTML = isBookmarkedResult ? '⭐ Bookmarked' : '☆ Bookmark';
            } catch (error) {
                console.error('Error checking bookmark status:', error);
                bookmarkBtn.innerHTML = '☆ Bookmark';
            }
        }

        async function toggleBookmark() {
            if (!currentAnalysisResult) return;

            // Check if user is signed in
            if (!currentUser) {
                showToast('Sign in to bookmark papers across devices!');
                showAuthModal();
                return;
            }

            const url = urlInput.value.trim();
            const bookmarkBtn = document.querySelector('.bookmark-btn');
            if (bookmarkBtn) {
                bookmarkBtn.disabled = true;
                bookmarkBtn.innerHTML = '⏳ Loading...';
            }

            try {
                const { db } = await import('./lib/supabase.js');

                // First, save the analysis if it's not already saved
                let analysisId = currentAnalysisResult.id;
                if (!analysisId) {
                    const analysisData = {
                        url: url,
                        title: extractTitle(currentAnalysisResult.structuredData || currentAnalysisResult.sourceText),
                        analysis: currentAnalysisResult.analysis,
                        structuredData: currentAnalysisResult.structuredData,
                        sourceText: currentAnalysisResult.sourceText,
                        overallScore: calculateResearchScore(currentAnalysisResult.analysis).overall_quality
                    };

                    const { data: savedAnalysis, error: saveError } = await db.saveAnalysis(currentUser.id, analysisData);
                    if (saveError) {
                        throw new Error('Failed to save analysis: ' + saveError.message);
                    }
                    analysisId = savedAnalysis.id;
                    currentAnalysisResult.id = analysisId;
                }

                // Check if already bookmarked
                const { exists } = await db.isBookmarked(currentUser.id, analysisId);

                if (exists) {
                    // Remove bookmark
                    const { error } = await db.removeBookmark(currentUser.id, analysisId);
                    if (error) throw new Error('Failed to remove bookmark: ' + error.message);
                    showToast('Bookmark removed');
                } else {
                    // Add bookmark
                    const bookmarkData = {
                        url: url,
                        title: extractTitle(currentAnalysisResult.structuredData || currentAnalysisResult.sourceText),
                        overallScore: calculateResearchScore(currentAnalysisResult.analysis).overall_quality
                    };

                    const { error } = await db.saveBookmark(currentUser.id, analysisId, bookmarkData);
                    if (error) throw new Error('Failed to save bookmark: ' + error.message);
                    showToast('Paper bookmarked!');
                }

                updateBookmarkButton();
                updateHistoryDisplay();

            } catch (error) {
                console.error('Bookmark toggle error:', error);
                showToast('Error updating bookmark: ' + error.message, true);

                // Fallback to localStorage for offline mode
                toggleBookmarkLocalStorage();
            } finally {
                if (bookmarkBtn) {
                    bookmarkBtn.disabled = false;
                }
            }
        }

        function toggleBookmarkLocalStorage() {
            // Fallback localStorage implementation
            const url = urlInput.value.trim();
            const isCurrentlyBookmarked = bookmarkedPapers.some(item => item.url === url);

            if (isCurrentlyBookmarked) {
                bookmarkedPapers = bookmarkedPapers.filter(item => item.url !== url);
                showToast('Bookmark removed (offline)');
            } else {
                // Auto-generate categories/tags based on content
                const title = extractTitle(currentAnalysisResult.structuredData || currentAnalysisResult.sourceText);
                const content = JSON.stringify(currentAnalysisResult.analysis || {}).toLowerCase();
                const categories = autoCategorizePaper(title, content);

                const bookmarkItem = {
                    id: Date.now().toString(),
                    url: url,
                    title: title,
                    timestamp: new Date().toISOString(),
                    overallScore: calculateResearchScore(currentAnalysisResult.analysis).overall_quality,
                    categories: categories,
                    tags: generateTags(title, content)
                };
                bookmarkedPapers.unshift(bookmarkItem);
                showToast('Paper bookmarked (offline)');
            }

            localStorage.setItem('bookmarkedPapers', JSON.stringify(bookmarkedPapers));
            updateBookmarkButton();
            updateHistoryDisplay();
        }

        async function isBookmarked(url) {
            // If user is signed in, check Supabase
            if (currentUser && currentAnalysisResult?.id) {
                try {
                    const { db } = await import('./lib/supabase.js');
                    const { exists } = await db.isBookmarked(currentUser.id, currentAnalysisResult.id);
                    return exists;
                } catch (error) {
                    console.error('Error checking bookmark status:', error);
                    // Fallback to localStorage
                }
            }

            // Fallback to localStorage
            return bookmarkedPapers.some(item => item.url === url);
        }

        function autoCategorizePaper(title, content) {
            const categories = [];
            const titleLower = (title || '').toLowerCase();
            const contentLower = content.toLowerCase();

            // Define category keywords
            const categoryMap = {
                'Machine Learning': ['machine learning', 'ml', 'neural', 'deep learning', 'ai', 'artificial intelligence', 'model', 'training', 'algorithm'],
                'Education': ['education', 'teaching', 'learning', 'student', 'curriculum', 'pedagogy', 'academic'],
                'Cryptography': ['cryptography', 'encryption', 'crypto', 'security', 'hash', 'blockchain', 'cipher'],
                'Medicine': ['medical', 'medicine', 'health', 'clinical', 'patient', 'treatment', 'therapy'],
                'Computer Science': ['computer', 'software', 'programming', 'system', 'database', 'computing'],
                'Physics': ['physics', 'quantum', 'particle', 'energy', 'theory', 'experiment'],
                'Biology': ['biology', 'biological', 'cell', 'gene', 'protein', 'dna', 'molecular'],
                'Mathematics': ['mathematics', 'mathematical', 'theorem', 'proof', 'equation', 'analysis']
            };

            // Check for category matches
            for (const [category, keywords] of Object.entries(categoryMap)) {
                const hasMatch = keywords.some(keyword =>
                    titleLower.includes(keyword) || contentLower.includes(keyword)
                );
                if (hasMatch) {
                    categories.push(category);
                }
            }

            // Default category if none found
            if (categories.length === 0) {
                categories.push('Other');
            }

            return categories;
        }

        function generateTags(title, content) {
            const tags = new Set();
            const text = ((title || '') + ' ' + content).toLowerCase();

            // Common research tags
            const tagKeywords = [
                'survey', 'review', 'systematic', 'meta-analysis', 'empirical', 'experimental',
                'theoretical', 'novel', 'approach', 'framework', 'methodology', 'algorithm',
                'analysis', 'evaluation', 'comparison', 'performance', 'optimization',
                'deep', 'neural', 'network', 'learning', 'supervised', 'unsupervised',
                'classification', 'prediction', 'regression', 'clustering', 'detection'
            ];

            tagKeywords.forEach(keyword => {
                if (text.includes(keyword)) {
                    tags.add(keyword);
                }
            });

            return Array.from(tags).slice(0, 8); // Limit to 8 tags
        }

        async function updateBookmarkButton() {
            const bookmarkBtn = document.querySelector('.bookmark-btn');
            if (bookmarkBtn && currentAnalysisResult) {
                const url = urlInput.value.trim();
                const isBookmarkedResult = await isBookmarked(url);
                bookmarkBtn.innerHTML = isBookmarkedResult ? '⭐ Bookmarked' : '☆ Bookmark';
            }
        }

        function updateHistoryDisplay() {
            // This will be called when we add the history sidebar
        }

        // --- SEARCH & FILTER FUNCTIONS ---
        function addSearchAndFilterControls() {
            // Remove existing search controls if present
            const existingControls = document.querySelector('.search-controls');
            if (existingControls) {
                existingControls.remove();
            }

            const searchControlsHtml = `
                <div class="search-controls">
                    <div class="search-bar">
                        <input type="text" id="searchInput" placeholder="Search findings..." class="search-input" onkeyup="if(event.key==='Enter') searchResults()">
                        <button onclick="searchResults()" class="search-btn">🔍</button>
                    </div>
                    <div class="filter-controls">
                        <select id="statusFilter" class="filter-select" onchange="filterResults()">
                            <option value="">All Status</option>
                            <option value="CRITICAL">Critical</option>
                            <option value="HIGH">High</option>
                            <option value="MODERATE">Moderate</option>
                            <option value="LOW">Low</option>
                        </select>
                        <select id="rankFilter" class="filter-select" onchange="filterResults()">
                            <option value="">All Ranks</option>
                            <option value="1">Rank 1</option>
                            <option value="2">Rank 2</option>
                            <option value="3">Rank 3</option>
                            <option value="4">Rank 4</option>
                            <option value="5">Rank 5</option>
                        </select>
                        <select id="categoryFilter" class="filter-select" onchange="filterResults()">
                            <option value="">All Categories</option>
                            <option value="exploits">Exploits</option>
                            <option value="opportunities">Opportunities</option>
                            <option value="gaps">Gaps</option>
                            <option value="models">Models</option>
                            <option value="ethical_concerns">Ethical Concerns</option>
                            <option value="reproducibility_issues">Reproducibility</option>
                        </select>
                        <button onclick="clearFilters()" class="clear-filters-btn">Clear Filters</button>
                    </div>
                </div>
            `;

            // Insert search controls before the results
            resultsDiv.insertAdjacentHTML('beforebegin', searchControlsHtml);
        }

        function searchResults() {
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();
            const resultCards = document.querySelectorAll('.result-card');

            resultCards.forEach(card => {
                const cardText = card.textContent.toLowerCase();
                const shouldShow = searchTerm === '' || cardText.includes(searchTerm);
                card.style.display = shouldShow ? 'block' : 'none';
            });

            // Also search within individual items
            const rankedItems = document.querySelectorAll('.ranked-item');
            rankedItems.forEach(item => {
                const itemText = item.textContent.toLowerCase();
                const shouldShow = searchTerm === '' || itemText.includes(searchTerm);
                item.style.display = shouldShow ? 'block' : 'none';
            });
        }

        function filterResults() {
            const statusFilter = document.getElementById('statusFilter')?.value || '';
            const rankFilter = document.getElementById('rankFilter')?.value || '';
            const categoryFilter = document.getElementById('categoryFilter')?.value || '';

            const resultCards = document.querySelectorAll('.result-card');

            resultCards.forEach(card => {
                let shouldShowCard = true;

                // Category filter
                if (categoryFilter) {
                    const cardTitle = card.querySelector('.card-title')?.textContent.toLowerCase() || '';
                    const categoryMatch = {
                        'exploits': cardTitle.includes('exploits'),
                        'opportunities': cardTitle.includes('opportunities'),
                        'gaps': cardTitle.includes('gaps'),
                        'models': cardTitle.includes('models'),
                        'ethical_concerns': cardTitle.includes('ethical'),
                        'reproducibility_issues': cardTitle.includes('reproducibility')
                    };
                    shouldShowCard = categoryMatch[categoryFilter] || false;
                }

                if (shouldShowCard) {
                    card.style.display = 'block';

                    // Filter individual items within visible cards
                    const rankedItems = card.querySelectorAll('.ranked-item');
                    rankedItems.forEach(item => {
                        let shouldShowItem = true;

                        // Status filter
                        if (statusFilter) {
                            const statusBadge = item.querySelector('.status-badge');
                            shouldShowItem = statusBadge && statusBadge.textContent === statusFilter;
                        }

                        // Rank filter
                        if (shouldShowItem && rankFilter) {
                            const rankBadge = item.querySelector('.rank-badge');
                            shouldShowItem = rankBadge && rankBadge.textContent.includes(`#${rankFilter}`);
                        }

                        item.style.display = shouldShowItem ? 'block' : 'none';
                    });
                } else {
                    card.style.display = 'none';
                }
            });
        }

        function clearFilters() {
            document.getElementById('searchInput').value = '';
            document.getElementById('statusFilter').value = '';
            document.getElementById('rankFilter').value = '';
            document.getElementById('categoryFilter').value = '';

            // Show all items
            const allCards = document.querySelectorAll('.result-card');
            const allItems = document.querySelectorAll('.ranked-item');

            allCards.forEach(card => card.style.display = 'block');
            allItems.forEach(item => item.style.display = 'block');
        }

        // --- EXPORT FUNCTIONALITY ---
        function addExportButtons() {
            // Remove existing export controls if present
            const existingControls = document.querySelector('.export-controls');
            if (existingControls) {
                existingControls.remove();
            }

            const exportControlsHtml = `
                <div class="export-controls">
                    <h3>📊 Export Options</h3>
                    <div class="export-buttons">
                        <button onclick="exportToCSV()" class="export-btn csv-btn">📄 Export CSV</button>
                        <button onclick="exportToPDF()" class="export-btn pdf-btn">📑 Export PDF</button>
                        <button onclick="exportToJSON()" class="export-btn json-btn">💾 Export JSON</button>
                        <button onclick="copyToClipboard()" class="export-btn copy-btn">📋 Copy Text</button>
                    </div>
                </div>
            `;

            resultsDiv.insertAdjacentHTML('afterend', exportControlsHtml);
        }

        function exportToCSV() {
            if (!currentAnalysisResult) {
                showToast('No analysis data to export', true);
                return;
            }

            const analysis = currentAnalysisResult.analysis;
            const scores = calculateResearchScore(analysis);
            let csvContent = 'Category,Rank,Status,Tags,Finding,Score\n';

            // Add all findings
            Object.entries(analysis).forEach(([category, items]) => {
                if (Array.isArray(items)) {
                    items.forEach(item => {
                        if (typeof item === 'object') {
                            const finding = (item.finding || '').replace(/"/g, '""');
                            const tags = Array.isArray(item.tags) ? item.tags.join(';') : '';
                            csvContent += `"${category}","${item.rank || ''}","${item.status || ''}","${tags}","${finding}",""\n`;
                        } else {
                            csvContent += `"${category}","","","","${item.replace(/"/g, '""')}",""\n`;
                        }
                    });
                }
            });

            // Add scores
            csvContent += '\nScoring Metrics,,,,,\n';
            Object.entries(scores).forEach(([metric, score]) => {
                csvContent += `"${formatMetricName(metric)}","","","","","${score}"\n`;
            });

            downloadFile(csvContent, 'research-analysis.csv', 'text/csv');
        }

        function exportToPDF() {
            // For now, create a formatted text version that can be converted to PDF
            if (!currentAnalysisResult) {
                showToast('No analysis data to export', true);
                return;
            }

            const analysis = currentAnalysisResult.analysis;
            const scores = calculateResearchScore(analysis);
            const title = extractTitle(currentAnalysisResult.structuredData || currentAnalysisResult.sourceText);

            let pdfContent = `RESEARCH PAPER ANALYSIS REPORT\n`;
            pdfContent += `${'='.repeat(50)}\n\n`;
            pdfContent += `Paper: ${title}\n`;
            pdfContent += `Analysis Date: ${new Date().toLocaleDateString()}\n`;
            pdfContent += `Overall Quality Score: ${scores.overall_quality}/100\n\n`;

            // Add detailed scores
            pdfContent += `QUALITY METRICS:\n`;
            pdfContent += `${'-'.repeat(20)}\n`;
            Object.entries(scores).filter(([key]) => key !== 'overall_quality').forEach(([metric, score]) => {
                pdfContent += `${formatMetricName(metric)}: ${score}/100\n`;
            });

            // Add findings by category
            Object.entries(analysis).forEach(([category, items]) => {
                if (Array.isArray(items) && items.length > 0) {
                    pdfContent += `\n${category.toUpperCase().replace('_', ' ')}:\n`;
                    pdfContent += `${'-'.repeat(30)}\n`;

                    items.forEach((item, index) => {
                        if (typeof item === 'object') {
                            pdfContent += `${index + 1}. [Rank ${item.rank || 'N/A'}] [${item.status || 'N/A'}] `;
                            pdfContent += `${item.finding || item}\n\n`;
                        } else {
                            pdfContent += `${index + 1}. ${item}\n\n`;
                        }
                    });
                }
            });

            downloadFile(pdfContent, 'research-analysis.txt', 'text/plain');
            showToast('Text report exported! Use a PDF converter for final PDF format.');
        }

        function exportToJSON() {
            if (!currentAnalysisResult) {
                showToast('No analysis data to export', true);
                return;
            }

            const exportData = {
                metadata: {
                    exportDate: new Date().toISOString(),
                    paperTitle: extractTitle(currentAnalysisResult.structuredData || currentAnalysisResult.sourceText),
                    url: urlInput.value.trim()
                },
                scores: calculateResearchScore(currentAnalysisResult.analysis),
                analysis: currentAnalysisResult.analysis,
                structuredData: currentAnalysisResult.structuredData,
                sourceText: currentAnalysisResult.sourceText
            };

            const jsonContent = JSON.stringify(exportData, null, 2);
            downloadFile(jsonContent, 'research-analysis.json', 'application/json');
        }

        function copyToClipboard() {
            if (!currentAnalysisResult) {
                showToast('No analysis data to copy', true);
                return;
            }

            const analysis = currentAnalysisResult.analysis;
            const scores = calculateResearchScore(analysis);
            const title = extractTitle(currentAnalysisResult.structuredData || currentAnalysisResult.sourceText);

            let clipboardContent = `Research Paper Analysis: ${title}\n`;
            clipboardContent += `Overall Quality Score: ${scores.overall_quality}/100\n\n`;

            // Add key findings summary
            Object.entries(analysis).forEach(([category, items]) => {
                if (Array.isArray(items) && items.length > 0) {
                    clipboardContent += `${category.toUpperCase().replace('_', ' ')} (${items.length} items):\n`;
                    const topItems = items.slice(0, 3);
                    topItems.forEach((item, index) => {
                        const content = typeof item === 'object' ? (item.finding || item) : item;
                        clipboardContent += `  ${index + 1}. ${content.substring(0, 150)}...\n`;
                    });
                    clipboardContent += '\n';
                }
            });

            navigator.clipboard.writeText(clipboardContent).then(() => {
                showToast('Analysis summary copied to clipboard!');
            }).catch(() => {
                showToast('Failed to copy to clipboard', true);
            });
        }

        function downloadFile(content, filename, mimeType) {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast(`${filename} downloaded successfully!`);
        }

        function displaySourceText(data) {
            if (Array.isArray(data)) {
                // Display structured JSON format
                const formattedHTML = formatStructuredData(data);
                sourceTextContent.innerHTML = formattedHTML;
            } else {
                // Display traditional text format
                const formattedText = formatSourceText(data);
                sourceTextContent.innerHTML = formattedText;
            }
            sourceTextSection.style.display = 'block';
        }

        function formatStructuredData(structuredData) {
            let html = '<div class="structured-data">';

            structuredData.forEach(section => {
                html += `<div class="json-section">`;
                html += `<div class="json-section-title">${section.section.charAt(0).toUpperCase() + section.section.slice(1).replace('_', ' ')}</div>`;
                html += `<div class="json-section-content">`;

                if (typeof section.content === 'string') {
                    html += `<p>${section.content}</p>`;
                } else if (Array.isArray(section.content)) {
                    html += '<ul>';
                    section.content.forEach(item => {
                        html += `<li>${item}</li>`;
                    });
                    html += '</ul>';
                } else if (typeof section.content === 'object') {
                    html += '<div class="json-object">';
                    for (const [key, value] of Object.entries(section.content)) {
                        html += `<div class="json-key-value">`;
                        html += `<span class="json-key">${key}:</span> `;
                        if (Array.isArray(value)) {
                            html += '<ul>';
                            value.forEach(item => {
                                html += `<li>${item}</li>`;
                            });
                            html += '</ul>';
                        } else {
                            html += `<span class="json-value">${value}</span>`;
                        }
                        html += '</div>';
                    }
                    html += '</div>';
                }

                html += '</div></div>';
            });

            html += '</div>';
            return html;
        }

        function formatSourceText(text) {
            // Replace patterns for common research paper sections with bolded titles
            let formatted = text
                .replace(/^Title:\s*/gmi, '<strong>Title:</strong> ')
                .replace(/^Authors?:\s*/gmi, '<strong>Authors:</strong> ')
                .replace(/^Abstract:\s*/gmi, '<strong>Abstract:</strong> ')
                .replace(/^Full Content:\s*/gmi, '<strong>Full Content:</strong> ')
                .replace(/^Introduction:\s*/gmi, '<strong>Introduction:</strong> ')
                .replace(/^Methodology:\s*/gmi, '<strong>Methodology:</strong> ')
                .replace(/^Results:\s*/gmi, '<strong>Results:</strong> ')
                .replace(/^Discussion:\s*/gmi, '<strong>Discussion:</strong> ')
                .replace(/^Conclusion:\s*/gmi, '<strong>Conclusion:</strong> ')
                .replace(/^References:\s*/gmi, '<strong>References:</strong> ');

            // Convert line breaks to HTML
            formatted = formatted.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');

            // Wrap in paragraph tags if not already wrapped
            if (!formatted.startsWith('<p>')) {
                formatted = '<p>' + formatted + '</p>';
            }

            return formatted;
        }

        function toggleSourceText() {
            const content = sourceTextContent;
            const arrow = document.getElementById('sourceTextArrow');

            if (content.classList.contains('collapsed')) {
                content.classList.remove('collapsed');
                content.classList.add('expanded');
                arrow.classList.add('expanded');
            } else {
                content.classList.remove('expanded');
                content.classList.add('collapsed');
                arrow.classList.remove('expanded');
            }
        }

        // --- UTILITY & HELPER FUNCTIONS ---
        function showToast(message, isError = false) {
            const toast = document.createElement('div');
            toast.className = `toast ${isError ? 'error' : ''}`;
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => { toast.classList.add('show'); }, 10);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => document.body.removeChild(toast), 300);
            }, 4000);
        }

        function updateLoadingText(text) {
            document.getElementById('loadingText').textContent = text;
        }

        function resetUI(isLoading = false) {
            resultsDiv.style.display = 'none';
            blueprintSection.style.display = 'none';
            sourceTextSection.style.display = 'none';
            errorDiv.textContent = '';
            loadingDiv.style.display = isLoading ? 'block' : 'none';

            // Reset progress tracking
            if (!isLoading) {
                stopProgressTracking();
            }

            // Clean up new elements
            const searchControls = document.querySelector('.search-controls');
            if (searchControls) searchControls.remove();

            const exportControls = document.querySelector('.export-controls');
            if (exportControls) exportControls.remove();

            const bookmarkBtn = document.querySelector('.bookmark-btn');
            if (bookmarkBtn) bookmarkBtn.style.display = 'none';

            if (!isLoading) {
                urlInput.value = '';
                document.querySelector('.reset-btn').style.display = 'none';
                currentAnalysisResult = null;
            }
        }

        function loadRandomExample() {
            const examples = [
                { url: 'https://arxiv.org/abs/2307.12008' },
                { url: 'https://arxiv.org/abs/2409.02098' },
                { url: 'https://arxiv.org/abs/2303.08774' }
            ];
            const randomExample = examples[Math.floor(Math.random() * examples.length)];
            urlInput.value = randomExample.url;
            showToast('Random arXiv abstract URL loaded. Click "Analyze" to proceed.');
        }

        function highlightTextInString(text) {
            if (!currentAnalysisResult || !currentAnalysisResult.sourceText) return text;
            const keywords = text.match(/"(.*?)"/g);
            if (!keywords) return text;

            const keyword = keywords[0].replace(/"/g, '');
            return `${text} <a href="#sourceTextSection" onclick="event.preventDefault(); scrollToHighlight('${keyword.replace(/'/g, "\\'")}')" class="context-link">(See context)</a>`;
        }

        function scrollToHighlight(keyword) {
            const contentEl = sourceTextContent;
            const originalHTML = contentEl.innerHTML;

            // Expand the dropdown if it's collapsed
            if (contentEl.classList.contains('collapsed')) {
                toggleSourceText();
            }

            const regex = new RegExp(keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
            contentEl.innerHTML = originalHTML.replace(regex, `<mark class="flash-highlight">$&</mark>`);

            const mark = contentEl.querySelector('mark');
            if (mark) {
                mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => { contentEl.innerHTML = originalHTML; }, 2000);
            } else {
                contentEl.innerHTML = originalHTML;
            }
        }

        function generateBlueprint() {
            if (!currentAnalysisResult) return;
            const { analysis } = currentAnalysisResult;
            const opportunities = analysis.opportunities || [];
            const gaps = analysis.gaps || [];
            const exploits = analysis.exploits || [];

            // Extract content from new object format or fallback to string format
            const getContent = (item) => {
                if (typeof item === 'string') return item;
                return item.finding || item.content || '';
            };

            const primaryGap = gaps.length > 0 ? getContent(gaps[0]) : 'Lack of verifiable data';
            const primaryOpportunity = opportunities.length > 0 ? getContent(opportunities[0]) : 'The underlying scientific principle';

            // Get top 3 highest priority issues from exploits for MVP focus
            const sortedExploits = exploits.filter(item => typeof item === 'object' && item.rank)
                .sort((a, b) => a.rank - b.rank)
                .slice(0, 3);

            let blueprintText = `
Project Blueprint: A Legitimate MVP Approach
============================================

Based on the analysis, here is a potential roadmap to build a Minimum Viable Product (MVP) that addresses the identified gaps and leverages the core opportunities while avoiding the exploits found.

1. Core Problem to Solve:
-------------------------
Address the primary knowledge gap: "${primaryGap.substring(0, 200)}...".

2. Key Technology/Principle to Use:
-----------------------------------
Focus on the core legitimate opportunity: "${primaryOpportunity.substring(0, 200)}...".

3. Critical Issues to Avoid:
----------------------------`;

            if (sortedExploits.length > 0) {
                sortedExploits.forEach((exploit, index) => {
                    blueprintText += `\n* Issue #${exploit.rank}: ${getContent(exploit).substring(0, 150)}...`;
                });
            } else {
                blueprintText += `\n* Ensure all claims are backed by verifiable data\n* Implement proper peer review processes\n* Avoid overstated conclusions`;
            }

            blueprintText += `

4. Proposed MVP Features:
-------------------------
* A public data dashboard to transparently display experimental results.
* An open-source simulation model of the core scientific mechanism.
* A peer-review submission portal to gather external validation.
* Clear, documented methodology for replication.
* Bias detection and mitigation tools based on ethical concerns identified.

5. Key Metrics for Success:
---------------------------
* Number of successful, independent replications of the core result.
* Correlation factor between simulation and real-world experimental data.
* Number of positive peer reviews received through the portal.
* Ethical compliance score based on identified concerns.
            `;
            blueprintContent.textContent = blueprintText.trim();
            blueprintSection.style.display = 'block';
            blueprintSection.scrollIntoView({ behavior: 'smooth' });
        }

        function downloadBlueprint() {
            if (!blueprintContent.textContent) {
                showToast('No blueprint to download.', true);
                return;
            }
            const blob = new Blob([blueprintContent.textContent], { type: 'text/plain' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'mvp-blueprint.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }

        // Form submission handler
        analyzeForm.addEventListener('submit', (e) => {
            e.preventDefault();
            analyzeCase();
        });

        // Authentication state management
        let currentUser = null;
        let authModal = null;
        let userMenu = null;

        // Initialize authentication on page load
        // Progress tracking variables
        let progressInterval = null;
        let progressStartTime = null;
        let currentProgress = 0;

        function startProgressTracking() {
            progressStartTime = Date.now();
            currentProgress = 0;

            const progressFill = document.getElementById('progressFill');
            const progressPercentage = document.getElementById('progressPercentage');
            const timeRemaining = document.getElementById('timeRemaining');

            // Reset progress
            progressFill.style.width = '0%';
            progressPercentage.textContent = '0%';
            timeRemaining.textContent = 'Estimating time...';

            // Start progress simulation
            progressInterval = setInterval(() => {
                const elapsed = (Date.now() - progressStartTime) / 1000; // seconds

                // Simulate realistic progress curve (starts fast, slows down)
                if (currentProgress < 20) {
                    currentProgress += Math.random() * 4 + 2; // 2-6% per second initially
                } else if (currentProgress < 60) {
                    currentProgress += Math.random() * 2 + 1; // 1-3% per second
                } else if (currentProgress < 90) {
                    currentProgress += Math.random() * 1 + 0.5; // 0.5-1.5% per second
                } else {
                    currentProgress += Math.random() * 0.3; // Very slow near end
                }

                currentProgress = Math.min(currentProgress, 95); // Never reach 100% until completion

                // Update UI
                progressFill.style.width = currentProgress + '%';
                progressPercentage.textContent = Math.floor(currentProgress) + '%';

                // Estimate time remaining (rough approximation)
                if (elapsed > 3 && currentProgress > 10) {
                    const estimatedTotal = (elapsed / currentProgress) * 100;
                    const remaining = Math.max(0, estimatedTotal - elapsed);

                    if (remaining > 60) {
                        timeRemaining.textContent = `~${Math.ceil(remaining / 60)}m remaining`;
                    } else if (remaining > 0) {
                        timeRemaining.textContent = `~${Math.ceil(remaining)}s remaining`;
                    } else {
                        timeRemaining.textContent = 'Almost done...';
                    }
                } else {
                    timeRemaining.textContent = 'Estimating time...';
                }

                // Update loading text based on progress
                if (currentProgress < 30) {
                    updateLoadingText('🔍 Fetching research paper content...');
                } else if (currentProgress < 70) {
                    updateLoadingText('🧠 Analyzing with AI models...');
                } else if (currentProgress < 90) {
                    updateLoadingText('⚡ Generating insights and rankings...');
                } else {
                    updateLoadingText('✨ Finalizing analysis results...');
                }

            }, 500); // Update every 500ms
        }

        function completeProgress() {
            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }

            // Instantly complete progress
            currentProgress = 100;
            const progressFill = document.getElementById('progressFill');
            const progressPercentage = document.getElementById('progressPercentage');
            const timeRemaining = document.getElementById('timeRemaining');

            progressFill.style.width = '100%';
            progressPercentage.textContent = '100%';
            timeRemaining.textContent = 'Complete!';
            updateLoadingText('🎉 Analysis complete!');
        }

        function stopProgressTracking() {
            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }

            // Reset progress
            currentProgress = 0;
            const progressFill = document.getElementById('progressFill');
            const progressPercentage = document.getElementById('progressPercentage');
            const timeRemaining = document.getElementById('timeRemaining');

            progressFill.style.width = '0%';
            progressPercentage.textContent = '0%';
            timeRemaining.textContent = 'Ready';
        }

        // Test function for debugging navigation
        window.testNavigation = function(pageName) {
            console.log('Testing navigation to:', pageName);
            navigateToPage(pageName);
        };

        // Add temporary debug buttons for testing navigation
        function addDebugNavigationButtons() {
            const debugContainer = document.createElement('div');
            debugContainer.id = 'debug-nav-container';
            debugContainer.style.cssText = `
                position: fixed;
                top: 10px;
                left: 10px;
                z-index: 99999;
                background: rgba(0,0,0,0.8);
                color: white;
                padding: 10px;
                border-radius: 5px;
                font-family: monospace;
                font-size: 12px;
            `;
            debugContainer.innerHTML = `
                <div style="margin-bottom: 5px;">Debug Navigation:</div>
                <button onclick="navigateToPage('main')" style="margin: 2px; padding: 5px;">Main</button>
                <button onclick="navigateToPage('dashboard')" style="margin: 2px; padding: 5px;">Dashboard</button>
                <button onclick="navigateToPage('bookmarks')" style="margin: 2px; padding: 5px;">Bookmarks</button>
                <button onclick="navigateToPage('settings')" style="margin: 2px; padding: 5px;">Settings</button>
                <button onclick="document.getElementById('debug-nav-container').remove()" style="margin: 2px; padding: 5px; background: red;">Remove</button>
            `;
            document.body.appendChild(debugContainer);
        }

        // Remove debug buttons - navigation is working
        // window.addEventListener('load', () => {
        //     setTimeout(addDebugNavigationButtons, 1000);
        // });

        document.addEventListener('DOMContentLoaded', async () => {
            setupCarousel();
            await initializeAuth();
        });

        async function initializeAuth() {
            try {
                // Import Supabase modules
                const { supabase, auth, db, migration } = await import('./lib/supabase.js');

                // Check for existing session
                const { user } = await auth.getCurrentUser();
                if (user) {
                    currentUser = user;
                    renderUserMenu();

                    // Try to migrate localStorage data on first login
                    const hasExistingData = localStorage.getItem('bookmarkedPapers') || localStorage.getItem('analysisHistory');
                    if (hasExistingData) {
                        const { migratedCount } = await migration.migrateLocalStorageData(user.id);
                        if (migratedCount > 0) {
                            showToast(`Successfully migrated ${migratedCount} analyses from local storage!`);
                        }
                    }
                } else {
                    renderSignInButton();
                }

                // Listen for auth state changes
                auth.onAuthStateChange((event, session) => {
                    if (event === 'SIGNED_IN' && session?.user) {
                        currentUser = session.user;
                        renderUserMenu();
                        if (authModal) {
                            authModal.style.display = 'none';
                        }
                    } else if (event === 'SIGNED_OUT') {
                        currentUser = null;
                        renderSignInButton();
                    }
                });

            } catch (error) {
                console.error('Failed to initialize authentication:', error);
                // Fallback to localStorage mode
                renderSignInButton();
            }
        }

        function renderSignInButton() {
            const signInHTML = `
                <button onclick="showAuthModal()" class="auth-signin-btn">
                    🔐 Sign In
                </button>
            `;

            // Update all auth containers
            const containers = ['authContainer', 'authContainerDashboard', 'authContainerBookmarks', 'authContainerSettings'];
            containers.forEach(containerId => {
                const container = document.getElementById(containerId);
                if (container) {
                    container.innerHTML = signInHTML;
                }
            });
        }

        function renderUserMenu() {
            if (!currentUser) return;

            const userMenuHTML = `
                <div class="user-menu">
                    <button onclick="toggleUserMenu()" class="user-menu-button" id="userMenuButton">
                        <div class="user-avatar">
                            ${(currentUser.user_metadata?.name?.charAt(0) || currentUser.email.charAt(0)).toUpperCase()}
                        </div>
                        <span class="user-name">
                            ${currentUser.user_metadata?.name || 'User'}
                        </span>
                        <span class="dropdown-arrow">▼</span>
                    </button>
                </div>
            `;

            // Update all auth containers
            const containers = ['authContainer', 'authContainerDashboard', 'authContainerBookmarks', 'authContainerSettings'];
            containers.forEach(containerId => {
                const container = document.getElementById(containerId);
                if (container) {
                    container.innerHTML = userMenuHTML;
                }
            });
        }

        function showAuthModal() {
            if (authModal) {
                authModal.style.display = 'block';
                // Reset to sign-in mode when reopening
                resetToSignInMode();
                return;
            }

            // Create auth modal
            const modalHtml = `
                <div class="auth-modal-overlay" id="authModal">
                    <div class="auth-modal">
                        <div class="auth-header">
                            <h2 id="authTitle">Sign In</h2>
                            <button onclick="hideAuthModal()" class="close-btn">×</button>
                        </div>

                        <div class="auth-benefits">
                            <h3>🔄 Sync Your Research Across Devices</h3>
                            <ul>
                                <li>✅ Access bookmarks on any device</li>
                                <li>✅ Never lose your analysis history</li>
                                <li>✅ Personal research dashboard</li>
                                <li>✅ Advanced analytics & insights</li>
                            </ul>
                        </div>

                        <form onsubmit="handleAuthSubmit(event)" class="auth-form" id="authForm">
                            <input type="text" id="authName" placeholder="Your name" class="auth-input" style="display: none;">
                            <input type="email" id="authEmail" placeholder="Email address" required class="auth-input">
                            <input type="password" id="authPassword" placeholder="Password" required minlength="6" class="auth-input">

                            <div class="auth-error" id="authError" style="display: none;"></div>

                            <button type="submit" class="auth-submit" id="authSubmit">
                                Sign In
                            </button>
                        </form>

                        <div class="auth-switch">
                            <p id="authSwitch">
                                Don't have an account?
                                <button onclick="toggleAuthMode()" class="auth-link" id="authSwitchBtn">
                                    Sign up
                                </button>
                            </p>
                        </div>

                        <div class="auth-footer">
                            <p class="privacy-note">
                                🔒 Your data is encrypted and secure. We never share your research data.
                            </p>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
            authModal = document.getElementById('authModal');
        }

        function hideAuthModal() {
            if (authModal) {
                authModal.style.display = 'none';
            }
        }

        let authMode = 'signin';

        function resetToSignInMode() {
            authMode = 'signin';
            const title = document.getElementById('authTitle');
            const nameInput = document.getElementById('authName');
            const submitBtn = document.getElementById('authSubmit');
            const switchText = document.getElementById('authSwitch');
            const switchBtn = document.getElementById('authSwitchBtn');

            if (title) title.textContent = 'Sign In';
            if (nameInput) {
                nameInput.style.display = 'none';
                nameInput.required = false;
            }
            if (submitBtn) submitBtn.textContent = 'Sign In';
            if (switchText) switchText.innerHTML = "Don't have an account? ";
            if (switchBtn) switchBtn.textContent = 'Sign up';

            // Clear form
            const emailInput = document.getElementById('authEmail');
            const passwordInput = document.getElementById('authPassword');
            const errorDiv = document.getElementById('authError');

            if (emailInput) emailInput.value = '';
            if (passwordInput) passwordInput.value = '';
            if (nameInput) nameInput.value = '';
            if (errorDiv) errorDiv.style.display = 'none';
        }

        function toggleAuthMode() {
            authMode = authMode === 'signin' ? 'signup' : 'signin';

            const title = document.getElementById('authTitle');
            const nameInput = document.getElementById('authName');
            const submitBtn = document.getElementById('authSubmit');
            const switchText = document.getElementById('authSwitch');
            const switchBtn = document.getElementById('authSwitchBtn');

            if (authMode === 'signup') {
                title.textContent = 'Create Account';
                nameInput.style.display = 'block';
                nameInput.required = true;
                submitBtn.textContent = 'Create Account';
                switchText.innerHTML = 'Already have an account? ';
                switchBtn.textContent = 'Sign in';
            } else {
                title.textContent = 'Sign In';
                nameInput.style.display = 'none';
                nameInput.required = false;
                submitBtn.textContent = 'Sign In';
                switchText.innerHTML = "Don't have an account? ";
                switchBtn.textContent = 'Sign up';
            }
        }

        async function handleAuthSubmit(event) {
            event.preventDefault();

            const submitBtn = document.getElementById('authSubmit');
            const errorDiv = document.getElementById('authError');
            const email = document.getElementById('authEmail').value;
            const password = document.getElementById('authPassword').value;
            const name = document.getElementById('authName').value;

            submitBtn.textContent = 'Loading...';
            submitBtn.disabled = true;
            errorDiv.style.display = 'none';

            try {
                const { auth } = await import('./lib/supabase.js');

                let result;
                if (authMode === 'signup') {
                    result = await auth.signUp(email, password, { name });
                    if (result.data.user && !result.error) {
                        showToast('Check your email for the confirmation link!');
                        hideAuthModal();
                        return;
                    }
                } else {
                    result = await auth.signIn(email, password);
                    if (result.data.user && !result.error) {
                        hideAuthModal();
                        return;
                    }
                }

                if (result.error) {
                    errorDiv.textContent = result.error.message;
                    errorDiv.style.display = 'block';
                }
            } catch (error) {
                errorDiv.textContent = 'An unexpected error occurred';
                errorDiv.style.display = 'block';
            } finally {
                submitBtn.textContent = authMode === 'signin' ? 'Sign In' : 'Create Account';
                submitBtn.disabled = false;
            }
        }

        let userDropdown = null;

        function toggleUserMenu() {
            console.log('toggleUserMenu called');

            // If dropdown exists, remove it
            if (userDropdown) {
                console.log('Removing existing dropdown');
                document.body.removeChild(userDropdown);
                userDropdown = null;
                return;
            }

            // Create dropdown and append to body to avoid clipping
            userDropdown = document.createElement('div');
            userDropdown.id = 'userMenuDropdown';
            userDropdown.className = 'user-menu-dropdown-portal';
            userDropdown.innerHTML = `
                <div class="user-info">
                    <strong>${currentUser.user_metadata?.name || 'User'}</strong>
                    <small>${currentUser.email}</small>
                </div>
                <hr />
                <button class="menu-item" data-action="dashboard">
                    📊 Dashboard
                </button>
                <button class="menu-item" data-action="bookmarks">
                    ⭐ Bookmarks
                </button>
                <button class="menu-item" data-action="settings">
                    ⚙️ Settings
                </button>
                <hr />
                <button class="menu-item sign-out" data-action="signout">
                    🚪 Sign Out
                </button>
            `;

            // Position dropdown relative to user menu button
            const userMenuButton = document.getElementById('userMenuButton');
            if (userMenuButton) {
                const rect = userMenuButton.getBoundingClientRect();
                userDropdown.style.position = 'fixed';
                userDropdown.style.top = (rect.bottom + 10) + 'px';
                userDropdown.style.right = (window.innerWidth - rect.right) + 'px';
                userDropdown.style.zIndex = '10000';
            }

            // SIMPLE DIRECT ONCLICK HANDLERS - NO BULLSHIT
            console.log('Setting up DIRECT onclick handlers...');
            const menuItems = userDropdown.querySelectorAll('.menu-item');
            console.log('Found menu items:', menuItems.length);

            // Add direct onclick to each button
            menuItems.forEach((item, index) => {
                const action = item.getAttribute('data-action');
                console.log(`Setting up item ${index}: ${action}`);

                item.onclick = function(e) {
                    console.log('DIRECT ONCLICK FIRED FOR:', action);
                    e.preventDefault();
                    e.stopPropagation();

                    // Close dropdown
                    if (userDropdown && document.body.contains(userDropdown)) {
                        document.body.removeChild(userDropdown);
                        userDropdown = null;
                    }

                    // Navigate directly
                    if (action === 'dashboard' || action === 'bookmarks' || action === 'settings') {
                        console.log('CALLING navigateToPage with:', action);
                        navigateToPage(action);
                    } else if (action === 'signout') {
                        handleSignOut();
                    }
                };

                console.log(`Item ${index} onclick set:`, item.onclick);
            });

            document.body.appendChild(userDropdown);
        }

        // Close user menu when clicking outside
        document.addEventListener('click', (event) => {
            const userMenu = document.querySelector('.user-menu');

            // Check if clicking outside the dropdown and user menu
            if (userDropdown &&
                !userDropdown.contains(event.target) &&
                (!userMenu || !userMenu.contains(event.target))) {
                document.body.removeChild(userDropdown);
                userDropdown = null;
            }
        });

        async function handleSignOut() {
            try {
                const { auth } = await import('./lib/supabase.js');
                await auth.signOut();
                showToast('Signed out successfully');
            } catch (error) {
                console.error('Sign out error:', error);
                showToast('Error signing out', true);
            }
        }

        function navigateTo(page) {
            // Navigate to the specified page
            navigateToPage(page);
        }

        function navigateToPage(pageName) {
            console.log('navigateToPage called with:', pageName);

            // Get the main container that holds everything
            const mainContainer = document.querySelector('.container') || document.body;

            if (pageName === 'main') {
                // Show main app with proper styling
                const mainApp = document.getElementById('mainApp');
                if (mainApp) {
                    mainApp.style.display = 'block';
                    mainApp.style.position = 'static';
                    mainApp.style.zIndex = 'auto';
                }

                // Hide other pages completely
                ['dashboardPage', 'bookmarksPage', 'settingsPage'].forEach(pageId => {
                    const page = document.getElementById(pageId);
                    if (page) {
                        page.style.display = 'none';
                        page.style.position = 'static';
                        page.style.zIndex = 'auto';
                    }
                });

                // Scroll to top
                window.scrollTo(0, 0);
            } else {
                // Hide main app completely
                const mainApp = document.getElementById('mainApp');
                if (mainApp) {
                    mainApp.style.display = 'none';
                    console.log('Hiding main app');
                }

                // Hide all other pages first
                ['dashboardPage', 'bookmarksPage', 'settingsPage'].forEach(pageId => {
                    const page = document.getElementById(pageId);
                    if (page) page.style.display = 'none';
                });

                // Show target page
                const targetPage = pageName + 'Page';
                const pageElement = document.getElementById(targetPage);

                if (pageElement) {
                    // Full-screen overlay with solid background
                    pageElement.style.display = 'block';
                    pageElement.style.position = 'fixed';
                    pageElement.style.top = '0';
                    pageElement.style.left = '0';
                    pageElement.style.width = '100vw';
                    pageElement.style.height = '100vh';
                    pageElement.style.zIndex = '1000';
                    pageElement.style.visibility = 'visible';
                    pageElement.style.opacity = '1';
                    pageElement.style.backgroundColor = '#0a0a0f'; // Solid dark background
                    pageElement.style.color = 'var(--primary-text)';
                    pageElement.style.overflow = 'auto';
                    pageElement.style.padding = '20px';
                    pageElement.style.margin = '0';

                    console.log('Full-screen overlay applied to:', targetPage);

                    // Load page-specific data
                    if (pageName === 'dashboard') {
                        loadDashboardData();
                    } else if (pageName === 'bookmarks') {
                        loadBookmarksData();
                    } else if (pageName === 'settings') {
                        loadSettingsData();
                    }

                    // Force scroll to top
                    window.scrollTo(0, 0);

                    console.log('Navigation completed for:', pageName);
                } else {
                    console.error('Page element not found:', targetPage);
                }
            }
        }

        // Dashboard functions
        async function loadDashboardData() {
            try {
                // Load user analytics
                if (currentUser) {
                    const { db } = await import('./lib/supabase.js');

                    // Get user analyses
                    const { data: analyses, error: analysesError } = await db.getUserAnalyses(currentUser.id, 100);
                    if (!analysesError && analyses) {
                        // Update KPIs
                        document.getElementById('totalAnalyses').textContent = analyses.length;

                        const avgScore = analyses.length > 0
                            ? Math.round(analyses.reduce((sum, a) => sum + (a.overall_score || 0), 0) / analyses.length)
                            : '--';
                        document.getElementById('avgQualityScore').textContent = avgScore;

                        const lastAnalysis = analyses[0];
                        if (lastAnalysis) {
                            const daysSince = Math.floor((Date.now() - new Date(lastAnalysis.created_at).getTime()) / (1000 * 60 * 60 * 24));
                            document.getElementById('daysSinceLastAnalysis').textContent = daysSince;
                        }

                        // Load activity feed
                        loadActivityFeed(analyses.slice(0, 10));
                    }

                    // Get bookmarks count
                    const { data: bookmarks, error: bookmarksError } = await db.getUserBookmarks(currentUser.id);
                    if (!bookmarksError && bookmarks) {
                        document.getElementById('totalBookmarks').textContent = bookmarks.length;
                    }
                } else {
                    // Use localStorage data for non-authenticated users
                    const localHistory = JSON.parse(localStorage.getItem('analysisHistory') || '[]');
                    const localBookmarks = JSON.parse(localStorage.getItem('bookmarkedPapers') || '[]');

                    document.getElementById('totalAnalyses').textContent = localHistory.length;
                    document.getElementById('totalBookmarks').textContent = localBookmarks.length;

                    if (localHistory.length > 0) {
                        const avgScore = Math.round(localHistory.reduce((sum, a) => sum + (a.overallScore || 0), 0) / localHistory.length);
                        document.getElementById('avgQualityScore').textContent = avgScore;

                        const lastAnalysis = localHistory[0];
                        if (lastAnalysis?.timestamp) {
                            const daysSince = Math.floor((Date.now() - new Date(lastAnalysis.timestamp).getTime()) / (1000 * 60 * 60 * 24));
                            document.getElementById('daysSinceLastAnalysis').textContent = daysSince;
                        }
                    }
                }

                // Load recommendations
                loadRecommendations();

                // Load topic analysis chart - use appropriate data source
                if (currentUser) {
                    // For authenticated users, we need to get analyses again or pass it properly
                    const analysisData = JSON.parse(localStorage.getItem('analysisHistory') || '[]'); // Fallback
                    loadTopicsChart(analysisData);
                } else {
                    loadTopicsChart(localHistory);
                }

            } catch (error) {
                console.error('Error loading dashboard data:', error);
                showToast('Error loading dashboard data', true);
            }
        }

        function loadActivityFeed(analyses) {
            const activityFeed = document.getElementById('activityFeed');

            if (!analyses || analyses.length === 0) {
                activityFeed.innerHTML = '<div class="loading-placeholder">No recent activity</div>';
                return;
            }

            const activityHtml = analyses.map(analysis => {
                const date = new Date(analysis.created_at || analysis.timestamp).toLocaleDateString();
                const score = analysis.overall_score || analysis.overallScore || 0;
                const title = analysis.title || 'Research Paper';

                return `
                    <div class="activity-item">
                        <div class="activity-icon">📊</div>
                        <div class="activity-content">
                            <div class="activity-title">${title}</div>
                            <div class="activity-meta">Score: ${score}/100 • ${date}</div>
                        </div>
                    </div>
                `;
            }).join('');

            activityFeed.innerHTML = activityHtml;
        }

        function loadRecommendations() {
            // This could be enhanced with AI-generated recommendations based on user's analysis history
            const recommendations = [
                {
                    icon: '📚',
                    title: 'Explore New Domains',
                    description: 'Try analyzing papers from different research domains to broaden your perspective.'
                },
                {
                    icon: '🔖',
                    title: 'Review Your Bookmarks',
                    description: 'Revisit your bookmarked papers and see if there are new connections to discover.'
                },
                {
                    icon: '📈',
                    title: 'Track Quality Trends',
                    description: 'Monitor how the quality scores of papers in your field are changing over time.'
                }
            ];

            const recommendationsHtml = recommendations.map(rec => `
                <div class="recommendation-card">
                    <div class="rec-icon">${rec.icon}</div>
                    <div class="rec-content">
                        <h4>${rec.title}</h4>
                        <p>${rec.description}</p>
                    </div>
                </div>
            `).join('');

            document.getElementById('recommendationsList').innerHTML = recommendationsHtml;
        }

        function loadTopicsChart(analyses) {
            const chartElement = document.getElementById('topicsChart');
            const legendElement = document.getElementById('chartLegend');

            if (!analyses || analyses.length === 0) {
                chartElement.innerHTML = '<div class="loading-placeholder">No analysis data available</div>';
                chartElement.classList.add('empty');
                chartElement.style.background = '#333';
                legendElement.innerHTML = '<div class="loading-placeholder">Analyze some papers to see topic breakdown</div>';
                return;
            }

            // Extract topics from analysis titles and structured data
            const topicCounts = {};

            analyses.forEach(analysis => {
                const title = (analysis.title || '').toLowerCase();
                const content = JSON.stringify(analysis.structured_data || analysis.structuredData || {}).toLowerCase();

                // Define topic keywords
                const topicKeywords = {
                    'Machine Learning': ['machine learning', 'ml', 'neural', 'deep learning', 'ai', 'artificial intelligence', 'algorithm', 'model', 'training'],
                    'Education': ['education', 'teaching', 'learning', 'student', 'curriculum', 'pedagogy', 'academic', 'school', 'university'],
                    'Cryptography': ['cryptography', 'encryption', 'crypto', 'security', 'hash', 'blockchain', 'cipher', 'key', 'protocol'],
                    'Medicine': ['medical', 'medicine', 'health', 'clinical', 'patient', 'treatment', 'disease', 'therapy', 'drug'],
                    'Computer Science': ['computer', 'software', 'programming', 'system', 'network', 'database', 'algorithm', 'computing'],
                    'Physics': ['physics', 'quantum', 'particle', 'energy', 'matter', 'theory', 'experiment', 'relativity'],
                    'Biology': ['biology', 'biological', 'cell', 'gene', 'protein', 'organism', 'evolution', 'dna', 'molecular'],
                    'Other': []
                };

                let matched = false;
                for (const [topic, keywords] of Object.entries(topicKeywords)) {
                    if (topic === 'Other') continue;

                    const hasKeyword = keywords.some(keyword =>
                        title.includes(keyword) || content.includes(keyword)
                    );

                    if (hasKeyword) {
                        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
                        matched = true;
                        break;
                    }
                }

                if (!matched) {
                    topicCounts['Other'] = (topicCounts['Other'] || 0) + 1;
                }
            });

            // Calculate percentages and create chart data
            const total = analyses.length;
            const topics = Object.entries(topicCounts)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 4); // Top 4 categories

            if (topics.length === 0) {
                chartElement.innerHTML = '<div class="loading-placeholder">No topic data available</div>';
                return;
            }

            const colors = ['#00ff88', '#ff6b6b', '#4ecdc4', '#45b7d1'];

            // Create dynamic conic-gradient based on data
            let gradientParts = [];
            let currentDegree = 0;

            topics.forEach(([topic, count], index) => {
                const degrees = (count / total) * 360;
                const color = colors[index] || colors[colors.length - 1];

                gradientParts.push(`${color} ${currentDegree}deg ${currentDegree + degrees}deg`);
                currentDegree += degrees;
            });

            // Apply the gradient to the chart
            const gradient = `conic-gradient(from 0deg, ${gradientParts.join(', ')})`;
            chartElement.style.background = gradient;
            chartElement.classList.remove('empty');

            // Create legend
            const legendHtml = topics.map(([topic, count], index) => {
                const percentage = Math.round((count / total) * 100);
                return `
                    <div class="legend-item">
                        <div class="legend-color" style="background: ${colors[index]}"></div>
                        <div class="legend-text">
                            <span class="legend-label">${topic}</span>
                            <span class="legend-percentage">${percentage}%</span>
                        </div>
                    </div>
                `;
            }).join('');

            legendElement.innerHTML = legendHtml;
            chartElement.innerHTML = ''; // Clear loading message
        }

        // Bookmarks functions
        async function loadBookmarksData() {
            const bookmarksGrid = document.getElementById('bookmarksGrid');
            bookmarksGrid.innerHTML = '<div class="loading-placeholder">Loading bookmarks...</div>';

            try {
                let bookmarks = [];

                if (currentUser) {
                    // Load from Supabase
                    const { db } = await import('./lib/supabase.js');
                    const { data, error } = await db.getUserBookmarks(currentUser.id);
                    if (!error && data) {
                        bookmarks = data.map(bookmark => ({
                            id: bookmark.id,
                            title: bookmark.title,
                            url: bookmark.url,
                            score: bookmark.overall_score,
                            date: new Date(bookmark.created_at).toLocaleDateString()
                        }));
                    }
                } else {
                    // Load from localStorage
                    const localBookmarks = JSON.parse(localStorage.getItem('bookmarkedPapers') || '[]');
                    bookmarks = localBookmarks.map(bookmark => ({
                        id: bookmark.id,
                        title: bookmark.title,
                        url: bookmark.url,
                        score: bookmark.overallScore,
                        date: new Date(bookmark.timestamp).toLocaleDateString(),
                        categories: bookmark.categories || ['Other'], // Backward compatibility
                        tags: bookmark.tags || []
                    }));
                }

                if (bookmarks.length === 0) {
                    bookmarksGrid.innerHTML = '<div class="loading-placeholder">No bookmarks yet. Start by bookmarking some papers!</div>';
                    return;
                }

                displayBookmarks(bookmarks);

            } catch (error) {
                console.error('Error loading bookmarks:', error);
                bookmarksGrid.innerHTML = '<div class="loading-placeholder">Error loading bookmarks</div>';
            }
        }

        function displayBookmarks(bookmarks) {
            const bookmarksGrid = document.getElementById('bookmarksGrid');

            const bookmarksHtml = bookmarks.map(bookmark => `
                <div class="bookmark-card" data-bookmark-id="${bookmark.id}">
                    <input type="checkbox" class="bookmark-checkbox" value="${bookmark.id}">
                    <div class="bookmark-score">${bookmark.score || 0}</div>
                    <div class="bookmark-title">${bookmark.title}</div>
                    <div class="bookmark-url">${bookmark.url}</div>
                    <div class="bookmark-date">${bookmark.date}</div>
                    ${bookmark.categories ? `
                        <div class="bookmark-categories">
                            ${bookmark.categories.map(cat => `<span class="category-tag">${cat}</span>`).join('')}
                        </div>
                    ` : ''}
                    ${bookmark.tags && bookmark.tags.length > 0 ? `
                        <div class="bookmark-tags">
                            ${bookmark.tags.map(tag => `<span class="bookmark-tag">${tag}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `).join('');

            bookmarksGrid.innerHTML = bookmarksHtml;

            // Add click handlers
            bookmarksGrid.querySelectorAll('.bookmark-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    if (e.target.type !== 'checkbox') {
                        const url = card.querySelector('.bookmark-url').textContent;
                        // Navigate back to main page and load the analysis
                        navigateToPage('main');
                        document.getElementById('urlInput').value = url;
                        analyzeCase();
                    }
                });

                const checkbox = card.querySelector('.bookmark-checkbox');
                checkbox.addEventListener('change', () => {
                    card.classList.toggle('selected', checkbox.checked);
                });
            });
        }

        // Settings functions
        function loadSettingsData() {
            if (currentUser) {
                // Load user profile data
                document.getElementById('profileEmail').value = currentUser.email || '';
                document.getElementById('profileName').value = currentUser.user_metadata?.name || '';
            }

            // Load saved preferences from localStorage
            const preferences = JSON.parse(localStorage.getItem('userPreferences') || '{}');

            const analysisDepthEl = document.getElementById('analysisDepth');
            const autoSaveEl = document.getElementById('autoSaveAnalyses');
            const showProgressEl = document.getElementById('showProgressDetails');
            const notificationsEl = document.getElementById('analysisNotifications');
            const weeklySummaryEl = document.getElementById('weeklySummary');
            const dataRetentionEl = document.getElementById('dataRetention');

            if (analysisDepthEl) analysisDepthEl.value = preferences.analysisDepth || 'standard';
            if (autoSaveEl) autoSaveEl.checked = preferences.autoSave !== false;
            if (showProgressEl) showProgressEl.checked = preferences.showProgress !== false;
            if (notificationsEl) notificationsEl.checked = preferences.notifications !== false;
            if (weeklySummaryEl) weeklySummaryEl.checked = preferences.weeklySummary === true;
            if (dataRetentionEl) dataRetentionEl.value = preferences.dataRetention || 'forever';

            // Update storage information
            updateStorageInfo();
        }

        function showSettingsSection(sectionName) {
            // Update nav
            document.querySelectorAll('.settings-nav-item').forEach(item => {
                item.classList.remove('active');
            });
            event.target.closest('.settings-nav-item').classList.add('active');

            // Update content
            document.querySelectorAll('.settings-section').forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(sectionName + 'Settings').classList.add('active');
        }

        function saveProfileSettings() {
            const name = document.getElementById('profileName').value;

            // Save to localStorage for now
            const preferences = JSON.parse(localStorage.getItem('userPreferences') || '{}');
            preferences.profileName = name;
            localStorage.setItem('userPreferences', JSON.stringify(preferences));

            showToast('Profile settings saved!');
        }

        function savePreferences() {
            const preferences = {
                analysisDepth: document.getElementById('analysisDepth').value,
                autoSave: document.getElementById('autoSaveAnalyses').checked,
                showProgress: document.getElementById('showProgressDetails').checked
            };

            localStorage.setItem('userPreferences', JSON.stringify(preferences));
            showToast('Preferences saved!');
        }

        function saveNotificationSettings() {
            const preferences = JSON.parse(localStorage.getItem('userPreferences') || '{}');
            preferences.notifications = document.getElementById('analysisNotifications').checked;
            preferences.weeklySummary = document.getElementById('weeklySummary').checked;

            localStorage.setItem('userPreferences', JSON.stringify(preferences));
            showToast('Notification settings saved!');
        }

        function confirmClearAllData() {
            if (confirm('Are you sure you want to clear all your data? This will remove all analyses, bookmarks, and preferences. This action cannot be undone.')) {
                clearAllData();
            }
        }

        function clearAllData() {
            try {
                localStorage.removeItem('analysisHistory');
                localStorage.removeItem('bookmarkedPapers');
                localStorage.removeItem('userPreferences');

                // Update storage display
                updateStorageInfo();

                showToast('All data cleared successfully');

                // Refresh current page if on dashboard or bookmarks
                const currentPage = document.querySelector('.app-page[style*="display: block"]');
                if (currentPage) {
                    const pageId = currentPage.id;
                    if (pageId === 'dashboardPage') {
                        loadDashboardData();
                    } else if (pageId === 'bookmarksPage') {
                        loadBookmarksData();
                    }
                }
            } catch (error) {
                console.error('Error clearing data:', error);
                showToast('Error clearing data', true);
            }
        }

        function confirmDeleteAccount() {
            if (confirm('Are you sure you want to delete your account? This will remove all your data and cannot be undone.')) {
                deleteAccount();
            }
        }

        function deleteAccount() {
            // For now, just clear local data and show message
            // In a real app, this would call the backend to delete the account
            clearAllData();

            if (currentUser) {
                showToast('Account deletion initiated. You will be signed out.');
                setTimeout(async () => {
                    try {
                        const { auth } = await import('./lib/supabase.js');
                        await auth.signOut();
                        navigateToPage('main');
                    } catch (error) {
                        console.error('Sign out error:', error);
                        navigateToPage('main');
                    }
                }, 2000);
            } else {
                showToast('All local data cleared');
                navigateToPage('main');
            }
        }

        function updateStorageInfo() {
            try {
                const analyses = localStorage.getItem('analysisHistory') || '[]';
                const bookmarks = localStorage.getItem('bookmarkedPapers') || '[]';
                const preferences = localStorage.getItem('userPreferences') || '{}';

                const totalBytes = new Blob([analyses, bookmarks, preferences]).size;
                const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);

                // Assume 10MB limit for display purposes
                const maxMB = 10;
                const percentage = Math.min((totalMB / maxMB) * 100, 100);

                const storageBar = document.getElementById('storageUsage');
                const storageText = document.getElementById('storageText');

                if (storageBar && storageText) {
                    storageBar.style.width = `${percentage}%`;
                    storageText.textContent = `Used ${totalMB} MB of ${maxMB} MB available`;

                    // Change color based on usage
                    if (percentage > 80) {
                        storageBar.style.backgroundColor = '#ff6b6b';
                    } else if (percentage > 60) {
                        storageBar.style.backgroundColor = '#ffa726';
                    } else {
                        storageBar.style.backgroundColor = '#00ff88';
                    }
                }
            } catch (error) {
                console.error('Error updating storage info:', error);
            }
        }

        // Utility functions for bookmarks and dashboard
        function filterBookmarks() {
            const searchTerm = document.getElementById('bookmarkSearch').value.toLowerCase();
            const cards = document.querySelectorAll('.bookmark-card');

            cards.forEach(card => {
                const title = card.querySelector('.bookmark-title').textContent.toLowerCase();
                const url = card.querySelector('.bookmark-url').textContent.toLowerCase();

                // Also search in categories and tags
                const categories = card.querySelector('.bookmark-categories');
                const tags = card.querySelector('.bookmark-tags');

                const categoryText = categories ? categories.textContent.toLowerCase() : '';
                const tagText = tags ? tags.textContent.toLowerCase() : '';

                const matches = title.includes(searchTerm) ||
                              url.includes(searchTerm) ||
                              categoryText.includes(searchTerm) ||
                              tagText.includes(searchTerm);

                card.style.display = matches ? 'block' : 'none';
            });
        }

        function sortBookmarks() {
            const sortBy = document.getElementById('bookmarkSort').value;
            const bookmarksGrid = document.getElementById('bookmarksGrid');
            const cards = Array.from(bookmarksGrid.querySelectorAll('.bookmark-card'));

            cards.sort((a, b) => {
                switch(sortBy) {
                    case 'date-newest':
                        return new Date(b.querySelector('.bookmark-date').textContent) -
                               new Date(a.querySelector('.bookmark-date').textContent);
                    case 'date-oldest':
                        return new Date(a.querySelector('.bookmark-date').textContent) -
                               new Date(b.querySelector('.bookmark-date').textContent);
                    case 'score-high':
                        return parseInt(b.querySelector('.bookmark-score').textContent) -
                               parseInt(a.querySelector('.bookmark-score').textContent);
                    case 'score-low':
                        return parseInt(a.querySelector('.bookmark-score').textContent) -
                               parseInt(b.querySelector('.bookmark-score').textContent);
                    case 'title-az':
                        return a.querySelector('.bookmark-title').textContent.localeCompare(
                               b.querySelector('.bookmark-title').textContent);
                    case 'title-za':
                        return b.querySelector('.bookmark-title').textContent.localeCompare(
                               a.querySelector('.bookmark-title').textContent);
                    default:
                        return 0;
                }
            });

            // Re-append cards in sorted order
            cards.forEach(card => bookmarksGrid.appendChild(card));

            showToast(`Bookmarks sorted by ${sortBy.replace('-', ' ')}`);
        }

        function clearBookmarkFilters() {
            // Clear search input
            const searchInput = document.getElementById('bookmarkSearch');
            if (searchInput) {
                searchInput.value = '';
            }

            // Reset sort to default
            const sortSelect = document.getElementById('bookmarkSort');
            if (sortSelect) {
                sortSelect.value = 'date-newest';
            }

            // Show all cards
            const cards = document.querySelectorAll('.bookmark-card');
            cards.forEach(card => {
                card.style.display = 'block';
            });

            // Re-sort to default
            sortBookmarks();

            showToast('Filters cleared');
        }

        function selectAllBookmarks() {
            const checkboxes = document.querySelectorAll('.bookmark-checkbox');
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);

            checkboxes.forEach(cb => {
                cb.checked = !allChecked;
                cb.closest('.bookmark-card').classList.toggle('selected', cb.checked);
            });
        }

        function exportSelectedBookmarks() {
            const selectedIds = Array.from(document.querySelectorAll('.bookmark-checkbox:checked')).map(cb => cb.value);
            if (selectedIds.length === 0) {
                showToast('Please select bookmarks to export', true);
                return;
            }

            // Get selected bookmark data
            const selectedBookmarks = [];
            selectedIds.forEach(id => {
                const card = document.querySelector(`[data-bookmark-id="${id}"]`);
                if (card) {
                    selectedBookmarks.push({
                        title: card.querySelector('.bookmark-title').textContent,
                        url: card.querySelector('.bookmark-url').textContent,
                        score: card.querySelector('.bookmark-score').textContent,
                        date: card.querySelector('.bookmark-date').textContent
                    });
                }
            });

            // Create and download CSV
            const csv = convertToCSV(selectedBookmarks, ['title', 'url', 'score', 'date']);
            downloadFile(csv, `bookmarks_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
            showToast(`Exported ${selectedIds.length} bookmarks successfully!`);
        }

        function exportAllUserData() {
            try {
                const userData = {
                    bookmarks: JSON.parse(localStorage.getItem('bookmarkedPapers') || '[]'),
                    analyses: JSON.parse(localStorage.getItem('analysisHistory') || '[]'),
                    preferences: JSON.parse(localStorage.getItem('userPreferences') || '{}'),
                    exportDate: new Date().toISOString()
                };

                const jsonStr = JSON.stringify(userData, null, 2);
                downloadFile(jsonStr, `user_data_backup_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
                showToast('User data exported successfully!');
            } catch (error) {
                console.error('Export error:', error);
                showToast('Error exporting user data', true);
            }
        }

        function exportAllAnalyses() {
            try {
                const analyses = JSON.parse(localStorage.getItem('analysisHistory') || '[]');
                if (analyses.length === 0) {
                    showToast('No analyses to export', true);
                    return;
                }

                const csv = convertToCSV(analyses, ['title', 'url', 'overallScore', 'timestamp']);
                downloadFile(csv, `analyses_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
                showToast(`Exported ${analyses.length} analyses successfully!`);
            } catch (error) {
                console.error('Export error:', error);
                showToast('Error exporting analyses', true);
            }
        }

        // Utility functions for export
        function convertToCSV(data, headers) {
            if (!data || data.length === 0) return '';

            const csvHeaders = headers.join(',');
            const csvRows = data.map(row =>
                headers.map(header => {
                    const value = row[header] || '';
                    return `"${String(value).replace(/"/g, '""')}"`;
                }).join(',')
            );

            return [csvHeaders, ...csvRows].join('\n');
        }

        function downloadFile(content, filename, mimeType) {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }

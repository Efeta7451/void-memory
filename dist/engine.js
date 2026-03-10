/**
 * Void Memory — Core Engine
 * Three-pass recall: keyword scoring → void marking → budget fit
 * Target: <200ms, no LLM dependency
 */
// ── Constants ──
const CHARS_PER_TOKEN = 4;
const DEFAULT_BUDGET = 4000; // tokens — 2% of 200K context
const MAX_BUDGET = 10000; // tokens — 5% cap
const VOID_TARGET = 0.30; // 30% void fraction target from PNN research
const MAX_CANDIDATES = 100; // score at most this many
// ── TF-IDF helpers ──
function tokenize(text) {
    return text.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);
}
function computeIDF(blocks) {
    const docFreq = new Map();
    const N = blocks.length || 1;
    for (const b of blocks) {
        const words = new Set(tokenize(b.content + ' ' + b.keywords));
        for (const w of words) {
            docFreq.set(w, (docFreq.get(w) || 0) + 1);
        }
    }
    const idf = new Map();
    for (const [word, df] of docFreq) {
        idf.set(word, Math.log(N / df));
    }
    return idf;
}
function scoreBlock(block, queryTokens, idf) {
    const blockTokens = new Set(tokenize(block.content + ' ' + block.keywords));
    let score = 0;
    for (const qt of queryTokens) {
        if (blockTokens.has(qt)) {
            score += idf.get(qt) || 1;
        }
        // Partial match bonus for keyword field (exact keyword match is stronger)
        const keywords = block.keywords.toLowerCase().split(',').map(k => k.trim());
        if (keywords.includes(qt)) {
            score += (idf.get(qt) || 1) * 1.5; // keyword exact match bonus
        }
    }
    // Confidence multiplier
    const confMultiplier = {
        confirmed: 1.3,
        accessed: 1.1,
        stored: 1.0,
        observed: 0.7,
    };
    score *= confMultiplier[block.confidence] || 1.0;
    // Recency boost (accessed in last 7 days)
    if (block.accessed_at) {
        const daysSince = (Date.now() - new Date(block.accessed_at).getTime()) / 86400000;
        if (daysSince < 1)
            score *= 1.3;
        else if (daysSince < 7)
            score *= 1.15;
    }
    return score;
}
// ── Topic clustering (multi-keyword Jaccard similarity) ──
function getKeywordSet(block) {
    return new Set(block.keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean));
}
function jaccardSimilarity(a, b) {
    if (a.size === 0 && b.size === 0)
        return 0;
    let intersection = 0;
    for (const k of a)
        if (b.has(k))
            intersection++;
    return intersection / (a.size + b.size - intersection);
}
/**
 * Cluster blocks by keyword similarity using single-linkage clustering.
 * Two blocks join the same cluster if they share >= CLUSTER_THRESHOLD keyword overlap.
 * Returns cluster label (representative keyword set) for each block.
 */
const CLUSTER_THRESHOLD = 0.25; // 25% Jaccard overlap = same topic
function clusterBlocks(blocks) {
    const labels = new Map();
    const clusters = [];
    for (const b of blocks) {
        const bKeys = getKeywordSet(b);
        let bestCluster = null;
        let bestSim = 0;
        for (const c of clusters) {
            const sim = jaccardSimilarity(bKeys, c.keywords);
            if (sim > bestSim && sim >= CLUSTER_THRESHOLD) {
                bestSim = sim;
                bestCluster = c;
            }
        }
        if (bestCluster) {
            bestCluster.members.push(b.id);
            // Merge keywords into cluster
            for (const k of bKeys)
                bestCluster.keywords.add(k);
        }
        else {
            // New cluster — label is the first keyword or category
            const kws = b.keywords.split(',').map(k => k.trim()).filter(Boolean);
            const label = kws[0] || b.category;
            clusters.push({ label, members: [b.id], keywords: bKeys });
        }
    }
    // Assign labels
    for (const c of clusters) {
        for (const id of c.members) {
            labels.set(id, c.label);
        }
    }
    return labels;
}
// ── Score gap detection ──
/**
 * Find the largest relative score drop in a sorted (descending) candidate list.
 * Returns the index AFTER which blocks should be considered for voiding.
 * Only triggers if gap is > 40% relative drop.
 */
function findScoreGap(scores) {
    if (scores.length < 4)
        return null; // too few to detect gaps
    let maxDrop = 0;
    let gapIdx = -1;
    for (let i = 1; i < scores.length; i++) {
        if (scores[i - 1] === 0)
            continue;
        const drop = (scores[i - 1] - scores[i]) / scores[i - 1];
        if (drop > maxDrop && drop > 0.4) { // 40% relative drop
            maxDrop = drop;
            gapIdx = i;
        }
    }
    return gapIdx > 0 ? gapIdx : null;
}
// ── Core engine ──
export function recall(db, query, budgetTokens) {
    const start = performance.now();
    const budget = Math.min(budgetTokens || DEFAULT_BUDGET, MAX_BUDGET);
    // Load eligible blocks (state >= 0, confidence not 'observed')
    const allBlocks = db.prepare(`
    SELECT * FROM blocks
    WHERE state >= 0 AND confidence != 'observed'
    ORDER BY access_count DESC
  `).all();
    // Load inhibitions
    const inhibitions = db.prepare(`
    SELECT blocker_id, blocked_id FROM inhibitions
    WHERE blocker_id IN (SELECT id FROM blocks WHERE state = -1)
  `).all();
    const inhibitedSet = new Map(); // blocked_id → blocker_id
    for (const inh of inhibitions) {
        inhibitedSet.set(inh.blocked_id, inh.blocker_id);
    }
    // ── Pass 1: Score all blocks ──
    const queryTokens = tokenize(query);
    const idf = computeIDF(allBlocks);
    let candidates = allBlocks.map(b => ({
        ...b,
        score: scoreBlock(b, queryTokens, idf),
        topic_cluster: b.keywords.split(',')[0]?.trim() || b.category,
        voided: false,
        inhibited_by: inhibitedSet.get(b.id) || null,
        tokens: Math.ceil(b.content.length / CHARS_PER_TOKEN),
    }));
    // Remove zero-score candidates and inhibited blocks
    candidates = candidates
        .filter(c => c.score > 0 && !c.inhibited_by)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_CANDIDATES);
    const totalScored = candidates.length;
    // ── Pass 2: Void marking (Phase 2 algorithm) ──
    // Minimum 6 candidates before void marking activates
    // Below that, every result is likely relevant — voiding would hurt more than help
    const MIN_VOID_CANDIDATES = 6;
    const voidedZones = [];
    const voidZoneCounts = new Map();
    let voidCount = 0;
    if (totalScored >= MIN_VOID_CANDIDATES) {
        // Step 1: Cluster blocks by multi-keyword Jaccard similarity
        const clusterLabels = clusterBlocks(candidates);
        for (const c of candidates) {
            c.topic_cluster = clusterLabels.get(c.id) || c.topic_cluster;
        }
        // Step 2: Score gap detection — find natural boundary between relevant and tangential
        const scores = candidates.map(c => c.score);
        const gapIdx = findScoreGap(scores);
        // Step 3: Identify primary cluster (highest total score)
        const clusterTotalScores = new Map();
        for (const c of candidates) {
            clusterTotalScores.set(c.topic_cluster, (clusterTotalScores.get(c.topic_cluster) || 0) + c.score);
        }
        const rankedClusters = [...clusterTotalScores.entries()].sort((a, b) => b[1] - a[1]);
        const primaryCluster = rankedClusters[0]?.[0] || '';
        // Protect top 2 clusters (or top 1 if only 2 clusters)
        const protectedCount = Math.min(2, Math.ceil(rankedClusters.length * 0.4));
        const protectedClusters = new Set(rankedClusters.slice(0, protectedCount).map(([c]) => c));
        const targetVoidCount = Math.floor(candidates.length * VOID_TARGET);
        // Strategy A: Void blocks below score gap (if detected)
        if (gapIdx !== null) {
            for (let i = gapIdx; i < candidates.length; i++) {
                const c = candidates[i];
                if (!c.voided && !protectedClusters.has(c.topic_cluster)) {
                    c.voided = true;
                    voidCount++;
                    voidZoneCounts.set(c.topic_cluster, (voidZoneCounts.get(c.topic_cluster) || 0) + 1);
                    if (!voidedZones.includes(c.topic_cluster))
                        voidedZones.push(c.topic_cluster);
                }
            }
        }
        // Strategy B: Void lowest-scoring off-topic clusters (fill toward 30% target)
        if (voidCount < targetVoidCount) {
            for (const [cluster] of [...rankedClusters].reverse()) {
                if (voidCount >= targetVoidCount)
                    break;
                if (protectedClusters.has(cluster))
                    continue;
                for (const c of candidates) {
                    if (c.topic_cluster === cluster && !c.voided) {
                        c.voided = true;
                        voidCount++;
                        voidZoneCounts.set(cluster, (voidZoneCounts.get(cluster) || 0) + 1);
                    }
                }
                if (!voidedZones.includes(cluster))
                    voidedZones.push(cluster);
            }
        }
        // Strategy C: Void lowest-scoring individuals from non-primary clusters
        if (voidCount < targetVoidCount) {
            const remaining = candidates
                .filter(c => !c.voided && c.topic_cluster !== primaryCluster)
                .sort((a, b) => a.score - b.score);
            for (const c of remaining) {
                if (voidCount >= targetVoidCount)
                    break;
                c.voided = true;
                voidCount++;
                voidZoneCounts.set(c.topic_cluster, (voidZoneCounts.get(c.topic_cluster) || 0) + 1);
                if (!voidedZones.includes(c.topic_cluster))
                    voidedZones.push(c.topic_cluster);
            }
        }
        // Hub dampening: relative threshold (top 5% by access count, min 50 accesses)
        const accessCounts = candidates.filter(c => !c.voided).map(c => c.access_count).sort((a, b) => b - a);
        const hubThreshold = Math.max(50, accessCounts[Math.floor(accessCounts.length * 0.05)] || 50);
        const topIds = new Set(candidates.filter(c => !c.voided).slice(0, 3).map(c => c.id));
        for (const c of candidates) {
            if (!c.voided && c.access_count > hubThreshold && !topIds.has(c.id)) {
                c.voided = true;
                voidCount++;
                voidZoneCounts.set(c.topic_cluster, (voidZoneCounts.get(c.topic_cluster) || 0) + 1);
            }
        }
    }
    // ── Pass 3: Budget fit ──
    const active = candidates
        .filter(c => !c.voided)
        .sort((a, b) => b.score - a.score);
    const result = [];
    let tokensUsed = 0;
    for (const c of active) {
        if (tokensUsed + c.tokens > budget)
            continue; // skip, don't truncate
        tokensUsed += c.tokens;
        result.push({
            id: c.id,
            content: c.content,
            category: c.category,
            keywords: c.keywords,
            confidence: c.confidence,
            score: Math.round(c.score * 100) / 100,
            state: c.state,
        });
    }
    // Update access counts and timestamps
    const updateAccess = db.prepare(`
    UPDATE blocks SET access_count = access_count + 1, accessed_at = datetime('now'),
    confidence = CASE
      WHEN confidence = 'stored' THEN 'accessed'
      WHEN confidence = 'accessed' AND access_count >= 2 THEN 'confirmed'
      ELSE confidence
    END
    WHERE id = ?
  `);
    const updateMany = db.transaction((ids) => {
        for (const id of ids)
            updateAccess.run(id);
    });
    updateMany(result.map(b => b.id));
    const voidFraction = totalScored > 0 ? voidCount / totalScored : 0;
    const duration = performance.now() - start;
    // Log recall
    db.prepare(`
    INSERT INTO recall_log (query, blocks_scored, blocks_returned, blocks_voided, void_fraction, budget_tokens, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(query, totalScored, result.length, voidCount, voidFraction, budget, duration);
    return {
        blocks: result,
        void_zones: voidedZones,
        void_zone_counts: voidZoneCounts,
        void_fraction: Math.round(voidFraction * 100) / 100,
        budget_used: tokensUsed,
        budget_max: budget,
        blocks_scored: totalScored,
        blocks_voided: voidCount,
        duration_ms: Math.round(duration * 10) / 10,
    };
}
export function store(db, opts) {
    const { content, category = 'fact', keywords = [], state = 1, confidence = 'stored', supersedes } = opts;
    const keywordStr = keywords.map(k => k.toLowerCase().trim()).join(', ');
    // Quality gate
    if (content.length < 20)
        throw new Error('Content too short (min 20 chars)');
    const alphaRatio = (content.match(/[a-zA-Z]/g) || []).length / content.length;
    if (alphaRatio < 0.3)
        throw new Error('Content must be at least 30% alphabetic');
    // Dedup check: keyword overlap
    const existing = db.prepare(`
    SELECT id, keywords, content FROM blocks WHERE state >= 0
  `).all();
    const newKeywords = new Set(keywords.map(k => k.toLowerCase()));
    for (const ex of existing) {
        const exKeywords = new Set(ex.keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean));
        if (exKeywords.size === 0 || newKeywords.size === 0)
            continue;
        const overlap = [...newKeywords].filter(k => exKeywords.has(k)).length;
        const overlapRatio = overlap / Math.max(newKeywords.size, exKeywords.size);
        if (overlapRatio > 0.8) {
            // Update existing block instead of duplicating
            db.prepare(`UPDATE blocks SET content = ?, keywords = ?, accessed_at = datetime('now') WHERE id = ?`)
                .run(content, keywordStr, ex.id);
            return { id: ex.id, deduped: true };
        }
    }
    // Insert the new block first
    const result = db.prepare(`
    INSERT INTO blocks (content, category, keywords, state, confidence)
    VALUES (?, ?, ?, ?, ?)
  `).run(content, category, keywordStr, state, confidence);
    const newId = result.lastInsertRowid;
    // Handle supersession after insert (so we have a valid blocker_id)
    if (supersedes) {
        db.prepare(`UPDATE blocks SET state = -1 WHERE id = ?`).run(supersedes);
        db.prepare(`INSERT INTO inhibitions (blocker_id, blocked_id, reason) VALUES (?, ?, 'superseded')`)
            .run(newId, supersedes);
    }
    return { id: newId, deduped: false };
}
export function stats(db) {
    const total = db.prepare(`SELECT COUNT(*) as c FROM blocks`).get().c;
    const active = db.prepare(`SELECT COUNT(*) as c FROM blocks WHERE state = 1`).get().c;
    const voidCount = db.prepare(`SELECT COUNT(*) as c FROM blocks WHERE state = 0`).get().c;
    const inhibitory = db.prepare(`SELECT COUNT(*) as c FROM blocks WHERE state = -1`).get().c;
    const confRows = db.prepare(`SELECT confidence, COUNT(*) as c FROM blocks WHERE state >= 0 GROUP BY confidence`).all();
    const by_confidence = {};
    for (const r of confRows)
        by_confidence[r.confidence] = r.c;
    const catRows = db.prepare(`SELECT category, COUNT(*) as c FROM blocks WHERE state >= 0 GROUP BY category`).all();
    const by_category = {};
    for (const r of catRows)
        by_category[r.category] = r.c;
    const avgLen = db.prepare(`SELECT AVG(LENGTH(content)) as a FROM blocks WHERE state >= 0`).get().a || 0;
    const recallStats = db.prepare(`SELECT COUNT(*) as c, AVG(duration_ms) as avg_ms, AVG(void_fraction) as avg_vf FROM recall_log`).get();
    const neverAccessed = db.prepare(`SELECT COUNT(*) as c FROM blocks WHERE state >= 0 AND access_count = 0`).get().c;
    const activeTotal = active + voidCount;
    return {
        total_blocks: total,
        active,
        void: voidCount,
        inhibitory,
        by_confidence,
        by_category,
        avg_block_tokens: Math.round(avgLen / CHARS_PER_TOKEN),
        total_recalls: recallStats.c || 0,
        avg_recall_ms: Math.round((recallStats.avg_ms || 0) * 10) / 10,
        avg_void_fraction: Math.round((recallStats.avg_vf || 0) * 100) / 100,
        dead_weight_pct: activeTotal > 0 ? Math.round((neverAccessed / activeTotal) * 100) : 0,
    };
}
// ── Void Zones (explain what's being suppressed) ──
export function voidZones(db, query) {
    const result = recall(db, query);
    return {
        zones: result.void_zones.map(z => ({
            topic: z,
            block_count: result.void_zone_counts.get(z) || 0,
            reason: 'Off-topic for current query — suppressed to prevent interference',
        })),
        total_voided: result.blocks_voided,
        void_fraction: result.void_fraction,
    };
}
//# sourceMappingURL=engine.js.map
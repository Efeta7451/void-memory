/**
 * Void Memory — MCP Server
 * 5 tools: recall, store, stats, void_zones, explain
 * Runs on stdio for Claude Code MCP integration
 */
import { openDB } from './db.js';
import { recall, store, stats, voidZones } from './engine.js';
const db = openDB();
// ── MCP Protocol (stdio JSON-RPC) ──
const TOOLS = [
    {
        name: 'void_recall',
        description: 'Recall memories relevant to a query. Uses three-pass pipeline: keyword scoring, void marking (~30% structural absence), budget-fit. Returns only interference-free results. Always use this before working on topics the team has covered.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'What to recall — topic, question, or keywords' },
                budget: { type: 'number', description: 'Max tokens to use (default 4000, max 10000). Lower = tighter recall.' },
            },
            required: ['query'],
        },
    },
    {
        name: 'void_store',
        description: 'Store a new memory block. Quality-gated: min 20 chars, 30% alphabetic, auto-dedup on keyword overlap >80%. Blocks start as "stored" confidence and must be accessed 3+ times to reach "confirmed".',
        inputSchema: {
            type: 'object',
            properties: {
                content: { type: 'string', description: 'The knowledge to store' },
                category: { type: 'string', enum: ['fact', 'preference', 'context', 'skill', 'episode', 'decision'], description: 'Category (default: fact)' },
                keywords: { type: 'array', items: { type: 'string' }, description: '3-8 specific lowercase keywords for retrieval' },
                supersedes: { type: 'number', description: 'ID of block this replaces (marks old block as inhibitory)' },
            },
            required: ['content', 'keywords'],
        },
    },
    {
        name: 'void_stats',
        description: 'Memory health dashboard. Shows block counts by state (active/void/inhibitory), confidence distribution, dead weight %, average void fraction across recalls, and recall performance.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'void_zones',
        description: 'Show what would be suppressed (void-marked) for a given query. Useful for understanding why certain memories are excluded — the void is structural, not accidental.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Query to analyze void zones for' },
            },
            required: ['query'],
        },
    },
    {
        name: 'void_explain',
        description: 'Explain the Void Memory system — what makes it different from standard RAG/memory systems. The core insight: 30% structural absence (from PNN research) creates interference-free recall channels.',
        inputSchema: { type: 'object', properties: {} },
    },
];
// ── Tool handlers ──
function handleTool(name, args) {
    switch (name) {
        case 'void_recall': {
            const result = recall(db, args.query, args.budget);
            return {
                summary: `Recalled ${result.blocks.length} blocks (scored ${result.blocks_scored}, voided ${result.blocks_voided}, ${Math.round(result.void_fraction * 100)}% void) in ${result.duration_ms}ms. Budget: ${result.budget_used}/${result.budget_max} tokens.`,
                blocks: result.blocks.map(b => ({
                    id: b.id,
                    content: b.content,
                    category: b.category,
                    confidence: b.confidence,
                    score: b.score,
                })),
                void_zones: result.void_zones,
                void_fraction: result.void_fraction,
                budget: { used: result.budget_used, max: result.budget_max },
            };
        }
        case 'void_store': {
            const result = store(db, {
                content: args.content,
                category: args.category,
                keywords: args.keywords,
                supersedes: args.supersedes,
            });
            return {
                id: result.id,
                deduped: result.deduped,
                message: result.deduped
                    ? `Updated existing block #${result.id} (>80% keyword overlap detected)`
                    : `Stored new block #${result.id}`,
            };
        }
        case 'void_stats': {
            const s = stats(db);
            return {
                blocks: {
                    total: s.total_blocks,
                    active: s.active,
                    void: s.void,
                    inhibitory: s.inhibitory,
                },
                confidence: s.by_confidence,
                categories: s.by_category,
                avg_block_tokens: s.avg_block_tokens,
                health: {
                    dead_weight_pct: s.dead_weight_pct,
                    total_recalls: s.total_recalls,
                    avg_recall_ms: s.avg_recall_ms,
                    avg_void_fraction: s.avg_void_fraction,
                },
            };
        }
        case 'void_zones': {
            return voidZones(db, args.query);
        }
        case 'void_explain': {
            return {
                name: 'Void Memory',
                version: '1.0.0',
                insight: 'Every AI memory system tries to ADD the right things to context. Void Memory carves out ~30% structural absence — creating interference-free channels for relevant memories to flow through. The 30% void fraction is a topological invariant discovered in ternary photonic neural network research across 5 random seeds.',
                states: {
                    'active (+1)': 'Block is relevant to current context. Retrieved.',
                    'void (0)': 'Block is deliberately suppressed for this query — not irrelevant, but structurally absent to prevent interference.',
                    'inhibitory (-1)': 'Block actively suppresses related blocks (corrections, supersessions).',
                },
                lifecycle: 'observed → stored → accessed → confirmed. Blocks must prove their worth through use.',
                budget: 'Context-aware: adapts from 4K tokens (2% of window) down to 2K near compact. Never silent truncation — reports what was voided and why.',
                speed: '<200ms target. No LLM calls, no embedding distance, no deep chain walks.',
            };
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}
// ── MCP JSON-RPC over stdio ──
let buffer = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => {
    buffer += chunk;
    // Process complete JSON-RPC messages (newline-delimited)
    let newlineIdx;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (!line)
            continue;
        try {
            const msg = JSON.parse(line);
            handleMessage(msg);
        }
        catch (e) {
            sendError(null, -32700, 'Parse error');
        }
    }
});
function handleMessage(msg) {
    const { id, method, params } = msg;
    switch (method) {
        case 'initialize':
            send({
                jsonrpc: '2.0',
                id,
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'void-memory', version: '1.0.0' },
                },
            });
            break;
        case 'notifications/initialized':
            // No response needed
            break;
        case 'tools/list':
            send({
                jsonrpc: '2.0',
                id,
                result: { tools: TOOLS },
            });
            break;
        case 'tools/call': {
            const { name, arguments: args } = params;
            try {
                const result = handleTool(name, args || {});
                send({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                    },
                });
            }
            catch (e) {
                send({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [{ type: 'text', text: `Error: ${e.message}` }],
                        isError: true,
                    },
                });
            }
            break;
        }
        default:
            if (id !== undefined) {
                sendError(id, -32601, `Method not found: ${method}`);
            }
    }
}
function send(msg) {
    process.stdout.write(JSON.stringify(msg) + '\n');
}
function sendError(id, code, message) {
    send({ jsonrpc: '2.0', id, error: { code, message } });
}
// Keep alive
process.on('SIGINT', () => { db.close(); process.exit(0); });
process.on('SIGTERM', () => { db.close(); process.exit(0); });
//# sourceMappingURL=mcp-server.js.map
/**
 * Void Memory — Core Engine
 * Three-pass recall: keyword scoring → void marking → budget fit
 * Target: <200ms, no LLM dependency
 */
import type Database from 'better-sqlite3';
export interface RecallResult {
    blocks: ScoredBlock[];
    void_zones: string[];
    void_zone_counts: Map<string, number>;
    void_fraction: number;
    budget_used: number;
    budget_max: number;
    blocks_scored: number;
    blocks_voided: number;
    duration_ms: number;
}
export interface ScoredBlock {
    id: number;
    content: string;
    category: string;
    keywords: string;
    confidence: string;
    score: number;
    state: number;
}
export declare function recall(db: Database.Database, query: string, budgetTokens?: number): RecallResult;
export interface StoreOpts {
    content: string;
    category?: string;
    keywords?: string[];
    state?: number;
    confidence?: string;
    supersedes?: number;
}
export declare function store(db: Database.Database, opts: StoreOpts): {
    id: number;
    deduped: boolean;
};
export interface MemoryStats {
    total_blocks: number;
    active: number;
    void: number;
    inhibitory: number;
    by_confidence: Record<string, number>;
    by_category: Record<string, number>;
    avg_block_tokens: number;
    total_recalls: number;
    avg_recall_ms: number;
    avg_void_fraction: number;
    dead_weight_pct: number;
}
export declare function stats(db: Database.Database): MemoryStats;
export declare function voidZones(db: Database.Database, query: string): {
    zones: Array<{
        topic: string;
        block_count: number;
        reason: string;
    }>;
    total_voided: number;
    void_fraction: number;
};

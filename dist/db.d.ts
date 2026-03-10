/**
 * Void Memory — Database Layer
 * SQLite store with three-state blocks (active/void/inhibitory)
 */
import Database from 'better-sqlite3';
export interface Block {
    id: number;
    content: string;
    category: string;
    keywords: string;
    state: number;
    confidence: string;
    access_count: number;
    created_at: string;
    accessed_at: string | null;
    supersedes: number | null;
}
export interface RecallEntry {
    id: number;
    query: string;
    blocks_scored: number;
    blocks_returned: number;
    blocks_voided: number;
    void_fraction: number;
    budget_tokens: number;
    duration_ms: number;
    created_at: string;
}
export declare function openDB(path?: string): Database.Database;

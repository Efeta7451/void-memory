/**
 * Void Memory — Basic Usage Example
 *
 * Run: npx tsx examples/basic-usage.ts
 */

import { openDB } from '../src/db.js';
import { recall, store, stats } from '../src/engine.js';

// Open (or create) a database
const db = openDB('./example-data');

// Store some knowledge
console.log('--- Storing memories ---');

store(db, {
  content: 'The production database runs on PostgreSQL 16 with WAL replication',
  keywords: ['database', 'postgres', 'production', 'replication'],
  category: 'fact',
});

store(db, {
  content: 'Always run migrations before deploying the API server',
  keywords: ['deploy', 'migration', 'api', 'process'],
  category: 'skill',
});

store(db, {
  content: 'The CEO prefers weekly status updates over daily standups',
  keywords: ['ceo', 'meetings', 'status', 'preference'],
  category: 'preference',
});

store(db, {
  content: 'Last deploy failed because migrations were not run first. Fixed by running migrate:latest before pm2 restart.',
  keywords: ['deploy', 'migration', 'failure', 'fix'],
  category: 'episode',
});

store(db, {
  content: 'React frontend uses Vite for dev and production builds. Config at vite.config.ts.',
  keywords: ['frontend', 'react', 'vite', 'build'],
  category: 'fact',
});

store(db, {
  content: 'The monitoring dashboard is at grafana.internal:3000. Login with SSO.',
  keywords: ['monitoring', 'grafana', 'dashboard', 'login'],
  category: 'fact',
});

console.log('Stored 6 memories.\n');

// Recall with void filtering
console.log('--- Recall: "how do I deploy?" ---');
const deployResult = recall(db, 'how do I deploy?', 2000);
console.log(`Blocks returned: ${deployResult.blocks.length}`);
console.log(`Blocks scored: ${deployResult.blocks_scored}`);
console.log(`Blocks voided: ${deployResult.blocks_voided}`);
console.log(`Void fraction: ${(deployResult.void_fraction * 100).toFixed(0)}%`);
console.log(`Duration: ${deployResult.duration_ms}ms`);
console.log(`Budget used: ${deployResult.budget_used}/${deployResult.budget_max} tokens`);
console.log('\nReturned memories:');
for (const b of deployResult.blocks) {
  console.log(`  [${b.category}] (score: ${b.score}) ${b.content.slice(0, 80)}...`);
}
console.log(`\nVoid zones (suppressed topics): ${deployResult.void_zones.join(', ') || 'none'}`);

// Check memory health
console.log('\n--- Memory Stats ---');
const s = stats(db);
console.log(`Total blocks: ${s.total_blocks}`);
console.log(`Active: ${s.active}, Void: ${s.void}, Inhibitory: ${s.inhibitory}`);
console.log(`Avg recall: ${s.avg_recall_ms}ms, Void fraction: ${(s.avg_void_fraction * 100).toFixed(0)}%`);

db.close();

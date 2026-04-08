/**
 * Signal Trade - Source Content Storage
 *
 * Track processed content to avoid duplicates
 */

import { Database } from "bun:sqlite";

const DB_PATH = new URL("../signal-trade.db", import.meta.url).pathname;
const db = new Database(DB_PATH);

// Create tables for source monitoring
db.run(`
  CREATE TABLE IF NOT EXISTS source_content (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_name TEXT NOT NULL,
    content_id TEXT NOT NULL,
    content_url TEXT,
    content_text TEXT,
    published_at TEXT,
    processed_at TEXT NOT NULL,
    signal_generated INTEGER DEFAULT 0,
    UNIQUE(source_type, content_id)
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_source_content_type ON source_content(source_type)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_source_content_processed ON source_content(processed_at)`);

// Track last check time per source
db.run(`
  CREATE TABLE IF NOT EXISTS source_last_check (
    source_key TEXT PRIMARY KEY,
    last_check_at TEXT NOT NULL,
    last_content_id TEXT
  )
`);

// Prepared statements
const insertContent = db.prepare(`
  INSERT OR IGNORE INTO source_content
  (id, source_type, source_name, content_id, content_url, content_text, published_at, processed_at, signal_generated)
  VALUES ($id, $source_type, $source_name, $content_id, $content_url, $content_text, $published_at, $processed_at, $signal_generated)
`);

const selectByContentId = db.prepare(`
  SELECT * FROM source_content WHERE source_type = ? AND content_id = ?
`);

const updateLastCheck = db.prepare(`
  INSERT OR REPLACE INTO source_last_check (source_key, last_check_at, last_content_id)
  VALUES ($source_key, $last_check_at, $last_content_id)
`);

const selectLastCheck = db.prepare(`
  SELECT * FROM source_last_check WHERE source_key = ?
`);

const selectRecentContent = db.prepare(`
  SELECT * FROM source_content ORDER BY processed_at DESC LIMIT ?
`);

const markSignalGenerated = db.prepare(`
  UPDATE source_content SET signal_generated = 1 WHERE id = ?
`);

// ============================================================================
// CRUD Operations
// ============================================================================

export interface ContentRecord {
  id: string;
  sourceType: string;
  sourceName: string;
  contentId: string;
  contentUrl?: string;
  contentText?: string;
  publishedAt?: string;
  processedAt: string;
  signalGenerated: boolean;
}

export function isContentProcessed(sourceType: string, contentId: string): boolean {
  const row = selectByContentId.get(sourceType, contentId);
  return row !== null;
}

export function saveContent(content: Omit<ContentRecord, "signalGenerated">): boolean {
  try {
    insertContent.run({
      $id: content.id,
      $source_type: content.sourceType,
      $source_name: content.sourceName,
      $content_id: content.contentId,
      $content_url: content.contentUrl || null,
      $content_text: content.contentText || null,
      $published_at: content.publishedAt || null,
      $processed_at: content.processedAt,
      $signal_generated: 0,
    });
    return true;
  } catch (e) {
    // Duplicate content ID - already processed
    return false;
  }
}

export function markAsSignalGenerated(contentDbId: string): void {
  markSignalGenerated.run(contentDbId);
}

export function getLastCheck(sourceKey: string): { lastCheckAt: string; lastContentId?: string } | null {
  const row = selectLastCheck.get(sourceKey) as any;
  if (!row) return null;
  return {
    lastCheckAt: row.last_check_at,
    lastContentId: row.last_content_id,
  };
}

export function updateSourceLastCheck(sourceKey: string, lastContentId?: string): void {
  updateLastCheck.run({
    $source_key: sourceKey,
    $last_check_at: new Date().toISOString(),
    $last_content_id: lastContentId || null,
  });
}

export function getRecentContent(limit = 50): ContentRecord[] {
  const rows = selectRecentContent.all(limit) as any[];
  return rows.map(row => ({
    id: row.id,
    sourceType: row.source_type,
    sourceName: row.source_name,
    contentId: row.content_id,
    contentUrl: row.content_url,
    contentText: row.content_text,
    publishedAt: row.published_at,
    processedAt: row.processed_at,
    signalGenerated: row.signal_generated === 1,
  }));
}

// Generate unique content ID
export function generateContentId(): string {
  return `content_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

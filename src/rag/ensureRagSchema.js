/**
 * OSA Portal–compatible rag_chunks schema (pgvector + HNSW).
 * Same structure as OSA Transaction Guide Portal ensureV2Schema.
 */
async function ensureRagSchema(pool) {
  if (!pool) {
    throw new Error('ensureRagSchema requires a Postgres pool');
  }

  const statements = [
    `CREATE EXTENSION IF NOT EXISTS pgcrypto`,
    `CREATE EXTENSION IF NOT EXISTS vector`,
    `CREATE TABLE IF NOT EXISTS rag_chunks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      chunk_id TEXT UNIQUE NOT NULL,
      topic TEXT NOT NULL DEFAULT '',
      article TEXT NOT NULL DEFAULT '',
      section TEXT NOT NULL DEFAULT '',
      keywords TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
      bot_routing TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'JanJan Bot Knowledge',
      embedding vector(768),
      token_count INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_rag_chunks_keywords ON rag_chunks USING GIN (keywords)`,
    `CREATE INDEX IF NOT EXISTS idx_rag_chunks_active ON rag_chunks (is_active) WHERE is_active = true`,
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_indexes WHERE indexname = 'idx_rag_chunks_embedding'
       ) THEN
         BEGIN
           EXECUTE 'CREATE INDEX idx_rag_chunks_embedding ON rag_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)';
         EXCEPTION WHEN others THEN
           RAISE NOTICE 'HNSW index creation skipped: %', SQLERRM;
         END;
       END IF;
     END $$;`,
  ];

  for (const sql of statements) {
    try {
      await pool.query(sql);
    } catch (err) {
      console.warn('[rag:schema]', err.message);
    }
  }

  // Migrate legacy JanJan table (chunk_id-only PK, no embedding)
  try {
    const colRes = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'rag_chunks'`,
    );
    const cols = new Set((colRes.rows || []).map((r) => r.column_name));
    if (cols.size && !cols.has('embedding')) {
      await pool.query(`ALTER TABLE rag_chunks ADD COLUMN IF NOT EXISTS embedding vector(768)`);
    }
    if (cols.size && !cols.has('is_active')) {
      await pool.query(
        `ALTER TABLE rag_chunks ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`,
      );
    }
    if (cols.size && !cols.has('id')) {
      await pool.query(`ALTER TABLE rag_chunks ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()`);
    }
    if (cols.size && !cols.has('created_at')) {
      await pool.query(
        `ALTER TABLE rag_chunks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
      );
    }
  } catch (err) {
    console.warn('[rag:schema] legacy migration:', err.message);
  }

  console.log('[RAG] Schema ready (pgvector rag_chunks, OSA-compatible).');
}

module.exports = { ensureRagSchema };

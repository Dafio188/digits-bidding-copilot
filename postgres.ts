/**
 * postgres.ts — Motore Relazionale Neon PostgreSQL Cloud per Digits Bidding Co-Pilot
 */
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

export const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL Cloud] Errore nel pool di connessioni:', err);
});

// Verifica la connessione al DB Neon
export async function testPostgresConnection(): Promise<boolean> {
  try {
    const res = await pool.query('SELECT NOW() as current_time, current_database() as db_name;');
    console.log(`✅ [PostgreSQL Cloud Neon] Connesso a "${res.rows[0].db_name}" (Ora server: ${res.rows[0].current_time})`);
    return true;
  } catch (err: any) {
    console.error('❌ [PostgreSQL Cloud Neon] Errore di connessione:', err.message);
    return false;
  }
}

// Inizializza e verifica le tabelle relazionali PostgreSQL
export async function initPostgresTables(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(255) PRIMARY KEY,
        code_oem VARCHAR(255),
        description TEXT,
        brand VARCHAR(255),
        cost_price NUMERIC(12,2) DEFAULT 0.00,
        retail_price NUMERIC(12,2) DEFAULT 0.00,
        stock INT DEFAULT 0,
        is_tender_specific BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tenders (
        id VARCHAR(255) PRIMARY KEY,
        cig VARCHAR(255),
        title TEXT NOT NULL,
        authority TEXT,
        value NUMERIC(14,2) DEFAULT 0.00,
        deadline VARCHAR(100),
        region VARCHAR(100),
        cpv VARCHAR(100),
        description TEXT,
        status VARCHAR(50) DEFAULT 'active',
        ai_evaluation VARCHAR(50),
        ai_reasoning TEXT,
        source VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tender_analyses (
        tender_id VARCHAR(255) PRIMARY KEY,
        capitolato_text TEXT,
        analysis_json JSONB,
        compliance_json JSONB,
        generated_offer_json JSONB,
        verified_docs_json JSONB,
        active_tab VARCHAR(50),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS company_profile (
        id INT PRIMARY KEY DEFAULT 1,
        name VARCHAR(255),
        vat_number VARCHAR(100),
        fiscal_code VARCHAR(100),
        location VARCHAR(255),
        max_tender_value NUMERIC(14,2),
        profile_json JSONB,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        action VARCHAR(100) NOT NULL,
        details TEXT,
        metadata_json JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS app_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'operatore',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ [PostgreSQL Cloud Neon] Tabelle relazionali attive.');
  } catch (err: any) {
    console.error('❌ [PostgreSQL Cloud Neon] Errore inizializzazione DDL:', err.message);
  } finally {
    client.release();
  }
}

// ─── PRODOTTI / LISTINO ───────────────────────────────────────────────────────
export async function getProductsPg(): Promise<any[]> {
  try {
    const res = await pool.query('SELECT id, code_oem as "codeOEM", description, brand, cost_price as "costPrice", retail_price as "retailPrice", stock, is_tender_specific as "isTenderSpecific" FROM products ORDER BY description ASC');
    return res.rows.map(r => ({
      ...r,
      costPrice: Number(r.costPrice) || 0,
      retailPrice: Number(r.retailPrice) || 0,
      stock: Number(r.stock) || 0,
    }));
  } catch (err: any) {
    console.error('[PostgreSQL] Errore lettura prodotti:', err.message);
    return [];
  }
}

export async function upsertProductPg(product: any): Promise<void> {
  const query = `
    INSERT INTO products (id, code_oem, description, brand, cost_price, retail_price, stock, is_tender_specific, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (id) DO UPDATE SET
      code_oem = EXCLUDED.code_oem,
      description = EXCLUDED.description,
      brand = EXCLUDED.brand,
      cost_price = EXCLUDED.cost_price,
      retail_price = EXCLUDED.retail_price,
      stock = EXCLUDED.stock,
      is_tender_specific = EXCLUDED.is_tender_specific,
      updated_at = NOW();
  `;
  await pool.query(query, [
    product.id,
    product.codeOEM || '',
    product.description || '',
    product.brand || '',
    Number(product.costPrice) || 0,
    Number(product.retailPrice) || 0,
    Number(product.stock) || 0,
    !!product.isTenderSpecific
  ]);
}

export async function deleteProductPg(id: string): Promise<void> {
  await pool.query('DELETE FROM products WHERE id = $1', [id]);
}

export async function replaceProductsPg(products: any[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM products');
    for (const p of products) {
      await client.query(
        `INSERT INTO products (id, code_oem, description, brand, cost_price, retail_price, stock, is_tender_specific, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          p.id,
          p.codeOEM || '',
          p.description || '',
          p.brand || '',
          Number(p.costPrice) || 0,
          Number(p.retailPrice) || 0,
          Number(p.stock) || 0,
          !!p.isTenderSpecific
        ]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ─── GARE / TENDERS ────────────────────────────────────────────────────────────
export async function upsertTenderPg(t: any): Promise<void> {
  const query = `
    INSERT INTO tenders (id, cig, title, authority, value, deadline, region, cpv, description, status, ai_evaluation, ai_reasoning, source)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (id) DO UPDATE SET
      cig = COALESCE(EXCLUDED.cig, tenders.cig),
      title = COALESCE(EXCLUDED.title, tenders.title),
      authority = COALESCE(EXCLUDED.authority, tenders.authority),
      value = COALESCE(EXCLUDED.value, tenders.value),
      deadline = COALESCE(EXCLUDED.deadline, tenders.deadline),
      region = COALESCE(EXCLUDED.region, tenders.region),
      cpv = COALESCE(EXCLUDED.cpv, tenders.cpv),
      description = COALESCE(EXCLUDED.description, tenders.description),
      status = COALESCE(EXCLUDED.status, tenders.status),
      ai_evaluation = COALESCE(EXCLUDED.ai_evaluation, tenders.ai_evaluation),
      ai_reasoning = COALESCE(EXCLUDED.ai_reasoning, tenders.ai_reasoning),
      source = COALESCE(EXCLUDED.source, tenders.source);
  `;
  await pool.query(query, [
    t.id,
    t.cig || null,
    t.title || 'Gara senza titolo',
    t.authority || null,
    Number(t.value ?? t.amount) || 0,
    t.deadline || null,
    t.region || null,
    t.cpv || null,
    t.description || null,
    t.status || 'active',
    t.aiEvaluation || null,
    t.aiReasoning || null,
    t.source || 'ANAC Open Data'
  ]);
}

export async function queryTendersPg(filter: any = {}): Promise<{ tenders: any[]; total: number; page: number; pageSize: number }> {
  const { query, region, cpv, minAmount = 0, maxAmount = 99999999, page = 1, pageSize = 500 } = filter;
  let whereClauses: string[] = ["status = 'active'"];
  let values: any[] = [];

  if (minAmount > 0) {
    values.push(minAmount);
    whereClauses.push(`value >= $${values.length}`);
  }
  if (maxAmount < 99999999) {
    values.push(maxAmount);
    whereClauses.push(`value <= $${values.length}`);
  }
  if (region && region !== 'all') {
    values.push(`%${region.toLowerCase()}%`);
    whereClauses.push(`LOWER(region) LIKE $${values.length}`);
  }
  if (cpv) {
    values.push(`${cpv.substring(0, 3)}%`);
    whereClauses.push(`cpv LIKE $${values.length}`);
  }
  if (query && query.length > 2) {
    values.push(`%${query.toLowerCase()}%`);
    const idx = values.length;
    whereClauses.push(`(LOWER(title) LIKE $${idx} OR LOWER(description) LIKE $${idx} OR LOWER(authority) LIKE $${idx})`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const countRes = await pool.query(`SELECT COUNT(*) as total FROM tenders ${whereSql}`, values);
  const total = parseInt(countRes.rows[0].total) || 0;

  const offset = (page - 1) * pageSize;
  values.push(pageSize, offset);
  const dataRes = await pool.query(`SELECT * FROM tenders ${whereSql} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);

  const tenders = dataRes.rows.map(r => ({
    id: r.id,
    cig: r.cig,
    title: r.title,
    authority: r.authority,
    value: Number(r.value) || 0,
    deadline: r.deadline,
    region: r.region,
    cpv: r.cpv,
    description: r.description,
    status: r.status,
    aiEvaluation: r.ai_evaluation,
    aiReasoning: r.ai_reasoning,
    source: r.source,
    createdAt: r.created_at ? r.created_at.toISOString() : null,
  }));

  return { tenders, total, page, pageSize };
}

export async function getParticipatingTendersPg(): Promise<any[]> {
  const res = await pool.query("SELECT * FROM tenders WHERE status IN ('submitted', 'won', 'lost') ORDER BY created_at DESC");
  return res.rows.map(r => ({
    id: r.id,
    cig: r.cig,
    title: r.title,
    authority: r.authority,
    value: Number(r.value) || 0,
    deadline: r.deadline,
    region: r.region,
    cpv: r.cpv,
    description: r.description,
    status: r.status,
    aiEvaluation: r.ai_evaluation,
    aiReasoning: r.ai_reasoning,
    source: r.source,
  }));
}

/**
 * Rimuove dal DB PostgreSQL le gare scadute a cui NON si è partecipato (status = 'active')
 * Conserva tutte le gare partecipate ('submitted', 'won', 'lost') o non ancora scadute.
 */
export async function purgeUnparticipatedExpiredTendersPg(): Promise<number> {
  const query = `
    DELETE FROM tenders 
    WHERE status = 'active' 
      AND deadline IS NOT NULL 
      AND deadline != 'Non definita'
      AND (
        (deadline ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' AND deadline::date < CURRENT_DATE) OR
        (deadline ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}' AND to_date(deadline, 'DD/MM/YYYY') < CURRENT_DATE)
      );
  `;
  try {
    const res = await pool.query(query);
    console.log(`[POSTGRES] Pulizia automatica: eliminate ${res.rowCount} gare scadute non partecipate.`);
    return res.rowCount || 0;
  } catch (err: any) {
    console.warn(`[POSTGRES] Errore durante la pulizia gare scadute:`, err.message);
    return 0;
  }
}

// ─── CONTESTO ANALISI GARA ───────────────────────────────────────────────────
export async function saveTenderAnalysisPg(tenderId: string, payload: any): Promise<void> {
  const query = `
    INSERT INTO tender_analyses (tender_id, capitolato_text, analysis_json, compliance_json, generated_offer_json, verified_docs_json, active_tab, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (tender_id) DO UPDATE SET
      capitolato_text = COALESCE(EXCLUDED.capitolato_text, tender_analyses.capitolato_text),
      analysis_json = COALESCE(EXCLUDED.analysis_json, tender_analyses.analysis_json),
      compliance_json = COALESCE(EXCLUDED.compliance_json, tender_analyses.compliance_json),
      generated_offer_json = COALESCE(EXCLUDED.generated_offer_json, tender_analyses.generated_offer_json),
      verified_docs_json = COALESCE(EXCLUDED.verified_docs_json, tender_analyses.verified_docs_json),
      active_tab = COALESCE(EXCLUDED.active_tab, tender_analyses.active_tab),
      updated_at = NOW();
  `;
  await pool.query(query, [
    tenderId,
    payload.capitolatoText || null,
    payload.analysis ? JSON.stringify(payload.analysis) : null,
    payload.compliance ? JSON.stringify(payload.compliance) : null,
    payload.generatedOffer ? JSON.stringify(payload.generatedOffer) : null,
    payload.verifiedDocs ? JSON.stringify(payload.verifiedDocs) : null,
    payload.activeTab || null
  ]);
}

export async function getTenderAnalysisPg(tenderId: string): Promise<any | null> {
  const res = await pool.query('SELECT * FROM tender_analyses WHERE tender_id = $1', [tenderId]);
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    tenderId: r.tender_id,
    capitolatoText: r.capitolato_text,
    analysis: r.analysis_json,
    compliance: r.compliance_json,
    generatedOffer: r.generated_offer_json,
    verifiedDocs: r.verified_docs_json,
    activeTab: r.active_tab,
  };
}

// ─── PROFILO AZIENDALE ────────────────────────────────────────────────────────
export async function getCompanyProfilePg(): Promise<any | null> {
  const res = await pool.query('SELECT profile_json FROM company_profile WHERE id = 1');
  return res.rows[0]?.profile_json || null;
}

export async function saveCompanyProfilePg(profile: any): Promise<void> {
  const query = `
    INSERT INTO company_profile (id, name, vat_number, fiscal_code, location, max_tender_value, profile_json, updated_at)
    VALUES (1, $1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      vat_number = EXCLUDED.vat_number,
      fiscal_code = EXCLUDED.fiscal_code,
      location = EXCLUDED.location,
      max_tender_value = EXCLUDED.max_tender_value,
      profile_json = EXCLUDED.profile_json,
      updated_at = NOW();
  `;
  await pool.query(query, [
    profile.name || '',
    profile.vatNumber || '',
    profile.fiscalCode || '',
    profile.location || '',
    Number(profile.maxTenderValue) || 185000,
    JSON.stringify(profile)
  ]);
}

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────
export async function logActivityPg(action: string, details: string, metadata?: any): Promise<void> {
  try {
    await pool.query(
      'INSERT INTO audit_logs (action, details, metadata_json) VALUES ($1, $2, $3)',
      [action, details, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err: any) {
    console.error('[PostgreSQL] Errore salvataggio audit log:', err.message);
  }
}

export async function getAuditLogPg(): Promise<any[]> {
  try {
    const res = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100');
    return res.rows;
  } catch (err: any) {
    console.error('[PostgreSQL] Errore lettura audit log:', err.message);
    return [];
  }
}

export async function getDbStatsPg(): Promise<any> {
  try {
    const countRes = await pool.query('SELECT COUNT(*) as total FROM tenders');
    const total = parseInt(countRes.rows[0].total) || 0;
    return { total, byRegion: [], lastIngestion: null };
  } catch (err: any) {
    return { total: 0, byRegion: [], lastIngestion: null };
  }
}

export async function upsertTendersBatchPg(tenders: any[]): Promise<number> {
  if (!tenders || tenders.length === 0) return 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const t of tenders) {
      const query = `
        INSERT INTO tenders (id, cig, title, authority, value, deadline, region, cpv, description, status, ai_evaluation, ai_reasoning, source)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          cig = COALESCE(EXCLUDED.cig, tenders.cig),
          title = COALESCE(EXCLUDED.title, tenders.title),
          authority = COALESCE(EXCLUDED.authority, tenders.authority),
          value = COALESCE(EXCLUDED.value, tenders.value),
          deadline = COALESCE(EXCLUDED.deadline, tenders.deadline),
          region = COALESCE(EXCLUDED.region, tenders.region),
          cpv = COALESCE(EXCLUDED.cpv, tenders.cpv),
          description = COALESCE(EXCLUDED.description, tenders.description),
          status = COALESCE(EXCLUDED.status, tenders.status),
          ai_evaluation = COALESCE(EXCLUDED.ai_evaluation, tenders.ai_evaluation),
          ai_reasoning = COALESCE(EXCLUDED.ai_reasoning, tenders.ai_reasoning),
          source = COALESCE(EXCLUDED.source, tenders.source);
      `;
      await client.query(query, [
        t.id,
        t.cig || null,
        t.title || 'Gara senza titolo',
        t.authority || null,
        Number(t.value ?? t.amount) || 0,
        t.deadline || null,
        t.region || null,
        t.cpv || null,
        t.description || null,
        t.status || 'active',
        t.aiEvaluation || null,
        t.aiReasoning || null,
        t.source || 'ANAC Open Data'
      ]);
    }
    await client.query('COMMIT');
    return tenders.length;
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Errore batch insert tenders:', err.message);
    return 0;
  } finally {
    client.release();
  }
}

// ─── MIGRAZIONE AUTOMATICA DA FILE JSON A NEON ──────────────────────────────
export async function syncLocalJsonToNeon(): Promise<void> {
  console.log('🔄 [PostgreSQL Neon] Avvio migrazione automatica dai file JSON locali...');
  try {
    // 1. Migrazione prodotti
    const productsPath = path.join(process.cwd(), 'data', 'products.json');
    if (fs.existsSync(productsPath)) {
      const rawProducts = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));
      const productsData = Array.isArray(rawProducts) ? rawProducts : (rawProducts.products || []);
      for (const p of productsData) {
        await upsertProductPg(p);
      }
      console.log(`✅ [PostgreSQL Neon] Migrati ${productsData.length} prodotti da listino.`);
    }

    // 2. Migrazione profilo aziendale
    const profilePath = path.join(process.cwd(), 'data', 'company_profile.json');
    if (fs.existsSync(profilePath)) {
      const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
      await saveCompanyProfilePg(profileData);
      console.log('✅ [PostgreSQL Neon] Migrato profilo aziendale DIGITS.');
    }

    // 3. Migrazione gare
    const tendersPath = path.join(process.cwd(), 'data', 'tenders.json');
    if (fs.existsSync(tendersPath)) {
      const store = JSON.parse(fs.readFileSync(tendersPath, 'utf-8'));
      const tendersList = Object.values(store.tenders || {});
      const count = await upsertTendersBatchPg(tendersList);
      console.log(`✅ [PostgreSQL Neon] Migrate ${count} gare dall'archivio.`);
    }

    // 4. Migrazione analisi salvate
    const analysisDir = path.join(process.cwd(), 'data', 'tender_analysis');
    if (fs.existsSync(analysisDir)) {
      const files = fs.readdirSync(analysisDir).filter(f => f.endsWith('.json'));
      for (const f of files) {
        const content = JSON.parse(fs.readFileSync(path.join(analysisDir, f), 'utf-8'));
        const tenderId = content.tenderId || f.replace('.json', '');
        await saveTenderAnalysisPg(tenderId, content);
      }
      console.log(`✅ [PostgreSQL Neon] Migrate ${files.length} sessioni di analisi salvate.`);
    }
  } catch (err: any) {
    console.error('❌ [PostgreSQL Neon] Errore sincronizzazione JSON:', err.message);
  }
}

// ─── GESTIONE UTENTI (APP USERS) ───────────────────────────────────────────────
export async function getAppUsersPg(): Promise<any[]> {
  try {
    const res = await pool.query(
      'SELECT id, username, role, is_active as "isActive", created_at as "createdAt" FROM app_users ORDER BY id ASC'
    );
    return res.rows;
  } catch (err: any) {
    console.error('[PostgreSQL] Errore lettura utenti app:', err.message);
    return [];
  }
}

export async function findAppUserByUsernamePg(username: string): Promise<any | null> {
  try {
    const res = await pool.query(
      'SELECT id, username, password_hash as "passwordHash", role, is_active as "isActive" FROM app_users WHERE LOWER(username) = LOWER($1)',
      [username.trim()]
    );
    return res.rows[0] || null;
  } catch (err: any) {
    console.error('[PostgreSQL] Errore ricerca utente:', err.message);
    return null;
  }
}

export async function createAppUserPg(username: string, passwordHash: string, role: string = 'operatore'): Promise<any> {
  const query = `
    INSERT INTO app_users (username, password_hash, role, is_active, created_at, updated_at)
    VALUES ($1, $2, $3, TRUE, NOW(), NOW())
    RETURNING id, username, role, is_active as "isActive", created_at as "createdAt";
  `;
  const res = await pool.query(query, [username.trim(), passwordHash, role]);
  return res.rows[0];
}

export async function toggleAppUserStatusPg(id: number, isActive: boolean): Promise<boolean> {
  try {
    await pool.query('UPDATE app_users SET is_active = $1, updated_at = NOW() WHERE id = $2', [isActive, id]);
    return true;
  } catch (err: any) {
    console.error('[PostgreSQL] Errore toggle status utente:', err.message);
    return false;
  }
}

export async function deleteAppUserPg(id: number): Promise<boolean> {
  try {
    await pool.query('DELETE FROM app_users WHERE id = $1', [id]);
    return true;
  } catch (err: any) {
    console.error('[PostgreSQL] Errore eliminazione utente:', err.message);
    return false;
  }
}


import { syncLocalJsonToNeon, pool } from '../postgres.ts';

async function migrate() {
  console.log('Avvio migrazione dati al Neon PostgreSQL...');
  try {
    await syncLocalJsonToNeon();
    console.log('Migrazione completata con successo!');
  } catch (err) {
    console.error('Errore durante la migrazione:', err);
  } finally {
    await pool.end();
  }
}

migrate();

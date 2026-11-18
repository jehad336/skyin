'use strict';
const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });

// BIGINT ids/counts come back as strings by default; they stay well inside JS number range here.
require('pg').types.setTypeParser(20, (v) => Number(v));
// DATE columns: keep as 'YYYY-MM-DD' strings (no timezone shifting).
require('pg').types.setTypeParser(1082, (v) => v);

const query = (text, params) => pool.query(text, params);
const one = async (text, params) => (await pool.query(text, params)).rows[0] || null;
const many = async (text, params) => (await pool.query(text, params)).rows;

/** Run fn(client) inside a transaction. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, one, many, tx };

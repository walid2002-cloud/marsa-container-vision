const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'marsa_user',
  password: process.env.DB_PASSWORD || 'marsa_pass_2026',
  database: process.env.DB_NAME || 'marsa_container_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('[DB] Connexion MySQL établie avec succès.');
    connection.release();
    return true;
  } catch (error) {
    console.error('[DB] Impossible de se connecter à MySQL :', error.message);
    return false;
  }
}

async function query(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

module.exports = { pool, testConnection, query };

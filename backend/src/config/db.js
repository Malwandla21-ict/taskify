const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config();

/*
  Hosted MySQL providers (Aiven, PlanetScale, most managed DBs) require a
  TLS connection — plain localhost dev doesn't. Opt in with DB_SSL=true
  rather than always-on, so local dev against a bare MySQL install (no
  cert) keeps working unchanged.

  DB_SSL_CA can hold the provider's CA certificate (paste its full PEM
  contents, including the BEGIN/END lines, into one env var — most hosts
  including Render support multi-line env var values). Without it, this
  falls back to rejectUnauthorized: false, which still encrypts the
  connection but skips certificate verification — acceptable for a
  coursework demo, not for anything holding real user data long-term.
*/
const sslConfig = process.env.DB_SSL === "true"
  ? {
      rejectUnauthorized: !!process.env.DB_SSL_CA,
      ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA } : {})
    }
  : undefined;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ...(sslConfig ? { ssl: sslConfig } : {})
});

module.exports = pool;
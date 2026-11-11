#!/usr/bin/env node
// Print the storage upload key for the SST composite refresh.
// GitHub Actions already has the database URL used by the waypoint snapshot.
// It does not have the storage key. That key lives in Supabase Vault
// (name: sst_storage_service_role) and this script writes it to stdout only.
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if(!url){
  console.error("SUPABASE_DB_URL is not set");
  process.exit(1);
}

function redact(err){
  return String(err && err.message || err).replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redacted]");
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

try{
  await client.connect();
  const { rows } = await client.query(
    "select decrypted_secret from vault.decrypted_secrets where name = $1",
    ["sst_storage_service_role"],
  );
  const key = rows[0] && String(rows[0].decrypted_secret || "").trim();
  if(!key){
    console.error("Vault has no sst_storage_service_role secret");
    process.exit(1);
  }
  process.stdout.write(key);
}catch(err){
  console.error(redact(err));
  process.exit(1);
}finally{
  try{ await client.end(); }catch{ /* already closed */ }
}

import pg from "pg";

const [action, id, ...rest] = process.argv.slice(2);
if (!["grant", "revoke"].includes(action) || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id ?? "") || rest.length) {
  process.stderr.write("Usage: pnpm --filter @workspace/db run admin-access grant|revoke ACCOUNT_ID\n");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  process.stderr.write("No database connection is configured.\n");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const { rowCount } = await pool.query("update learners set role = $1 where id = $2", [action === "grant" ? "admin" : "student", id]);
  if (!rowCount) {
    process.stderr.write("No account matches that ID. No change was made.\n");
    process.exitCode = 1;
  } else {
    process.stdout.write(action === "grant" ? "Admin access granted.\n" : "Admin access removed.\n");
  }
} catch {
  process.stderr.write("Could not update admin access. Check the target database and whether the new schema is applied.\n");
  process.exitCode = 1;
} finally {
  await pool.end();
}

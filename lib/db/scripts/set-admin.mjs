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
  const { rows } = await pool.query("select role from learners where id = $1", [id]);
  if (!rows.length) {
    process.stderr.write("No account matches that ID. No change was made.\n");
    process.exitCode = 1;
  } else if (action === "grant" && rows[0].role === "student") {
    await pool.query("update learners set role = 'admin' where id = $1 and role = 'student'", [id]);
    process.stdout.write("Admin access granted.\n");
  } else if (action === "revoke" && rows[0].role === "admin") {
    await pool.query("update learners set role = 'student' where id = $1 and role = 'admin'", [id]);
    process.stdout.write("Admin access removed.\n");
  } else if ((action === "grant" && rows[0].role === "admin") || (action === "revoke" && rows[0].role === "student")) {
    process.stdout.write(action === "grant" ? "This account already has admin access.\n" : "This account is already a student account.\n");
  } else {
    process.stderr.write("This command only changes student and regular administrator accounts. No change was made.\n");
    process.exitCode = 1;
  }
} catch {
  process.stderr.write("Could not update admin access. Check the target database and account ID.\n");
  process.exitCode = 1;
} finally {
  await pool.end();
}

import { randomUUID } from "node:crypto";
import pg from "pg";

const [action, id, ...rest] = process.argv.slice(2);
if (!["promote", "demote"].includes(action) || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id ?? "") || rest.length) {
  process.stderr.write("Usage: pnpm --filter @workspace/db run superadmin-access promote|demote ACCOUNT_ID\n");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  process.stderr.write("No database connection is configured.\n");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
let commandError = "";
try {
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(hashtext('adhyayaan-superadmin-role-changes'))");
  const { rows } = await client.query("select role from learners where id = $1 for update", [id]);
  if (!rows.length) {
    commandError = "No account matches that ID. No change was made.";
    throw new Error("command");
  }

  const currentRole = rows[0].role;
  if (action === "promote") {
    if (currentRole === "guide") {
      commandError = "A guide account must first be changed through the guide management workflow. No change was made.";
      throw new Error("command");
    }
    if (currentRole === "superadmin") {
      process.stdout.write("This account is already a Superadmin.\n");
    } else {
      await client.query("update learners set role = 'superadmin' where id = $1", [id]);
      await client.query(
        "insert into learning_superadmin_role_audit (id, actor_id, target_id, previous_role, new_role) values ($1, null, $2, $3, 'superadmin')",
        [randomUUID(), id, currentRole],
      );
      process.stdout.write("Superadmin access granted to the existing account.\n");
    }
  } else {
    if (currentRole !== "superadmin") {
      commandError = "That account is not a Superadmin. No change was made.";
      throw new Error("command");
    }
    const { rows: totals } = await client.query("select count(*)::int as total from learners where role = 'superadmin'");
    if (totals[0].total <= 1) {
      commandError = "The last Superadmin cannot be removed. Promote another account first.";
      throw new Error("command");
    }
    await client.query("update learners set role = 'admin' where id = $1 and role = 'superadmin'", [id]);
    await client.query(
      "insert into learning_superadmin_role_audit (id, actor_id, target_id, previous_role, new_role) values ($1, null, $2, 'superadmin', 'admin')",
      [randomUUID(), id],
    );
    process.stdout.write("Superadmin access removed; regular admin access remains.\n");
  }
  await client.query("commit");
} catch {
  await client.query("rollback").catch(() => {});
  process.stderr.write(commandError || "Could not update Superadmin access. Check the target database and account ID.\n");
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

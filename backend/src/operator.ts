import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { openDatabase } from './database.ts';
import { adminAccountEmail, adminLogin, passwordHash, verifyPassword } from './security.ts';
import { issueAdminRecovery } from './admin-recovery.ts';
import { emailField, passwordField } from './validation.ts';

const bootstrapAdmin = process.argv[2] === '--bootstrap-admin';
const issueRecovery = process.argv[2] === '--issue-admin-recovery';
const email = bootstrapAdmin || issueRecovery ? adminAccountEmail : emailField(process.argv[2]);
const password = bootstrapAdmin ? passwordField(readFileSync(0, 'utf8').replace(/\r?\n$/, ''), true) : undefined;

const db = await openDatabase();
try {
  if (issueRecovery) {
    const recovery = await issueAdminRecovery(db, true);
    if (!recovery) throw new Error('Could not issue an admin recovery code.');
    console.log('One-time admin recovery code (expires in 30 minutes): ' + recovery.code);
  } else if (password !== undefined) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO customers (id, email, full_name, password, operator)
       VALUES ($1, $2, 'Store Admin', $3, TRUE) ON CONFLICT (email) DO NOTHING RETURNING id`,
      [randomUUID(), email, await passwordHash(password)]
    );
    if (!rows.length) {
      const existing = await db.query<{ operator: boolean; password: string }>(
        'SELECT operator, password FROM customers WHERE email = $1', [email]
      );
      const account = existing.rows[0];
      if (!account?.operator || !await verifyPassword(password, account.password)) {
        throw new Error('The admin ID is already reserved by another account.');
      }
    }
    console.log(`Publisher access enabled for the ${adminLogin} ID.`);
  } else {
    const result = await db.query('UPDATE customers SET operator = TRUE WHERE email = $1 RETURNING email', [email]);
    if (!result.rows.length) {
      console.error('Create the publisher account on the storefront first.');
      process.exitCode = 1;
    } else {
      console.log('Publisher access enabled. Restart the store and sign in to open the publisher dashboard.');
    }
  }
} finally {
  await db.close();
}

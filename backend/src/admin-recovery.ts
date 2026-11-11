import { randomBytes } from 'node:crypto';
import type { DatabaseExecutor } from './database-driver.ts';
import { digest } from './security.ts';
import { RequestError } from './validation.ts';

export async function issueAdminRecovery(db: DatabaseExecutor, replaceActive = false) {
  const code = randomBytes(32).toString('hex');
  const hash = digest(code);
  const result = await db.query(`
    INSERT INTO admin_recovery (singleton, token_hash, expires_at)
    VALUES (TRUE, $1, NOW() + INTERVAL '30 minutes')
    ON CONFLICT (singleton) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at
    WHERE $2 OR admin_recovery.expires_at <= NOW()
    RETURNING singleton
  `, [hash, replaceActive]);
  return result.rows.length ? { code, hash } : null;
}

export async function emailAdminRecovery(db: DatabaseExecutor, requestedEmail: string) {
  const recipient = process.env.ADMIN_RECOVERY_EMAIL?.trim().toLowerCase();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const sender = process.env.ADMIN_RECOVERY_FROM?.trim() || 'Bhagwati Publications <onboarding@resend.dev>';
  if (!recipient || !apiKey) {
    throw new RequestError(503, 'Email recovery is not configured yet. Contact the store owner for a recovery code.');
  }
  if (requestedEmail !== recipient) return;

  const recovery = await issueAdminRecovery(db);
  if (!recovery) return;

  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'admin-recovery/' + recovery.hash
      },
      body: JSON.stringify({
        from: sender,
        to: [recipient],
        subject: 'Bhagwati Publications admin recovery code',
        text: 'Your one-time admin recovery code is:\n\n' + recovery.code +
          '\n\nPaste it into Forgot password on the Bhagwati Publications store. It expires in 30 minutes. If you did not request this code, you can ignore this email.'
      }),
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    // Delivery may have succeeded. Keep the code valid for the recipient.
    console.error('Admin recovery email delivery could not be confirmed.');
    return;
  }
  if (!response.ok) {
    await db.query('DELETE FROM admin_recovery WHERE singleton = TRUE AND token_hash = $1', [recovery.hash]);
    console.error('Admin recovery email rejected by provider:', response.status);
  }
}

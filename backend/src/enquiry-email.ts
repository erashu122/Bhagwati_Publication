import type { Enquiry, EnquiryEmailStatus, EnquirySettings } from '../../shared/store.ts';
import type { DatabaseExecutor } from './database-driver.ts';
import { RequestError } from './validation.ts';

export const enquiryFields = 'id, full_name AS "fullName", email, message, created_at AS "createdAt", email_status AS "emailStatus", bulk_details AS "bulkDetails"';

export async function enquirySettings(db: DatabaseExecutor): Promise<EnquirySettings> {
  const { rows: [settings] } = await db.query<{ recipient: string }>('SELECT recipient FROM enquiry_settings WHERE singleton = TRUE');
  const recipient = settings?.recipient ?? (process.env.CONTACT_EMAIL?.trim() || process.env.ADMIN_RECOVERY_EMAIL?.trim() || '');
  return { recipient, mailConfigured: Boolean(recipient && process.env.RESEND_API_KEY?.trim()) };
}

export async function sendEnquiryEmail(db: DatabaseExecutor, id: string) {
  const { rows: [enquiry] } = await db.query<Enquiry>(`
    UPDATE enquiries SET email_status = 'unconfirmed'
    WHERE id = $1 AND (email_status IS NULL OR email_status = 'failed')
    RETURNING ${enquiryFields}
  `, [id]);
  if (!enquiry) throw new RequestError(409, 'This enquiry is no longer available to send. Refresh the list.');

  const { recipient } = await enquirySettings(db);
  const apiKey = process.env.RESEND_API_KEY?.trim();
  let status: EnquiryEmailStatus = 'failed';
  if (apiKey && recipient) {
    const sender = process.env.CONTACT_EMAIL_FROM?.trim() || process.env.ADMIN_RECOVERY_FROM?.trim()
      || 'Bhagwati Publication <onboarding@resend.dev>';
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: sender,
          to: [recipient],
          reply_to: enquiry.email,
          subject: enquiry.bulkDetails ? 'Bulk order enquiry · Bhagwati Publication' : 'New contact enquiry · Bhagwati Publication',
          text: `Name: ${enquiry.fullName}\nEmail: ${enquiry.email}\n` +
            (enquiry.bulkDetails ? `Quantity: ${enquiry.bulkDetails.quantity}\nDelivery city: ${enquiry.bulkDetails.city}\nNeeded by: ${enquiry.bulkDetails.neededBy ?? 'Flexible'}\n` : '') +
            '\n' + enquiry.message
        }),
        signal: AbortSignal.timeout(7000)
      });
      if (response.ok) {
        status = 'accepted';
      } else {
        if (response.status >= 500 || response.status === 408 || response.status === 409) status = 'unconfirmed';
        console.warn('Contact email provider response:', response.status);
      }
    } catch {
      status = 'unconfirmed';
      console.warn('Contact email result could not be confirmed.');
    }
  }

  await db.query('UPDATE enquiries SET email_status = $2 WHERE id = $1', [id, status]);
  return status;
}

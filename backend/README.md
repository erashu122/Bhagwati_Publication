# Store API

The TypeScript Express server uses node-postgres when `DATABASE_URL` is set. When that setting is absent, it uses PGlite. Both drivers use the same parameterized queries and startup migrations.

- `src/server.ts` serves the storefront, manages sessions, and provides the account, orders, publisher and enquiry endpoints.
- `src/database.ts` creates the PostgreSQL tables and indexes.
- `src/catalog-migration.ts` installs and seeds the catalog, categories, cover storage and editable store content in a single migration.
- `src/catalog.ts` serves the public catalog and protects catalog changes with publisher access and per-record revision checks.
- `src/security.ts` hashes passwords with scrypt and hashes session tokens before storing them.
- `src/validation.ts` validates incoming fields, cart items and addresses.
- `src/operator.ts` grants the publisher role to an existing verified account from the local terminal.

The API uses a same-origin HTTP-only session cookie. Mutations require a custom request header and JSON. Account, order and publisher endpoints check access on the server. Order creation uses a transaction and a unique customer/request key. Checkout compares the customer’s quote with current database prices and availability before writing the order snapshot. Confirming and cancelling an order updates its stock reservations in the same transaction as the status change.

Copy `.env.example` to `.env` to override defaults. The default PGlite directory is `.data/store`, relative to the backend folder. Use one app process per PGlite data directory. Stop the app before backing up the embedded database or running the publisher access command against it. Keep database contents and environment overrides outside version control.

Use HTTPS and `SECURE_COOKIES=1` before exposing accounts beyond local development. Set `TRUST_PROXY=1` only when the app is behind exactly one trusted reverse proxy that sanitizes forwarding headers. Bind the process locally unless the hosting arrangement requires another interface.

To recover the `admin` sign-in, point the operator command at the store's database and run `npm run operator -- --issue-admin-recovery`. Enter the code in **Forgot password?** on the same store. It expires after 30 minutes, replaces any previous code, and can be used once. Setting the new password signs the admin out of existing sessions.

To enable **Email me a code**, set `ADMIN_RECOVERY_EMAIL` to the owner's address and `RESEND_API_KEY` to a sending key. Set `ADMIN_RECOVERY_FROM` to a verified sender if sending outside the Resend account's own address. The default Resend test sender can send only to the address registered with Resend. Keep these settings in the server environment.

### Recover the live admin without email

Open the SQL editor for the Neon database used by the production Vercel deployment. Turn off **Read-only** for this query and run it once.

```sql
WITH new_code AS MATERIALIZED (
  SELECT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') AS code
), saved AS (
  INSERT INTO public.admin_recovery (singleton, token_hash, expires_at)
  SELECT TRUE, encode(sha256(convert_to(code, 'UTF8')), 'hex'), now() + interval '30 minutes'
  FROM new_code
  ON CONFLICT (singleton) DO UPDATE
  SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at
  RETURNING singleton
)
SELECT code AS recovery_code FROM new_code CROSS JOIN saved;
```

Copy the result directly into **Recovery code** on the live **Forgot password?** page. Set a new password of at least 12 characters, then sign in as `admin`. The database stores a hash of the password. Treat the one-time recovery code like a password.

### Customer dashboard

Customers can edit their mobile number and default address, save a private UPI ID, and manage their wishlist and notifications. The admin dashboard can publish store announcements and create or deactivate percentage coupons. Active coupons are available to all signed-in customers. Checkout applies one coupon to the book subtotal and records the discount on the order. Shipping and tax remain subject to confirmation. Online payment collection requires a separate payment integration.

### Contact inbox

The contact form saves each message in **Admin → Enquiries** and sends it using `RESEND_API_KEY`. Set the initial inbox with `CONTACT_EMAIL` or reuse `ADMIN_RECOVERY_EMAIL`. Change the inbox from **Contact inbox → Save recipient**. This setting applies to future messages and email retries. The visitor's email is the reply address.

Set `CONTACT_EMAIL_FROM` to a sender on a domain you verified in Resend to deliver to any inbox. If omitted, contact uses `ADMIN_RECOVERY_FROM` or Resend's test sender. The test sender can send only to the email on the Resend account. Failed sends stay visible in Enquiries, where an admin can retry them. If the provider's response is unconfirmed, check the inbox or the provider's logs before sending manually.

## Connect to PostgreSQL with pgAdmin

1. Connect to the existing local PostgreSQL server in pgAdmin. Under **Login/Group Roles**, create `bhagwati_app`. Set a password on **Definition** and turn on **Can login?** under **Privileges**. Leave the cluster-wide admin privileges off.
2. Under **Databases**, create an empty database named `bhagwati_publication` and select `bhagwati_app` as its owner.
3. Create `backend/.env` and set the following line. Replace the placeholder with the password for the new role. URL-encode characters such as `@` and `#` in the password before putting it in the URL.

   ```dotenv
   DATABASE_URL=postgresql://bhagwati_app:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5432/bhagwati_publication
   ```

4. Stop the running store so the embedded data stays consistent during the copy. From the project root, run the commands in this order.

   ```powershell
   npm run db:check
   npm run db:import
   npm start
   ```

   The import creates the schema and copies the catalog, covers, portrait, store copy, accounts, sessions, orders, enquiries and available dashboard data in one PostgreSQL transaction. It requires an empty target and leaves the source data intact. For a fresh store with the default catalog, skip the import and start the app after the connection check.

To inspect the resulting tables in pgAdmin, refresh **Databases → bhagwati_publication → Schemas → public → Tables**. The PGlite directory remains available as a snapshot from before the move. Any edits made after switching belong to the PostgreSQL database.

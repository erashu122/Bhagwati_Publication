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

   The import creates the schema and copies the catalog, covers, portrait, store copy, accounts, sessions, orders and enquiries in one PostgreSQL transaction. It requires an empty target and leaves the source data intact. For a fresh store with the default catalog, skip the import and start the app after the connection check.

To inspect the resulting tables in pgAdmin, refresh **Databases → bhagwati_publication → Schemas → public → Tables**. The PGlite directory remains available as a snapshot from before the move. Any edits made after switching belong to the PostgreSQL database.

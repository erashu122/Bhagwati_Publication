# भगवती प्रकाशन · Bhagwati Publication

A books-only storefront with a React and TypeScript frontend and an Express API. The backend uses PostgreSQL when `DATABASE_URL` is configured and otherwise uses the local PGlite database.

## Start on Windows

```powershell
cd "D:\Bhagwati publication"
npm install
npm run dev
```

Open [the local store](http://127.0.0.1:5173/). In another checkout, run the npm commands from the folder containing this README. Node.js 22.18 or newer is required.

```powershell
npm run check
npm run build
npm start
```

The built store runs at [http://127.0.0.1:4000/](http://127.0.0.1:4000/). Express serves the frontend and the API on the same origin. `npm run preview` also serves the built application. Stop one process before starting the other against the same database.

To connect the existing PostgreSQL server and bring over the current books, images, accounts and orders, follow the [PostgreSQL setup and migration steps](backend/README.md#connect-to-postgresql-with-pgadmin).

## Customer flow

1. Browse, search and filter the catalog. Add books to the bag without an account.
2. Continue to checkout and register or sign in. The customer dashboard opens with a link to resume checkout, and the bag keeps its items.
3. Enter a delivery address for printed books or use a saved address. eBook-only requests skip the shipping form.
4. Submit an order request. The server validates the bag, calculates the estimated subtotal and records the order once, including when a request is retried.
5. View order history and status, edit your name, and add, update or remove your default address in the account dashboard.

## Admin dashboard

Register an account you control. Stop the running store, then grant publisher access locally. Replace the example address with the account you just created.

```powershell
npm run operator -- you@example.com
npm run dev
```

Sign in and open **Admin dashboard** from **My account**, or visit `/#/admin`.

- **Books** lets you add and edit titles, upload or replace covers, set prices and stock, feature titles and control which titles are visible. New titles start hidden until you choose to show them. Hiding a title removes it from the public catalog and preserves order history.
- **Overview** shows published titles, order requests awaiting confirmation, low stock and customer enquiries, with links to the relevant admin tools.
- **Author profile** lets you change the name, biography and portrait shown on the home and author pages and on linked book details. Upload a JPG, PNG or WebP up to 1 MB. New titles start with the profile name in the author field, which you can edit.
- **Categories** lets you add and rename categories, edit their descriptions and remove empty categories.
- **Store content** lets you edit the announcement, homepage copy, About and Contact copy, and store policies.
- **Orders** and **Enquiries** let you review requests, update fulfillment status and read customer messages. Confirming an order deducts tracked stock. Cancelling a confirmed order restores its tracked stock.

Grant access only to accounts you control or have verified. Uploaded covers can be JPG, PNG or WebP up to 1 MB.

## Data and fulfillment

The database lives in `backend/.data/store/` by default. It stores accounts, sessions, addresses, order history, enquiries, books, covers, categories and storefront text. The first startup with the catalog upgrade imports the original titles once. Stop the server before backing up or moving the database. The browser cart stores book IDs and quantities. Passwords are hashed, and the browser receives an HTTP-only session cookie.

The initial catalog uses illustrative covers and sample prices. Use the admin dashboard to update these values. Order requests preserve the titles, quantities and quoted prices accepted at checkout. The publisher confirms final charges and fulfillment. Public deployment needs HTTPS and a production review of account verification, recovery, policies and data handling. See [backend setup](backend/README.md) for server settings.

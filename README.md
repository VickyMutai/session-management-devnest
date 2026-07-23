# Session Manager

A lightweight Vercel-ready session management app built with plain HTML, CSS, JavaScript, and Vercel Functions.

## Features

- Public viewers read one shared session schedule
- Admin-only session create, update, toggle, and delete flows
- Search through shared sessions
- Periodic refresh so viewers see published changes
- Private Vercel Blob storage for the live session JSON
- Ready to deploy on Vercel

## Local preview

Serve the project from the repository root so `/api/*` routes are available on Vercel after deployment. Opening `app.html` directly from disk will not provide the shared backend.

## Deploy to Vercel

1. Push this folder to GitHub.
2. Import the repository in Vercel.
3. In Vercel Storage, create a private Blob store for this project.
4. Add an `ADMIN_SECRET` environment variable in Vercel Project Settings.
5. Vercel will add `BLOB_READ_WRITE_TOKEN` after the Blob store is connected.
6. Deploy.

## Notes

- `ADMIN_SECRET` is checked only on the server in `api/admin.js` and `api/sessions.js`.
- Shared session data is stored in `portal/sessions.json` inside Vercel Blob.
- If the Blob token is missing, the UI falls back to sample sessions and shows that setup is incomplete.

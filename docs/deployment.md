# Short-lived demo deployment

This guide describes the optional hosted demo. Local development remains `docker compose up --build`.

## Architecture

- Render runs the existing API and web Dockerfiles as separate free web services.
- Neon provides PostgreSQL; Render does not create a database for this Blueprint.
- The browser visits the Render web URL. Nginx proxies `/v1` and `/docs` to the API service.
- Render auto-deploy is disabled. Creating a GitHub release does not deploy anything. A person starts the `Deploy Render release` GitHub Actions workflow and selects its release tag and API, web, or both services.

## Initial Render setup

1. Push this repository to GitHub and create a Neon project in Singapore to match the Render services. Copy Neon’s direct PostgreSQL connection string with TLS required (`sslmode=require`).
2. In Render, create a Blueprint from the repository root. Render reads [`render.yaml`](../render.yaml) and creates `flowboard-demo-api` and `flowboard-demo-web`.
3. During initial Blueprint setup, provide the API `DATABASE_URL`, `WEB_ORIGIN`, and `SEED_PASSWORD` values. Use `https://flowboard-demo-web.onrender.com` for `WEB_ORIGIN`; after provisioning, confirm it matches the web service URL shown by Render and update it if Render assigned a different hostname.
4. Render generates `JWT_SECRET`. Keep `FLOWBOARD_DEMO_MODE=true` to seed the demo fixture and `COOKIE_SECURE=true` for HTTPS cookies. Do not put secrets in this repository.
5. After the first deploy, check the API `/health` route and open the web URL. The demo login password is the `SEED_PASSWORD` you supplied.

The API runs migrations before listening and applies the idempotent demo seed while demo mode is enabled. The seed marker means normal restarts do not overwrite reviewer edits. The Neon database is the persistent state; Render free service filesystems are not.

## Manual release deployment

1. Create a GitHub release with a tag such as `v0.2.0`. Creating the release does not trigger this workflow.
2. In the Render dashboard, copy each service’s secret deploy hook URL. Add them to GitHub repository **Settings → Secrets and variables → Actions** as `RENDER_API_DEPLOY_HOOK_URL` and `RENDER_WEB_DEPLOY_HOOK_URL`.
3. In GitHub **Actions → Deploy Render release → Run workflow**, enter the release tag and choose `api`, `web`, or `both`. The workflow resolves the tag to a commit and asks Render to deploy that exact commit for the selected service(s).

Use these headings in release notes so the deployment choice is obvious:

```text
API:
Web:
Shared contracts or database:
Recommended deploy: API / Web / Both
```

The workflow confirms that Render accepted the deploy request; check each service’s Render deploy page for build and startup completion. If a release includes a database migration that the new web build depends on, deploy the API first, wait for it to become healthy, then run the workflow again for the web service. Choosing `both` sends both deploy requests without waiting for the API deploy to finish.

## Local secrets

Compose passes `JWT_SECRET` from the untracked `.env` file when provided. The API uses that value first. When it is absent or empty, startup keeps the existing generated signing file and named volume behavior. Use at least 32 bytes for a supplied secret. `COOKIE_SECURE=false` keeps the local HTTP demo working; Render sets it to `true`.

## Cleanup

After the review, delete the two Render services and the Neon project if the demo data is no longer needed. Free Render services can sleep after inactivity, so the reviewer may see a cold-start delay.

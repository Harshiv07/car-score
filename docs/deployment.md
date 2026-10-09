# Deployment

- **Client**: static build (`client/dist`) — `vercel.json` is configured for
  Vercel (with an SPA rewrite that leaves `/api/*` alone). Set `VITE_API_URL`
  at build time to your API origin. Vercel redeploys on every push to `master`.
- **Server**: any Node host (Render, Railway, Fly.io). Set `MONGODB_URI`
  (MongoDB Atlas works) and optionally `PORT`. The crawler honors
  `HTTPS_PROXY` for hosts with egress proxies.

  **Render specifically**: `render.yaml` is only read when the service is
  *first* created from a Blueprint — later commits to it do **not**
  auto-update an already-existing service's dashboard settings. This
  particularly matters now: `render.yaml` deploys the API via the **Docker**
  runtime (`./Dockerfile`) instead of Render's native Node runtime, so a
  real, launchable Chromium is available for the browser-fallback paths (see
  the Chromium note above). Render does not convert an existing service's
  runtime type in place — a service created before this change needs to be
  **deleted and recreated from the Blueprint** (New → Blueprint → this repo)
  for the Docker runtime to take effect; a same-named service should get the
  same `*.onrender.com` URL back, but confirm it after. `MONGODB_URI` is
  deliberately `sync: false` (not stored in the YAML) and will need to be
  re-entered in the new service's Environment tab.

  **CORS**: the API only answers browsers on an allowlist
  (`DEFAULT_ORIGINS` in `server/src/index.ts`: `https://carscores.vercel.app`,
  the earlier `cargrade.vercel.app`, this project's Vercel previews, and
  localhost). If you set `CORS_ORIGIN` in the Render Environment tab it
  **replaces** those defaults entirely, so include
  `https://carscores.vercel.app` in it (comma-separated) or the live site's
  API calls will be blocked.

## Keeping the free-tier API awake

Render's free tier sleeps an idle instance, and waking it takes 30–60 s.
`.github/workflows/keep-warm.yml` pings `/healthz` on a timer to avoid that. It
holds its runner and pings every few minutes for most of an hour per run,
because GitHub throttles high-frequency cron triggers — measured over the first
85 runs, the median gap between runs that actually fired was ~103 minutes, and
none came in under Render's ~15-minute idle window, so a single ping per trigger
never helped. It never fails the run on a non-200 (that would train everyone to
ignore a red cron), and it's guarded to the upstream repo so forks don't wake
someone else's API. It remains a workaround for the hosting tier: a plan that
doesn't sleep, or an external pinger that honours a 5-minute schedule, is the
real fix.

## CI

`.github/workflows/ci.yml` runs server typecheck + tests and the server and
client builds on every push and PR to `master`; CodeQL runs alongside it.

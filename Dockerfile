# Builds the CarScore API with a real, launchable Chromium — the previous
# render.yaml used Render's native Node runtime, which can download the
# Playwright browser *binary* at build time but has no apt/root access to
# install its shared-library dependencies (libnss3, libatk, libgbm, ...), so
# the browser was present on disk but failed to launch at runtime ("Chromium
# is not installed (or can't launch)" — confirmed live in production logs,
# even with `playwright install --with-deps` in the old buildCommand). A
# Docker build runs as root, so the same install command actually succeeds
# here, and the whole image (build output + browser + its libraries) is one
# immutable filesystem that carries to runtime as-is — no separate
# build-vs-runtime cache-path workaround needed either.
FROM node:20-slim

WORKDIR /app

# Install dependencies first (better layer caching — this only re-runs when a
# package.json/lockfile changes, not on every source edit). npm workspaces
# needs every workspace's package.json present to resolve the graph, even
# though only the server workspace is actually built/run below.
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

# Now bring in the rest of the source and build.
COPY . .

RUN npx playwright install --with-deps chromium

RUN npm run build -w server

ENV NODE_ENV=production
EXPOSE 4000
CMD ["npm", "run", "start", "-w", "server"]

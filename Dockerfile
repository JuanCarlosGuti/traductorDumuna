# syntax=docker/dockerfile:1
#
# corpus-damana in a single image, with the same pattern as cesar-travel:
# monorepo with npm workspaces and ONE package-lock at the root, so
# everything is installed and built from the root (installing per subfolder leaves
# node_modules where the runtime cannot find them; it is the same trap already
# written down in render.yaml). NestJS serves the Angular build from
# backend/public, so there is one process, one port and one origin.
#
# The SQLite database is BAKED into the image: `npm run importar` regenerates it from
# the CSVs and Excel files in /datos during the build stage. What the app writes at
# runtime (pending items, validated ones, translations, flashcard progress) lives in
# that same database and is lost on every deployment, just like on Render today.

FROM node:24-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 is a native module: if there is no prebuilt binary for this
# Node version, it falls back to node-gyp and needs these three things. Build only.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Manifests first, code afterwards: the `npm ci` layer is reused on
# every deployment that does not touch the dependencies.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
# No NODE_ENV=production here: with it `npm ci` would skip the devDependencies
# (@nestjs/cli, ng, ts-node) and there would be nothing to build or import with.
RUN npm ci

COPY . .

# 1) `npm run build`: Angular → backend/public, Nest → backend/dist.
# 2) `npm run importar`: regenerates datos/corpus.db from datos/ (CSVs, rules and
#    elicitation batches). It goes BEFORE the prune because it uses ts-node.
# 3) `npm prune --omit=dev` leaves only production dependencies (before the rm:
#    npm needs to see the workspaces in order to prune them).
# 4) Whatever the runtime does not read is deleted: sources, tests, and from datos/ everything except
#    the database (the CSVs and Excel files are already inside corpus.db).
RUN npm run build \
 && npm run importar \
 && test -s datos/corpus.db \
 && npm prune --omit=dev \
 && find datos -type f ! -name 'corpus.db*' -delete \
 && rm -rf frontend backend/src backend/test .angular .git e2e evaluaciones \
 && rm -rf config .kamal Dockerfile .dockerignore playwright.config.ts render.yaml ./*.md

FROM node:24-bookworm-slim AS runtime

# NODE_ENV only in the final image. auth.config.ts reads it to require
# AUTH_USUARIO and AUTH_PASSWORD: without them startup fails on purpose.
ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app
# Everything owned by `node`: SQLite needs to write to datos/ (WAL mode and the
# runtime tables), and the process does not run as root.
COPY --from=build --chown=node:node /app ./

USER node
# cwd in backend/ so that '../datos' resolves, same as `npm run start:prod`.
WORKDIR /app/backend
EXPOSE 3000
CMD ["node", "dist/main.js"]

# syntax=docker/dockerfile:1
#
# corpus-damana en una sola imagen, con el mismo patrón que cesar-travel:
# monorepo con workspaces de npm y UN solo package-lock en la raíz, así que
# todo se instala y se construye desde la raíz (instalar por subcarpeta deja
# node_modules donde el runtime no los encuentra; es la misma trampa que ya
# estaba escrita en render.yaml). NestJS sirve el build de Angular desde
# backend/public, así que hay un proceso, un puerto y un origen.
#
# La base SQLite se HORNEA en la imagen: `npm run importar` la regenera desde
# los CSV y los Excel de /datos en la etapa de build. Lo que la app escribe en
# runtime (pendientes, validadas, traducciones, progreso de flashcards) vive en
# esa misma base y se pierde con cada despliegue, igual que hoy en Render.

FROM node:24-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 es un módulo nativo: si no hay binario precompilado para esta
# versión de Node, cae a node-gyp y necesita estas tres cosas. Solo en build.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Manifiestos primero, código después: la capa de `npm ci` se reaprovecha en
# cada despliegue que no toque las dependencias.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
# Sin NODE_ENV=production aquí: con él `npm ci` se saltaría las devDependencies
# (@nestjs/cli, ng, ts-node) y no habría con qué construir ni importar.
RUN npm ci

COPY . .

# 1) `npm run build`: Angular → backend/public, Nest → backend/dist.
# 2) `npm run importar`: regenera datos/corpus.db desde datos/ (CSV, reglas y
#    lotes de elicitación). Va ANTES del prune porque usa ts-node.
# 3) `npm prune --omit=dev` deja solo dependencias de producción (antes del rm:
#    npm necesita ver los workspaces para podarlos).
# 4) Se borra lo que el runtime no lee: fuentes, tests, y de datos/ todo menos
#    la base (los CSV y Excel ya están dentro de corpus.db).
RUN npm run build \
 && npm run importar \
 && test -s datos/corpus.db \
 && npm prune --omit=dev \
 && find datos -type f ! -name 'corpus.db*' -delete \
 && rm -rf frontend backend/src backend/test .angular .git e2e evaluaciones \
 && rm -rf config .kamal Dockerfile .dockerignore playwright.config.ts render.yaml ./*.md

FROM node:24-bookworm-slim AS runtime

# NODE_ENV solo en la imagen final. auth.config.ts lo lee para exigir
# AUTH_USUARIO y AUTH_PASSWORD: sin ellas el arranque falla a propósito.
ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app
# Todo con dueño `node`: SQLite necesita escribir en datos/ (modo WAL y las
# tablas de runtime), y el proceso no corre como root.
COPY --from=build --chown=node:node /app ./

USER node
# cwd en backend/ para que '../datos' resuelva, igual que `npm run start:prod`.
WORKDIR /app/backend
EXPOSE 3000
CMD ["node", "dist/main.js"]

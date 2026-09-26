# The companion app: the server (app/packages/server) with the rules data it loads at start,
# and the web client it serves. Node runs the server's TypeScript directly; only the web
# client is built. Deployed by Fly (fly.toml).

# ---- build the web client ----
FROM node:22-slim AS web
RUN npm install -g pnpm@12.3.4
WORKDIR /repo
COPY app/package.json app/pnpm-lock.yaml app/pnpm-workspace.yaml app/tsconfig.base.json app/
COPY app/packages/engine/package.json app/packages/engine/
COPY app/packages/record/package.json app/packages/record/
COPY app/packages/web/package.json app/packages/web/
RUN cd app && pnpm install --frozen-lockfile --filter "@gradebreaker/web..."
COPY app/packages/engine app/packages/engine
COPY app/packages/record app/packages/record
COPY app/packages/web app/packages/web
RUN cd app && pnpm --filter @gradebreaker/web build

# ---- the server ----
FROM node:22-slim
RUN npm install -g pnpm@12.3.4
WORKDIR /repo
COPY app/package.json app/pnpm-lock.yaml app/pnpm-workspace.yaml app/tsconfig.base.json app/
COPY app/packages/engine/package.json app/packages/engine/
COPY app/packages/record/package.json app/packages/record/
COPY app/packages/server/package.json app/packages/server/
RUN cd app && pnpm install --frozen-lockfile --prod --filter "@gradebreaker/server..."

COPY rules rules
COPY app/packages/engine app/packages/engine
COPY app/packages/record app/packages/record
COPY app/packages/server app/packages/server
COPY --from=web /repo/app/packages/web/dist app/packages/web/dist

WORKDIR /repo/app/packages/server
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
CMD ["node", "src/main.ts"]

# The companion app's server (app/packages/server), with the rules data it loads at start.
# Node runs the TypeScript directly, so nothing is compiled. Built by Fly (fly.toml).
FROM node:22-slim

RUN npm install -g pnpm@12.3.4

WORKDIR /repo
COPY app/package.json app/pnpm-lock.yaml app/pnpm-workspace.yaml app/tsconfig.base.json app/
COPY app/packages/engine/package.json app/packages/engine/
COPY app/packages/record/package.json app/packages/record/
COPY app/packages/server/package.json app/packages/server/
RUN cd app && pnpm install --frozen-lockfile --prod --filter "@gradebreaker/server..."

COPY rules rules
COPY app/packages app/packages

WORKDIR /repo/app/packages/server
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
CMD ["node", "src/main.ts"]

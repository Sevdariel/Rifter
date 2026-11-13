FROM node:26.8.1-bookworm-slim AS build
RUN npm i -g pnpm@12.15.0
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/analysis/package.json packages/analysis/
RUN pnpm install --frozen-lockfile --filter @rifter/api...

COPY apps/api apps/api
COPY packages/analysis packages/analysis
# Topological order: the api's workspace dep must be built first.
RUN pnpm -C packages/analysis build && pnpm -C apps/api build && pnpm --filter @rifter/api deploy --prod /prod/api

FROM node:26.8.1-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /prod/api ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]

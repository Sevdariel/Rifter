FROM node:26.8.1-bookworm-slim AS build
RUN npm i -g pnpm@12.15.0
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @rifter/web...

COPY apps/web apps/web
RUN pnpm -C apps/web build

FROM nginx:1.29-alpine
COPY --from=build /app/apps/web/dist/web/browser /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

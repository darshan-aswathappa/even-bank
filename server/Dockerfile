# Multi-stage build. Runtime runs as non-root with prod-only deps.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Keep migrations + drizzle config available for the release/migrate step.
COPY --from=build /app/migrations ./migrations
COPY drizzle.config.ts ./drizzle.config.ts
USER node
EXPOSE 8787
# Apply migrations (idempotent — drizzle skips applied ones) then start the server.
# exec-form sh -c avoids any platform-level command-string parsing ambiguity.
CMD ["sh", "-c", "node dist/migrate.js && node dist/index.js"]

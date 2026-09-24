# Standalone worker/admin image. Pin the built image digest at deployment.
FROM node:24.21.0-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
# tsx is locked in devDependencies and deliberately retained for the TS entrypoints.
# No Next build, browsers, or generated customer material is needed by this image.
RUN npm ci --include=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

FROM node:24.21.0-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY lib ./lib
COPY services/evals-worker ./services/evals-worker
USER node
CMD ["sh", "services/evals-worker/start.sh"]
# Admin CLI override:
# node --conditions=react-server --import tsx services/evals-worker/admin.ts <command>

FROM node:20-bookworm-slim AS base

# Disable npm update notifications and configure Node.js defaults
ENV npm_config_update_notifier=false \
    NODE_ENV=production \
    CI=true \
    PORT=3000

WORKDIR /app

FROM base AS deps

# Enable installing dev dependencies for the build
ENV NODE_ENV=development

COPY package.json package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci

FROM deps AS build

COPY . .

RUN npm run build

FROM base AS runtime

# Copy only the files needed for production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json

RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next

EXPOSE 3000

CMD ["npm", "run", "start"]


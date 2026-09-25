FROM node:24.21.0-bookworm-slim AS base

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

RUN npm ci

FROM deps AS build

ARG NEXT_PUBLIC_APP_URL

ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

ENV NODE_ENV=production

COPY . .

RUN npm run build

FROM base AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*

# Copy only the files needed for production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json

RUN npm ci --omit=dev

COPY --from=build /app/public ./public
COPY --from=build /app/content ./content
COPY --from=build /app/.next ./.next
COPY --from=build /app/scripts/check-sentry-config.mjs ./scripts/check-sentry-config.mjs

EXPOSE 3000

CMD ["npm", "run", "start"]

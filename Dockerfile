# Production image for Cloud Run (docs/deployment.md). Multi-stage:
# dependencies → build → minimal runtime with Next's standalone output.
#
# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time —
# they must be passed as build args (the deploy workflow does), not set on
# the running container. Server-only secrets are runtime env on Cloud Run.

FROM node:24.21.0-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24.21.0-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_TELEMETRY_DISABLED=1 \
    # Build-time placeholders: every page is dynamic, so no query runs during
    # `next build`, but the modules' import-time env guards must pass.
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    SUPABASE_SECRET_KEY=build-placeholder
RUN npm run build

FROM node:24.21.0-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
# Cloud Run injects PORT; Next's standalone server honors it.
EXPOSE 8080
CMD ["node", "server.js"]

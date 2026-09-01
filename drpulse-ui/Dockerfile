# ── Build stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite bakes these in at BUILD time, not runtime — they must be present
# here as build args, not just in a .env file mounted at container start.
ARG VITE_SRT_URL
ARG VITE_SUBTITLE_URL
ENV VITE_SRT_URL=$VITE_SRT_URL
ENV VITE_SUBTITLE_URL=$VITE_SUBTITLE_URL

RUN npm run build

# ── Serve stage ─────────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

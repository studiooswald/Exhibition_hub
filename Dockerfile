# Build-Stufe: hier dürfen die Compiler liegen, die better-sqlite3 braucht,
# falls es für die Architektur des Servers kein fertiges Binary gibt.
FROM node:22-slim AS build

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Laufzeit-Stufe: nur Node, Bot und fertige Abhängigkeiten
FROM node:22-slim

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY package.json healthcheck.js ./
COPY src ./src

ENV NODE_ENV=production
ENV DATA_DIR=/data

# Der Bot holt seine Nachrichten selbst ab (Polling) – es gibt keinen Port,
# keine Domain und kein Zertifikat.
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "healthcheck.js"]

CMD ["node", "src/index.js"]

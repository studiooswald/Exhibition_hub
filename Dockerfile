FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV DATA_DIR=/data
EXPOSE 3000

CMD ["node", "src/server.js"]

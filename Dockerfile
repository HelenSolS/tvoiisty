# Backend API (Express): server.ts + backend/
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
# Запуск через tsx (server.ts в корне, backend/ — модули)
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npx", "tsx", "server.ts"]

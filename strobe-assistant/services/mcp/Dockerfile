FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY src ./src
COPY services ./services

ENV NODE_ENV=production

EXPOSE 8000

CMD ["node", "services/mcp/src/server.mjs"]
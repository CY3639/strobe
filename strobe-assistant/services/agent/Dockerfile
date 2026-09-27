FROM node:22-alpine
WORKDIR /app
COPY services/agent/package.json services/agent/package-lock.json ./
RUN npm ci --omit=dev
COPY src/shared ./src/shared
COPY services/agent/src ./services/agent/src
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
EXPOSE 3000
USER node
CMD ["node", "services/agent/src/agent.mjs"]
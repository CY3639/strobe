FROM node:22-alpine

WORKDIR /app

# Dependencies first: this layer is cached until package files change.
COPY services/mcp/package.json services/mcp/package-lock.json ./
RUN npm ci --omit=dev

# Shared AWS code + the server itself, in the same relative layout as
# the repo, so "../../../src/shared/..." imports still resolve.
COPY src/shared ./src/shared
COPY services/mcp/src ./services/mcp/src

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

EXPOSE 3000

# Don't run as root inside the container.
USER node

CMD ["node", "services/mcp/src/server.mjs"]
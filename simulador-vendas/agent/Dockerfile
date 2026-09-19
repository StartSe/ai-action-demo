FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/app/data
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN mkdir -p /app/data && chown node:node /app/data
USER node
CMD ["npm", "run", "agent:start"]

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production=false
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache curl
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
RUN mkdir -p /app/data
EXPOSE 3001
CMD ["node", "dist/index.js"]

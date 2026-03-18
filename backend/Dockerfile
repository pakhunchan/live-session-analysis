FROM --platform=linux/amd64 node:20-slim AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci
COPY backend/ .
COPY shared/ /shared

FROM --platform=linux/amd64 node:20-slim
WORKDIR /app
COPY --from=build /app /app
COPY --from=build /shared /shared
EXPOSE 3001
CMD ["npx", "tsx", "server/index.ts"]

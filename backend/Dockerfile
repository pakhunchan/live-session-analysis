FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .

FROM node:20-slim
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3001
CMD ["npx", "tsx", "server/index.ts"]

FROM node:20-slim AS build
WORKDIR /src

COPY notifications/package.json notifications/package-lock.json* ./
RUN npm install

COPY notifications/tsconfig.json ./
COPY notifications/src ./src
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /src/package.json ./
RUN npm install --omit=dev

COPY --from=build /src/dist ./dist

ENTRYPOINT ["node", "dist/index.js"]

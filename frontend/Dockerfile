FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
# Relative paths - nginx serves frontend + proxies /api and /hubs on the same
# origin in production, so no absolute URL (and no CORS) is needed at all.
ARG VITE_API_URL=/api
ARG VITE_HUB_URL=/hubs/match
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_HUB_URL=$VITE_HUB_URL
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

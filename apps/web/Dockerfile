FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN yarn install --frozen-lockfile || yarn install
COPY . .
RUN yarn workspace @flowboard/web build
FROM nginx:1.27-alpine
ENV NGINX_ENVSUBST_FILTER=^(API_UPSTREAM)$
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

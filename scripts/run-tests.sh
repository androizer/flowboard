#!/bin/sh
set -eu
node scripts/local-web-proxy.js &
node scripts/wait-for-http.js "${API_URL:-http://api:3000}/health"
node scripts/wait-for-http.js "${WEB_URL:-http://web:8080}/"
yarn test:api
yarn test:web

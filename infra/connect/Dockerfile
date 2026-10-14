# connect.caudals.com: services/connect/dist served read-only by nginx.
# Build context: a release directory holding this file, nginx.conf,
# headers.conf and dist/ (see scripts/deploy-connect.sh).
FROM nginxinc/nginx-unprivileged:1.30.5-alpine-slim
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY headers.conf /etc/nginx/snippets/connect-headers.conf
COPY dist/ /usr/share/nginx/html/
EXPOSE 8080

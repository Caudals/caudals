FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
WORKDIR /app
COPY --chown=node:node core.mjs server.mjs package.json ./
USER node
ENV NODE_ENV=production PORT=8091
EXPOSE 8091
HEALTHCHECK --interval=20s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8091/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server.mjs"]

FROM ghcr.io/warmbly/warmbly/web@sha256:baf40806ed3719b533c69cc7cb0a4ff352fc9239a79e26777e25fe360de63f8a
COPY dist/ /usr/share/nginx/html/
RUN chmod -R a+rX /usr/share/nginx/html

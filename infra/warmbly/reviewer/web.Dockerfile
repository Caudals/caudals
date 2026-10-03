FROM ghcr.io/warmbly/warmbly/web@sha256:ece8d01535521fd758174e58bb127351cd804a61f2edb2cbccacad8af615e8c3
COPY dist/ /usr/share/nginx/html/
RUN chmod -R a+rX /usr/share/nginx/html

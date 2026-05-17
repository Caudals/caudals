FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    HOME=/opt/dagster \
    DAGSTER_HOME=/opt/dagster/dagster_home \
    DAGSTER_LOCAL_ARTIFACT_STORAGE_DIR=/opt/dagster/storage \
    DAGSTER_COMPUTE_LOG_DIR=/opt/dagster/storage/compute_logs

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

RUN addgroup --system dagster \
  && adduser --system --ingroup dagster dagster \
  && mkdir -p "$DAGSTER_HOME" /opt/dagster/app /opt/dagster/storage \
  && chown -R dagster:dagster /opt/dagster

COPY dagster.yaml workspace.yaml "$DAGSTER_HOME"/
COPY definitions.py /opt/dagster/app/definitions.py
COPY caudals_ops /opt/dagster/app/caudals_ops
COPY entrypoint.sh /usr/local/bin/caudals-dagster-entrypoint

RUN chmod 0755 /usr/local/bin/caudals-dagster-entrypoint \
  && chown -R dagster:dagster "$DAGSTER_HOME" /opt/dagster/app

WORKDIR /opt/dagster/app
USER dagster

EXPOSE 3000 4000

ENTRYPOINT ["caudals-dagster-entrypoint"]
CMD ["dagster-webserver", "-h", "0.0.0.0", "-p", "3000", "-w", "/opt/dagster/dagster_home/workspace.yaml"]

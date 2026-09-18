#!/bin/sh
set -eu
exec node --conditions=react-server --import tsx services/evals-worker/main.ts

#!/usr/bin/env bash

set -a
source services.envar

docker-compose build
docker-compose -f docker-compose.yml up -d
# Stage 0, "build-stage", based on Bun, to build and compile the frontend
ARG NGINX_BASE_IMAGE=nginx:1
FROM oven/bun:1 AS build-stage

WORKDIR /app

COPY package.json bun.lock /app/

COPY frontend/package.json /app/frontend/

WORKDIR /app/frontend

RUN bun install

COPY ./frontend /app/frontend

ARG VITE_API_URL
ARG VITE_RAY_DASHBOARD_URL
ARG VITE_RAY_ADDRESS
ARG VITE_PROMETHEUS_URL
ARG VITE_GRAFANA_URL
ARG VITE_MLFLOW_URL
ARG VITE_OTEL_ENDPOINT

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_RAY_DASHBOARD_URL=${VITE_RAY_DASHBOARD_URL}
ENV VITE_RAY_ADDRESS=${VITE_RAY_ADDRESS}
ENV VITE_PROMETHEUS_URL=${VITE_PROMETHEUS_URL}
ENV VITE_GRAFANA_URL=${VITE_GRAFANA_URL}
ENV VITE_MLFLOW_URL=${VITE_MLFLOW_URL}
ENV VITE_OTEL_ENDPOINT=${VITE_OTEL_ENDPOINT}

RUN bun run build


# Stage 1, based on Nginx, to have only the compiled app, ready for production with Nginx
FROM ${NGINX_BASE_IMAGE}

COPY --from=build-stage /app/frontend/dist/ /usr/share/nginx/html

COPY ./frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY ./frontend/nginx-backend-not-found.conf /etc/nginx/extra-conf.d/backend-not-found.conf

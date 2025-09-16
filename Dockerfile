# syntax=docker/dockerfile:1
ARG NODE_VERSION=18-alpine
ARG FRPC_IMAGE=snowdreamtech/frpc:alpine

FROM ${FRPC_IMAGE} AS frpc

FROM node:${NODE_VERSION} AS app

WORKDIR /app

COPY --from=frpc /usr/bin/frpc /usr/local/bin/frpc

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public
COPY data ./data
COPY README.md ./

ENV NODE_ENV=production \
    PORT=4000 \
    FRPC_EXEC_PATH=/usr/local/bin/frpc

EXPOSE 4000
VOLUME /app/data

CMD ["npm", "start"]

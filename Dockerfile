FROM node:22-alpine AS client-builder

WORKDIR /app/client

COPY client/package.json client/package-lock.json ./
RUN for i in 1 2 3; do npm ci --no-audit --no-fund && break || sleep 15; done

COPY client/ .
RUN npm run build


FROM node:22-alpine AS server-builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN for i in 1 2 3; do npm ci --omit=dev --no-audit --no-fund && break || sleep 15; done


FROM node:22-alpine

ARG VERSION
WORKDIR /app

COPY package.json ./
RUN if [ -n "$VERSION" ]; then \
        apk add --no-cache jq && jq --arg v "$VERSION" '.version = $v' package.json > tmp.json && mv tmp.json package.json; \
    fi

COPY --from=server-builder /app/node_modules ./node_modules
COPY server/ server/
COPY --from=client-builder /app/client/dist ./client/dist

ENV NODE_ENV=production \
    TUNLIT_LISTEN=0.0.0.0 \
    TUNLIT_PORT=8080 \
    TUNLIT_CONFIG=/app/data/config.yml \
    TUNLIT_DATA_DIR=/app/data

VOLUME ["/app/data"]
EXPOSE 8080 80 443

CMD ["node", "server/index.js"]

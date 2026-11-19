# Build a partir da raiz do repositório:  docker build -f area3-mvp-iot/api/Dockerfile .
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /repo

# 1) Dependências (camada cacheada enquanto os package.json não mudarem)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY area3-mvp-iot/api/package.json area3-mvp-iot/api/
COPY area1-ia/triagem/package.json area1-ia/triagem/
RUN pnpm install --frozen-lockfile --filter @elo/api...

# 2) Código e build
COPY area1-ia/triagem area1-ia/triagem
COPY area3-mvp-iot/api area3-mvp-iot/api
RUN pnpm --filter @elo/api... build

WORKDIR /repo/area3-mvp-iot/api
ENV NODE_ENV=production
EXPOSE 3333
ENTRYPOINT ["sh", "docker-entrypoint.sh"]

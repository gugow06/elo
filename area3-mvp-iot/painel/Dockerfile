# Build a partir da raiz do repositório:  docker build -f area3-mvp-iot/painel/Dockerfile .
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY area3-mvp-iot/painel/package.json area3-mvp-iot/painel/
RUN pnpm install --frozen-lockfile --filter @elo/painel
COPY area3-mvp-iot/painel area3-mvp-iot/painel
# A URL da API vai para o bundle do navegador no momento do build
ARG NEXT_PUBLIC_API_URL=http://localhost:3333
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @elo/painel build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /repo/area3-mvp-iot/painel/.next/standalone ./
COPY --from=build /repo/area3-mvp-iot/painel/.next/static ./area3-mvp-iot/painel/.next/static
COPY --from=build /repo/area3-mvp-iot/painel/public ./area3-mvp-iot/painel/public
EXPOSE 3000
CMD ["node", "area3-mvp-iot/painel/server.js"]

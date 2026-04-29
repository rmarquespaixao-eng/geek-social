FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
# --ignore-scripts: o postinstall (fumadocs-mdx) precisa do content/ que vem no COPY . . abaixo
RUN npm install --no-audit --no-fund --ignore-scripts
COPY . .
RUN npx fumadocs-mdx
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/.source ./.source
COPY --from=builder /app/public ./public
COPY --from=builder /app/content ./content
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/source.config.ts ./
COPY --from=builder /app/postcss.config.mjs ./
COPY --from=builder /app/tsconfig.json ./
EXPOSE 3030
CMD ["npm", "start"]

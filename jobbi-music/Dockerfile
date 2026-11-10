FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY index.html vite.config.js ./
COPY src ./src
# Vite copies public/tools into dist/tools for the production userscript URL.
COPY public ./public
RUN npm run build
RUN test -s dist/tools/jobbi-collection-export.user.js

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
USER node
EXPOSE 3131
CMD ["node", "server/index.js"]

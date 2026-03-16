FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --production=false

COPY . .
RUN npm run build
RUN npm prune --production

EXPOSE 34323 55443

ENTRYPOINT ["node", "dist/main.js"]

# The Playwright image already carries Chromium plus every system library it needs;
# installing browsers into a plain node image needs the same ~700MB anyway.
FROM mcr.microsoft.com/playwright:v1.50.0-noble AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.50.0-noble AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# The Agent SDK spawns the Claude Code CLI, which wants a writable home for its
# session state. The Playwright image's default user owns this path.
ENV HOME=/home/pwuser
USER pwuser

CMD ["node", "dist/index.js"]

# The Playwright image already carries Chromium plus every system library it needs;
# installing browsers into a plain node image needs the same ~700MB anyway.
#
# This tag MUST match the `playwright` version in package.json exactly, which is why
# that dependency is pinned rather than a caret range: the image ships the browser
# binaries for its own version, and a library that resolved even one minor ahead
# looks for a build directory that does not exist. Bump both together.
FROM mcr.microsoft.com/playwright:v1.62.1-noble AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.62.1-noble AS runtime

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

FROM node:22-alpine AS development

# Install build dependencies for native modules (like canvas)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source
COPY . .

# Build application
RUN npm run build

# Prune dev dependencies so we can reuse production node_modules
RUN npm prune --omit=dev

# Clean up build dependencies to reduce image size
RUN apk del python3 make g++ musl-dev

FROM node:22-alpine AS production

# Set NODE_ENV
ARG NODE_ENV=production
ENV NODE_ENV=docker

# Install runtime dependencies
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    musl \
    giflib \
    pixman \
    pangomm \
    libjpeg-turbo \
    freetype

# Create app directory
WORKDIR /usr/src/app

# Copy production node_modules from build stage
COPY --from=development --chown=node:node /usr/src/app/node_modules ./node_modules

# Copy build artifacts from development stage and change ownership
COPY --from=development --chown=node:node /usr/src/app/dist ./dist
COPY --from=development --chown=node:node /usr/src/app/res ./res

# Switch to the non-root user
USER node

# Add health check (matches Nest global prefix)
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 CMD wget -q -O - http://localhost:3000/api/health || exit 1

# Expose API port
EXPOSE 3000

# Make Node.js properly handle signals
ENV NODE_OPTIONS="--unhandled-rejections=strict"

# Start the application
CMD ["node", "dist/main"] 
FROM node:20-alpine

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install all dependencies (needed for build)
RUN npm install

# Copy application code
COPY . .

# Build Vite frontend into /app/dist
RUN npm run build

# Expose port (standard 3000, or provided by host via PORT env var)
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server/index.js"]


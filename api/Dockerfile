# Base image with Node.js
FROM node:24-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose the port your Fastify server uses
EXPOSE 3000

# Start the server (compiled JS output)
CMD ["node", "dist/index.js"]

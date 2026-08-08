# Development Dockerfile with hot reload
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source (will be overwritten by volume mount)
COPY . .

# Expose port
EXPOSE 3000

# Start with dev server
CMD ["npm", "run", "dev"]

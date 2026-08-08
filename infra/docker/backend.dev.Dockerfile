# Development Dockerfile with hot reload
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source (will be overwritten by volume mount)
COPY . .

# Expose port
EXPOSE 5000

# Start with nodemon for hot reload
CMD ["npm", "run", "dev"]

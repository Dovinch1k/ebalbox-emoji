FROM node:20-alpine

WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm install --omit=dev

# Copy application code
COPY . .

# Expose default port
EXPOSE 3000

ENV NODE_ENV=production

# Start application
CMD ["npm", "start"]

FROM node:20-bullseye-slim

WORKDIR /app

# Install build tools for better-sqlite3 native compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

# Create data dir and adjust permissions for Hugging Face non-root user (UID 1000)
RUN mkdir -p /app/data && chown -R 1000:1000 /app

USER 1000

# Default port for Hugging Face Spaces is 7860
ENV PORT=7860
EXPOSE 7860

CMD ["node", "server.js"]

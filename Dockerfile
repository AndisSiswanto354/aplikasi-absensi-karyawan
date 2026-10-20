FROM node:20-bullseye-slim

WORKDIR /app

# Install build tools for better-sqlite3 native compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

# Create data dir and adjust permissions
RUN mkdir -p /app/data && chown -R 1000:1000 /app

USER 1000

ENV PORT=3050
EXPOSE 3050
EXPOSE 7860

CMD ["node", "server.js"]

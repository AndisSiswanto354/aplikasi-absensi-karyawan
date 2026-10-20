FROM node:20-bullseye-slim

WORKDIR /app

# Install build tools for better-sqlite3 native compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

# Default port for HuggingFace (7860) or fallback (3050)
ENV PORT=7860
EXPOSE 7860

CMD ["node", "server.js"]

FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY public ./public

RUN mkdir -p /app/data

ENV PORT=3000
ENV DATA_DIR=/app/data
ENV DB_PATH=/app/data/schriftfuehrer.db

EXPOSE 3000

CMD ["npm", "start"]

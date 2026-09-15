FROM node:20-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
ENV PORT=3000
ENV DATA_DIR=/app/data/games
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "server.js"]

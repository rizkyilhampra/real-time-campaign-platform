FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

FROM node:22-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --only=production

COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000

CMD [ "npm", "start" ]

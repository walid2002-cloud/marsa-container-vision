FROM node:18-alpine AS build

WORKDIR /app

ARG REACT_APP_MARSA_AI_URL=http://localhost:5173
ENV REACT_APP_MARSA_AI_URL=$REACT_APP_MARSA_AI_URL

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

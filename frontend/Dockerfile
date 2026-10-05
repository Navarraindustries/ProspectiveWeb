# PROSPECTIVE Web — la aplicación compilada, servida por nginx, que además
# reenvía /api, /data y /ws a la API. Navegador y API quedan en el MISMO
# origen: la cookie de sesión es SameSite y no hace falta CORS.
FROM node:24-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80

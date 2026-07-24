FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Accept VITE_API_URL as empty so the app uses relative paths routed through nginx.
ARG VITE_API_URL=""
ARG VITE_SENTRY_DSN=""
ARG VITE_ENVIRONMENT="development"
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_ENVIRONMENT=$VITE_ENVIRONMENT
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

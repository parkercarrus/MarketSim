# -------- build --------
FROM node:20-alpine AS build
# Next.js on Alpine often needs this
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./

RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .
RUN npm run build

# -------- run --------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start", "-p", "3000"]

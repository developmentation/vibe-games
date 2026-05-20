FROM node:22-alpine
WORKDIR /app
COPY . .

# GOA CA cert — required for HTTPS proxying to www.alberta.ca
COPY goa-ca-chain.pem /etc/ssl/certs/goa-ca.pem
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/goa-ca.pem

EXPOSE 8080
CMD ["sh", "-c", "node apps/serve-multi.mjs --port ${PORT:-8080}"]

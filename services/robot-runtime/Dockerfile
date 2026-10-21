FROM python:3.12-alpine

WORKDIR /app

COPY src ./src
COPY config/runtime.compose.json ./config/runtime.compose.json

EXPOSE 8015

ENTRYPOINT ["python3", "src/server.py", "--config", "config/runtime.compose.json"]

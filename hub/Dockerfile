FROM python:3.12-slim
WORKDIR /app
COPY . /app
ENV CW_DATA=/data CW_PORT=8080
EXPOSE 8080
CMD ["python3", "server.py"]

# Digital Twin telemetry boundary. Runs as a second container next to the Education API on the one EC2 instance.
# It publishes no port beyond 127.0.0.1 on the host (nginx terminates TLS and upgrades /ws/), imports no hardware driver and
# opens no serial port. The SO-101 MuJoCo model is NOT in the image: it is mounted read-only at /model (see README).
FROM python:3.12-slim AS build
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PIP_DISABLE_PIP_VERSION_CHECK=1
RUN pip install --no-cache-dir uv==0.9.5
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --extra simulation --no-install-project

FROM python:3.12-slim
RUN useradd --system --uid 10001 --no-create-home twin
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
COPY src ./src
COPY fixtures ./fixtures
ENV PATH="/app/.venv/bin:$PATH" PYTHONPATH=/app/src PYTHONUNBUFFERED=1 VISTA_TWIN_MUJOCO_MODEL_PATH=/model/so101.xml
USER twin
EXPOSE 8767
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8767/health', timeout=2).status == 200 else 1)"
CMD ["uvicorn", "vista_digital_twin.app:app", "--host", "0.0.0.0", "--port", "8767", "--no-server-header"]

FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/data/.huggingface \
    HF_HUB_CACHE=/data/.huggingface/hub \
    PORT=7860 \
    PATH=/opt/venv/bin:$PATH \
    WSM_WEBUI_PYTHON=/opt/venv/bin/python \
    WSM_WEBUI_GPU=0 \
    WSM_WEBUI_TIMEOUT=1800

RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg git git-lfs libegl1 libgl1 libglib2.0-0 libgomp1 \
        libsm6 libxext6 libxrender1 python3 python3-dev python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv \
    && python -m pip install --upgrade pip setuptools wheel \
    && python -m pip install \
        torch==2.8.0 torchvision==0.23.0 \
        --index-url https://download.pytorch.org/whl/cu128

WORKDIR /app
COPY . /app

RUN python -m pip install "/app/plugins/WSMs[webui]" \
    && python -m pip check \
    && mkdir -p /data/.huggingface /app/outputs \
    && chown -R 1000:1000 /app /data

USER 1000
EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=20m --retries=5 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT','7860')+'/api/status', timeout=4)" || exit 1

CMD ["python", "start_space.py"]

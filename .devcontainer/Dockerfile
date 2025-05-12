FROM mcr.microsoft.com/devcontainers/python:1-3.12-bookworm

RUN sudo mkdir -p /home/vscode/.local/lib /home/vscode/.local/bin /home/vscode/.local/share /filestore \
    && sudo chown -R vscode /home/vscode/.local/lib /home/vscode/.local/bin /home/vscode/.local/share /filestore \
    && sudo apt-get update \
    && sudo DEBIAN_FRONTEND=noninteractive apt-get -y full-upgrade \
    && sudo DEBIAN_FRONTEND=noninteractive apt-get -y autoremove \
    && sudo DEBIAN_FRONTEND=noninteractive apt-get -y autoclean \
    && sudo DEBIAN_FRONTEND=noninteractive apt-get -y install \
    build-essential \
    chromium \
    git \
    gosu \
    libpq-dev \
    libsystemd-dev \
    postgresql-client \
    vim \
    zip \
    unzip \
    && DEBIAN_FRONTEND=noninteractive apt-get -y clean \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m pip install --upgrade pip \
    && pip install --user openai 
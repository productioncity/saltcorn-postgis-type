FROM mcr.microsoft.com/devcontainers/python:1-3.12-bookworm

RUN sudo mkdir -p /home/vscode/.local/lib /home/vscode/.local/bin && \
    sudo chown -R vscode /home/vscode/.local/lib /home/vscode/.local/bin && \
    sudo apt-get update && \
    sudo DEBIAN_FRONTEND=noninteractive apt-get -y full-upgrade && \
    sudo DEBIAN_FRONTEND=noninteractive apt-get -y autoremove && \
    sudo DEBIAN_FRONTEND=noninteractive apt-get -y autoclean && \
    sudo DEBIAN_FRONTEND=noninteractive apt-get -y install vim zip unzip && \
    python3 -m pip install --upgrade pip && \
    pip install --user openai

# [Optional] Uncomment this section to install additional OS packages.
# RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
#     && apt-get -y install --no-install-recommends <your-package-list-here>

# [Optional] Uncomment if you want to install an additional version of node using nvm
# ARG EXTRA_NODE_VERSION=10
# RUN su node -c "source /usr/local/share/nvm/nvm.sh && nvm install ${EXTRA_NODE_VERSION}"

# [Optional] Uncomment if you want to install more global node modules
# RUN su node -c "npm install -g <your-package-list-here>"

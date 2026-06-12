FROM mcr.microsoft.com/devcontainers/javascript-node:20

# Install Python and venv
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-pip \
    python3-venv \
    && apt-get clean && rm -rf /var/lib/apt-get/lists/*

# Install uv globally to /usr/local/bin so any user can access it
ADD --chmod=755 https://astral.sh/uv/install.sh /install.sh
RUN /install.sh --bin-dir /usr/local/bin && rm /install.sh

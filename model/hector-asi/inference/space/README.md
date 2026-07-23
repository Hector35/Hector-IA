---
title: Hector ASI Qwen15 v10
emoji: 🧠
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
license: apache-2.0
---

# Hector ASI Qwen15 v10

Servidor privado y compatible con `POST /v1/chat/completions` que carga la revisión congelada de `Qwen/Qwen2.5-1.5B-Instruct` y el adaptador LoRA verificable `hector-asi-qwen15-v10`.

El adaptador no vive en GitHub: el workflow de despliegue lo recupera desde el artefacto inmutable de GitHub Actions, comprueba su SHA-256 y lo publica únicamente en este Space privado.

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi import Request

from pydantic import BaseModel

from utils import ask_phi

import json

import requests


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    prompt: str

@app.get("/health")
def health():
    return {"status": "running"}


@app.post("/chat")
def chat(request: ChatRequest):
    reply = ask_phi(request.prompt)

    return {
        "prompt": request.prompt,
        "response": reply
    }

@app.post("/stream")
def stream_chat(request: Request, body: ChatRequest):

    def generate():
        payload = {
            "model": "phi3",
            "prompt": body.prompt,
            "stream": True
        }

        try:
            with requests.post(
                "http://localhost:11434/api/generate",
                json=payload,
                stream=True,
                timeout=(5.0, 15.0)
            ) as upstream:
                for line in upstream.iter_lines(decode_unicode=True):
                    if line:
                        try:
                            data = json.loads(line)
                            chunk = data.get("response", "")
                            if chunk:
                                yield chunk
                        except json.JSONDecodeError:
                            pass
        except requests.exceptions.RequestException as e:
            yield f"Error: Local AI server (Ollama) is stuck or not responding! ({e})"

    return StreamingResponse(
        generate(),
        media_type="text/plain"
    )
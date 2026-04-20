import requests

url = "http://localhost:11434/api/generate"

def ask_phi(prompt):    # reusable function to send prompt
    payload = {
        "model": "phi3",
        "prompt": prompt,
        "stream": False
    }
    try:
        response = requests.post(url, json=payload, timeout=60)
        response.raise_for_status()

        data = response.json()

        return data["response"]

    except Exception as e:
        return f"Error: {e}"

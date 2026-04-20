import requests
import json

url = "http://localhost:11434/api/generate"

history = []

def build_prompt(user_input):
    conversation = "\n".join(history)
    return f"""You are a concise assistant.
    Answer clearly in 2-4 lines maximum.
    Do not ramble.

    {conversation}
    User: {user_input}
    AI:"""

def ask_phi_stream(prompt):    # reusable function to send prompt
    payload = {
        "model": "phi3",
        "prompt": prompt,
        "stream": True
    }

    full_reply = ""

    response = requests.post(url, json = payload, stream = True)

    for line in response.iter_lines():
        if line:
            data = json.loads(line.decode("utf-8"))
            chunk = data.get("response", "")
            full_reply += chunk
            print(chunk, end="", flush=True)
    print()
    return full_reply.strip()



print("Phi-3 Chatbot Started")
print("Type 'exit' to quit.\n")
print("Ask a question here")

while True:
    user = input("You: ")

    if user.lower() == "exit":
        print("Goodbye.")
        break

    res_prompt = build_prompt(user)

    print("Phi-3: ", end="")
    reply = ask_phi_stream(res_prompt)
    history.append(f"User: {user}")
    history.append(f"AI: {reply}")
    print()

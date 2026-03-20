from fastapi import FastAPI
from workflows.lead_workflow import run_workflow

app = FastAPI()

@app.get("/run-agent")
def run_agent():
    result = run_workflow()
    return result
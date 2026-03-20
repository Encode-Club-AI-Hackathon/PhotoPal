from agents.lead_finder import lead_finder
from agents.lead_scorer import lead_scorer
from agents.outreach_writer import outreach_writer

def run_workflow(user_id=1):
    state = {}
    state = lead_finder(state)
    state = lead_scorer(state)
    state = outreach_writer(state, user_id=user_id)
    return state
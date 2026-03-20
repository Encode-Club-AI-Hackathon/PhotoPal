def lead_scorer(state):
    for lead in state['leads']:
        # Simple scoring logic (0-100)
        lead['score'] = 80  # placeholder for now
    return state
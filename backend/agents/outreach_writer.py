def outreach_writer(state):
    for lead in state['leads']:
        lead['message'] = f"Hi {lead['name']}, we’d love to provide photography services!"
    return state
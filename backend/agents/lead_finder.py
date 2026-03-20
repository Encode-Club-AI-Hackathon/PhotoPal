def lead_finder(state):
    # Mock output for now
    leads = [
        {"name": "Wedding Venue A", "location": "London"},
        {"name": "Restaurant B", "location": "London"},
        {"name": "Fashion Brand C", "location": "London"}
    ]
    state['leads'] = leads
    return state
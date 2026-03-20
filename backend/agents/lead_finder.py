from database.db import SessionLocal, Lead

def lead_finder(state):
    # Mock leads
    leads_data = [
        {"name": "Wedding Venue A", "location": "London"},
        {"name": "Restaurant B", "location": "London"},
        {"name": "Fashion Brand C", "location": "London"}
    ]

    session = SessionLocal()
    leads = []

    for data in leads_data:
        # Check if lead already exists
        lead = session.query(Lead).filter_by(name=data["name"]).first()
        if not lead:
            lead = Lead(name=data["name"], location=data["location"])
            session.add(lead)
            session.commit()
    leads.append({
        "id": lead.id,
        "name": lead.name,
        "location": lead.location,
        "lead_score": lead.lead_score,
        "contacted": lead.contacted
    })

    state['leads'] = leads
    session.close()
    return state
from database.db import SessionLocal, Lead

def lead_scorer(state):
    session = SessionLocal()

    for lead in state["leads"]:
        score = 80  # placeholder scoring

        # Update database
        db_lead = session.query(Lead).filter_by(id=lead["id"]).first()
        db_lead.lead_score = score
        session.commit()

        # Update state
        lead["lead_score"] = score

    session.close()
    return state
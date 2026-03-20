from database.db import SessionLocal, Lead, Message

def outreach_writer(state, user_id=1):
    session = SessionLocal()

    for lead in state["leads"]:
        # fetch DB version
        db_lead = session.query(Lead).filter_by(id=lead["id"]).first()

        if not lead["contacted"]:
            message_text = f"Hi {lead['name']}, we'd love to provide photography services!"

            msg = Message(
                lead_id=db_lead.id,
                user_id=user_id,
                content=message_text
            )

            session.add(msg)
            db_lead.contacted = True
            session.commit()

            # update state
            lead["contacted"] = True
            lead["message"] = message_text

    session.close()
    return state
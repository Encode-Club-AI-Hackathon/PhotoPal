from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, Float, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import datetime

DATABASE_URL = "sqlite:///photopal.db"

Base = declarative_base()
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Users table
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    luffa_id = Column(String, unique=True)
    preferences = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

# Leads table
class Lead(Base):
    __tablename__ = "leads"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    location = Column(String)
    last_contacted = Column(DateTime, nullable=True)
    lead_score = Column(Float, default=0.0)
    contacted = Column(Boolean, default=False)

# Messages table
class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer)
    user_id = Column(Integer)
    content = Column(String)
    sent_at = Column(DateTime, default=datetime.datetime.utcnow)
    status = Column(String, default="pending")

# Create tables
Base.metadata.create_all(bind=engine)
"""
seed_coach_memory.py — Injects fake past coach messages for RAG testing.

Run once:  python seed_coach_memory.py

Then go to the coach page and ask something like:
  "What salary range was I targeting?"
  "What company was I most excited about?"
  "What did I say about my weakness?"

The coach should answer using these seeded memories even though they weren't
in this browser session.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from db_operations import save_chat_message
from coach_memory import embed_and_store

USER_ID = 1

past_messages = [
    ("user",      "I'm targeting a salary between $120k and $150k for my next role."),
    ("assistant", "That's a reasonable range for a senior engineer. Make sure to anchor high in negotiations."),
    ("user",      "I'm most excited about the Stripe role — their engineering blog really impressed me."),
    ("assistant", "Stripe is known for rigorous technical interviews. Brush up on distributed systems."),
    ("user",      "My biggest weakness is that I sometimes over-engineer solutions. I'm working on it."),
    ("assistant", "Turning that into a strength: mention you've learned to ship iteratively and refine later."),
    ("user",      "I have a final round interview at Stripe next Tuesday. Really nervous about the system design round."),
    ("assistant", "For Stripe's system design, focus on payment flows, idempotency, and fault tolerance."),
]

print(f"Seeding {len(past_messages)} past messages for user {USER_ID}...")

for role, message in past_messages:
    save_chat_message(role, message, USER_ID)
    embed_and_store(USER_ID, message, role)
    print(f"  [{role}] {message[:60]}...")

print("\nDone. Now go to the coach and ask:")
print('  "What salary range was I targeting?"')
print('  "What company was I most excited about?"')
print('  "What did I say was my biggest weakness?"')
print('  "When is my next interview and what should I focus on?"')

import sys
import json
import random

# Receive command line args: mood + optional note
mood = sys.argv[1] if len(sys.argv) > 1 else None
note = sys.argv[2] if len(sys.argv) > 2 else ""

# Recommendations dictionary
mood_recommendations = {
    "Happy": [
        "Listen to upbeat music 🎵", 
        "Write a gratitude journal ✍️", 
        "Go for a walk 🌳"
    ],
    "Neutral": [
        "Try a new hobby 🎨", 
        "Read a short story 📖", 
        "Meditate for 5 minutes 🧘‍♀️"
    ],
    "Anxious": [
        "Practice deep breathing 🌬️", 
        "Listen to calming music 🎶", 
        "Take a short break 🛋️"
    ],
    "Angry": [
        "Do some physical exercise 🏃", 
        "Write down your feelings ✍️", 
        "Listen to relaxing sounds 🌊"
    ],
    "Sad": [
        "Talk to a friend 💬", 
        "Watch a feel-good movie 🎥", 
        "Go for a short walk 🚶"
    ],
    "Depressed": [
        "Reach out for help ☎️", 
        "Try light exercise 🌱", 
        "Write down small goals 📝"
    ]
}

# Generate recommendations dynamically
recs = mood_recommendations.get(mood, ["No recommendations found."])

# Add contextual suggestion if note is provided
if note:
    recs.append(f"Reflect on your thoughts: \"{note}\" ✨")

# Pick 2 random recommendations to return
selected = random.sample(recs, min(2, len(recs)))

# Return as JSON array
print(json.dumps(selected))

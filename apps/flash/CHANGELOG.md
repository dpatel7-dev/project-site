# Changelog

## 1.1.0
- The moving scene behind the window can no longer stumble on its very first frame.
- **Learn mode**: rounds of seven cards until you know every one. Each card starts as pick-one-of-four, then you type it from memory; a miss sends it back a step and it comes up again later in the round. Your progress is kept between sessions.
- **Practice tests**: a whole test on one page, like a real one, with multiple choice, true or false, written answers and a matching section. Hand it in to see your mark and the right answer to everything you missed, then retake it, take a test on just the ones you missed, or learn them. Your last scores show on the deck. Also in the terminal: `flash test`.
- Fixed: the "From a file" box was drawn broken. It's a proper drop area now.
- `flash` on its own with no decks yet now offers what to do (type cards, bring in a file, make them with AI, open the window) instead of printing and stopping straight away, which pca showed as "Back from flash".

## 1.0.0
- flash is study cards that come back just before you'd forget them: Again, Hard, Good or Easy, and the gaps grow as you learn.
- Test dates: nothing is scheduled past the day before the test, new cards are spread out so you learn them all in time, and the day before, every card comes up once more.
- Four ways to study: flip, pick one of four (wrong answers that look like the right one), type it (typos, accents and alternatives forgiven), and the match game against the clock. Backwards too.
- Paste cards from anywhere: Tab-separated (Quizlet and Anki exports), term - definition, term: definition, Q: and A:, fill-in-the-blank with {{ }}, two lines per card, or .csv.
- Cards made by AI from your notes (text, Markdown, Word, PDF) or a topic, using the family's shared free AI.
- Memory hooks for cards you keep forgetting, and "explain it".
- Share a deck as a link with pigeon; export for Quizlet, Anki or a spreadsheet; bring in decks from Tree of Thought's cram.
- A daily reminder, only on days there's something to study. Streaks and a calendar of the days you studied.
- `flash app` opens its window: a lake at the bottom, with reeds, a dock and a frog. Dragonflies by day; by night, fireflies blink everywhere and Blink flies loops among them.

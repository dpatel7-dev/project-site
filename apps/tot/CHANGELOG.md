# Changelog


## 2.3.0
- **A new sidebar.** It's now a calm panel of its own beside the chat instead of a cramped box: a big **New chat** button at the top, one tidy line per AI model (the one answering is softly highlighted, with "free" or "this Mac" beside it), and your chats grouped into Today, Yesterday, This week and Earlier with how long ago each was. Long names end in "…" instead of being chopped. How much free AI is left today sits quietly at the bottom.
- The big tree no longer squeezes the sidebar; Rowan still greets you on the welcome screen.

## 2.2.0
- A roomier garden sidebar: each model is one clean line with a small plant icon (no more big pictures crowding the text), its maker on a quieter line under it, and the one you're using marked with a bar in its colour. Chats have room, and nothing gets cut off.
- Clean pictures in macOS Terminal: Rowan is drawn with whole cells there (no thin stripes), smaller and tidier. The welcome screen never shows half a tree on a small window. `TUI_PIXELS=smooth` brings back the detailed one.
- The welcome card is simpler: the model's icon, name and what it costs, without the big plant picture.

## 2.1.0
- Free AI in the cloud, as easy as copy and paste: `tot free` (or Tab → Set up free AI, or the dashboard) opens each service's key page and notices the key when you copy it. Groq, NVIDIA, Google Gemini, Mistral, OpenRouter, Ollama Cloud and SambaNova, with their best free models (DeepSeek, Kimi K2, GPT-OSS 120B, Qwen3, Gemini, Mistral Large…).
- Auto (free): picks the best free model with room left for every question (fast ones for quick questions, coding ones for code) and moves on when one runs out.
- Usage tracker: `tot usage`, Tab → Usage and the dashboard show what each free service has left today (from the services' own numbers), when it refills, the last week, and tips.
- Paste a key anywhere (or `tot gsk_…`) and it's added.
- Models on this computer are now optional (`tot local`); stand-ins prefer free cloud models.
- Tools: `tot cram` (flashcards from your notes) and `tot howto` (terminal commands explained, never run without asking), plus tidy, under Tab → Tools.

## 2.0.0
- Quick questions: `tot what is osmosis?` answers right in your terminal, with follow-ups, files (`-f`) and piping. Saved as chats.
- Free with no limits: `tot free` (or Tab → Get a free model for this computer) picks the model that fits your computer's memory and downloads it with Ollama.
- Stand-ins: if a model is busy, over its limit or unreachable, the next one in your garden answers (models on this computer first), and you're told.
- Projects: their own instructions, pinned files (re-read every time) and chats. `/project`, `/pin`.
- Attach files to a question (`/file`, or drag a file into the window), save answers (`/save`, `/save code`), search every chat (`/find`), usage per model (`/usage`).
- Long chats are trimmed to what a model can read, keeping your first message and the newest ones.
- Each plant now shows who made the model (Anthropic, Google, Meta…) and where it runs.
- Ctrl+B hides the garden sidebar. The menu can be searched by typing.
- Tab → Tidy a folder opens tidy (or installs it).
- The dashboard has a new look, matching gossip's: a quick-question bar, free models, projects, usage and chat search.

## 1.1.0
- The dashboard (`tot dashboard`, or Tab → Open the dashboard): chats drawn as trees, the garden, keys, settings, and models on this computer, in your browser.
- Network check (`tot check`): which AI services, and which key websites, this network lets through. Handy on school or office Wi-Fi.
- Download Ollama models from tot (`tot pull llama3.2`, or the dashboard), so you can run models with no internet at all.
- New services: Mistral, Cerebras, and any other OpenAI-compatible address.
- tot notices when the dashboard changes your garden, keys or colours.
- Rowan and the plants no longer show seams in macOS Terminal.

## 1.0.0
- First release: a garden of AI models in your terminal, with the same look and feel as gossip.
- Works with OpenRouter, OpenAI, Anthropic, Google AI Studio, Groq, Hugging Face and Ollama. Answers stream in as they're written.
- Your first key plants a garden by itself: the strongest recent model from each maker.
- Ask every model at once (Ctrl+G) and flip between their answers with ← →.
- Conversations are trees: asking again or editing a question grows a new branch instead of throwing the old one away.
- Rowan the tree thinks, writes and blossoms along with the models.
- Every model gets its own original plant emblem.
- Markdown answers: code blocks, lists, tables, bold and links. Copy an answer or just its code.
- Three colour themes (grove, meadow, autumn) that paint the whole window.
- `tot ask` for one-off questions from the shell, piping included.

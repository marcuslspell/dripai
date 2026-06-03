# DripAI — IV Rate Calculator

AI-powered IV rate calculator for nurses. Voice input, natural language parsing, instant calculations, local shift tracking.

---

## Deploy in 15 minutes

### 1. Add your files to GitHub
- Create a new repo at github.com
- Upload all these files maintaining the folder structure

### 2. Set up Vercel
- Go to vercel.com → New Project → Import your GitHub repo
- Under **Environment Variables** add:
  - `VITE_ANTHROPIC_KEY` = your Anthropic API key (from console.anthropic.com)
- Click **Deploy**

### 3. Custom domain (optional)
- Buy domain at namecheap.com (~$12/year)
- In Vercel → Settings → Domains → Add domain
- Copy the DNS records Vercel gives you into Namecheap

---

## Local development

```bash
npm install
npm run dev
```

Create a `.env` file in the root:
```
VITE_ANTHROPIC_KEY=sk-ant-api03-...
```

---

## How to use

- **Voice:** Tap 🎤 and say the instruction — it transcribes and parses automatically
- **Text:** Type naturally, hit Enter or Parse
- **Manual:** Click "+ Add manually" and fill fields directly
- **Update:** Say "change room 4 to 90 min" and it finds and updates that line
- **Data:** Stays on device — no account, no server, no PHI risk

## Example commands
- "add room 7 heparin 125ml over 60 minutes"
- "change room 4 dopamine from 100ml over 60 min to 90 min"
- "room 12 vancomycin 250ml over 2 hours"
- "update room 3 to 150ml over 45 min"

---

## Cost
- Hosting: Free (Vercel)
- AI: ~$0.001 per parse request (Anthropic API)
- Domain: ~$12/year (optional)

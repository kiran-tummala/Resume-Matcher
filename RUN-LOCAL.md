# How to run BenchPilot on your computer

BenchPilot is the `bench` branch of this repo: Resume Matcher plus a staffing
bench (consultants, requirements, submissions). What it does: [BENCH.md](BENCH.md).

## 1. Install the prerequisites (one time)

- **Git**: <https://git-scm.com>
- **Node.js 22 or newer**: <https://nodejs.org> (the LTS installer)
- **uv** (runs the Python side)
  - Mac/Linux: the script in step 2a installs it for you.
  - Windows (PowerShell):

    ```powershell
    powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    ```

## 2a. Mac or Linux

1. Unzip **BenchPilot-all.zip** (for example into Downloads).
2. Open **Terminal** and run:

   ```bash
   cd ~/Downloads/BenchPilot
   bash run-bench-local.sh
   ```

3. The first run takes a few minutes. It downloads the code into a
   `Resume-Matcher` folder, installs everything, and opens
   <http://localhost:3000/bench> in your browser.
4. Keep that Terminal window open while you use the app. Press **Ctrl+C** in it
   to stop.

No zip? Run the same steps by hand:

```bash
git clone https://github.com/kiran-tummala/Resume-Matcher.git
cd Resume-Matcher && git checkout bench
(cd apps/backend && uv sync && uv run uvicorn app.main:app --port 8000) &
cd apps/frontend && npm install && npm run dev
```

## 2b. Windows (PowerShell)

Open **two** PowerShell windows.

**Window 1, the backend:**

```powershell
cd $HOME
git clone https://github.com/kiran-tummala/Resume-Matcher.git
cd Resume-Matcher
git checkout bench
cd apps\backend
uv sync
uv run uvicorn app.main:app --port 8000
```

**Window 2, the frontend:**

```powershell
cd $HOME\Resume-Matcher\apps\frontend
npm install
npm run dev
```

Then open <http://localhost:3000/bench> in your browser.

## 3. First time in the app

1. Go to <http://localhost:3000/settings>.
2. Pick **Groq** as the provider and paste your key (free from
   console.groq.com → API Keys).
3. Set the model to **`openai/gpt-oss-120b`** and click **Test connection**.
4. Go to **Bench**:
   - **Consultants:** add a consultant and upload their resume.
   - **Requirements:** add a requirement by pasting the job description.
   - **Submit:** pick a match and submit them.

Groq's free plan allows about 1,000 requests a day, which is a few dozen
tailored resumes. If you hit the limit, a submission shows *Tailoring failed*;
click **Retry** the next day. For real consultant resumes, consider Ollama
(runs fully on your machine) or a paid key: see the notes in BENCH.md.

## Next time

- **Mac/Linux:** run `bash run-bench-local.sh` again. It also pulls any updates.
- **Windows:** in each window, `cd` into the folder and run the last command
  again (`uv run uvicorn app.main:app --port 8000` and `npm run dev`). To get
  updates first: `git pull` in the `Resume-Matcher` folder.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `node`, `git` or `uv` not found | Install it (step 1), then open a new terminal window. |
| Port 3000 or 8000 already in use | Close the other app using it, or stop an earlier run with Ctrl+C. |
| "Setup required" on the dashboard | Add your AI key in Settings (step 3). |
| Test connection fails | Check the key, and that the model is `openai/gpt-oss-120b`. |
| Resume upload says it could not be read | Use a text-based PDF or DOCX, not a scan. |

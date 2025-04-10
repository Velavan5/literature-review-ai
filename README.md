# Literature Review AI - Hackathon Project

Backend service for the AI-powered literature review tool.

## Features (Step 1)

* Flask backend server.
* `/search` POST endpoint that accepts a JSON payload `{"query": "your search terms", "limit": 10}`.
* Queries the Semantic Scholar API based on the provided query.
* Returns a JSON list of relevant papers with fields like `paperId`, `url`, `title`, `abstract`, `authors`, `year`.

## Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd literature-review-ai
    ```

2.  **Create a virtual environment (recommended):**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows use `venv\Scripts\activate`
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **(Optional) Create `.env` file:**
    If you have a Semantic Scholar API key, create a `.env` file in the project root and add:
    ```
    SEMANTIC_SCHOLAR_API_KEY=YOUR_KEY_HERE
    ```

5.  **Run the Flask development server:**
    ```bash
    python app.py
    ```
    The server will start, usually at `http://127.0.0.1:5000/` or `http://0.0.0.0:5000/`.

## Usage

Send a POST request to the `/search` endpoint with a JSON body:

**Example using `curl`:**

```bash
curl -X POST -H "Content-Type: application/json" \
     -d '{"query": "large language models efficiency", "limit": 5}' \
     [http://127.0.0.1:5000/search](http://127.0.0.1:5000/search)
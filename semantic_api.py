import requests
import os
import time
import random
import logging
from dotenv import load_dotenv

load_dotenv()
# Use logging instead of print for better tracking, especially in Flask apps
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

SEMANTIC_SCHOLAR_API_URL = "https://api.semanticscholar.org/graph/v1"
# SEMANTIC_SCHOLAR_API_KEY = os.getenv("SEMANTIC_SCHOLAR_API_KEY")

# --- Configuration for Retries ---
MAX_RETRIES = 5
INITIAL_BACKOFF_SECONDS = 1
# ---------------------------------

def search_papers(query: str, limit: int = 10) -> list | None:
    """
    Searches for papers using the Semantic Scholar API with retries on failure,
    attempting to retrieve direct PDF links where available.

    Args:
        query: The search string.
        limit: The maximum number of papers to return.

    Returns:
        A list of paper details (including 'pdfUrl' if available) if successful.
        Returns None if the request fails after all retries.
        Returns an empty list if the search is successful but finds no papers.
    """
    endpoint = f"{SEMANTIC_SCHOLAR_API_URL}/paper/search"
    params = {
        'query': query,
        'limit': limit,
        # *** UPDATED FIELDS ***
        # Request fields needed, including open access info
        'fields': 'paperId,url,title,abstract,authors,year,isOpenAccess,openAccessPdf'
    }
    headers = {
        # 'x-api-key': SEMANTIC_SCHOLAR_API_KEY # Uncomment if you have a key
    }

    current_backoff = INITIAL_BACKOFF_SECONDS

    for attempt in range(MAX_RETRIES + 1):
        try:
            logging.info(f"Attempt {attempt+1}/{MAX_RETRIES+1}: Querying S2 API: query='{query}'")
            response = requests.get(endpoint, params=params, headers=headers, timeout=25) # Increased timeout slightly

            # --- Handle specific HTTP errors for retries ---
            if response.status_code == 429:
                logging.warning(f"Attempt {attempt+1} failed: 429 Too Many Requests.")
                if attempt == MAX_RETRIES: break # Exit loop to return None
                # Wait and prepare for next attempt
                wait_time = current_backoff + random.uniform(0, 0.5)
                logging.info(f"Waiting {wait_time:.2f} seconds...")
                time.sleep(wait_time)
                current_backoff *= 1.5
                continue # Go to next attempt

            if response.status_code >= 500:
                 logging.warning(f"Attempt {attempt+1} failed: Server Error {response.status_code}.")
                 if attempt == MAX_RETRIES: break # Exit loop to return None
                 # Wait and prepare for next attempt
                 wait_time = current_backoff + random.uniform(0, 0.5)
                 logging.info(f"Waiting {wait_time:.2f} seconds...")
                 time.sleep(wait_time)
                 current_backoff *= 1.5
                 continue

            # --- If not a retryable error, raise it ---
            response.raise_for_status() # Raises for other 4xx errors (400, 401, 403, 404 etc.)

            # --- Process successful response ---
            results = response.json()
            papers_found = results.get('data', [])
            logging.info(f"Attempt {attempt+1} successful. Received {len(papers_found)} results.")

            # *** ADD PDF URL PROCESSING ***
            processed_papers = []
            for paper in papers_found:
                pdf_info = paper.get('openAccessPdf')
                paper['pdfUrl'] = None # Initialize pdfUrl key
                if pdf_info and isinstance(pdf_info, dict) and pdf_info.get('url'):
                    paper['pdfUrl'] = pdf_info['url']
                    logging.debug(f"Found Open Access PDF for paperId {paper.get('paperId')}: {paper['pdfUrl']}")
                else:
                    logging.debug(f"No Open Access PDF found for paperId {paper.get('paperId')}")
                # Optionally remove the raw openAccessPdf field if you don't need it
                # paper.pop('openAccessPdf', None)
                processed_papers.append(paper)

            return processed_papers # Success! Return the processed list

        except requests.exceptions.Timeout:
            logging.warning(f"Attempt {attempt+1} timed out.")
            if attempt == MAX_RETRIES: break # Exit loop to return None
            wait_time = current_backoff + random.uniform(0, 0.5)
            logging.info(f"Waiting {wait_time:.2f} seconds...")
            time.sleep(wait_time)
            current_backoff *= 2
            continue

        except requests.exceptions.RequestException as e:
            logging.error(f"Attempt {attempt+1} failed with RequestException: {e}", exc_info=True)
            # Decide if you want to retry on generic RequestException or not
            # For now, we break and return None on the first occurrence
            return None # Fail immediately on other network errors

    # If loop finished due to max retries on 429 or 5xx
    logging.error(f"Failed to retrieve papers for query '{query}' after {MAX_RETRIES+1} attempts.")
    return None

# Example usage (for testing this file directly)
if __name__ == '__main__':
    test_query = "explainable ai techniques survey"
    papers = search_papers(test_query, limit=3)

    if papers is None:
        print(f"\n[RESULT] Failed to retrieve papers for '{test_query}' after retries.")
    elif not papers: # Empty list
         print(f"\n[RESULT] Successfully queried, but found 0 papers for '{test_query}'.")
    else:
        print(f"\n[RESULT] Found {len(papers)} papers for '{test_query}':")
        for i in papers[0]:
            print("key: ",i)
        exit(0)
        for i, paper in enumerate(papers[0]):
            print("key: ",paper)
            print("fetched result: ")
            print(i,".) ",paper)
            title = paper.get('title', 'N/A')
            year = paper.get('year', 'N/A')
            # Access the new pdfUrl field
            pdf_url = paper.get('pdfUrl', 'Not Available')
            # Also show if it's marked as Open Access
            is_oa = paper.get('isOpenAccess', False)
            print(f"  {i+1}. {title} ({year})")
            print(f"     Open Access: {is_oa}")
            print(f"     PDF Link: {pdf_url}")
            # print(f"     Abstract: {paper.get('abstract')[:100]}...") # Optional
            print("-" * 10)
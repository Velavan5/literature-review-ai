from flask import Flask, request, jsonify
from semantic_api import search_papers
from flask_cors import CORS
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
app = Flask(__name__)
CORS(app)

@app.route('/')
def home():
    # Simple route to check if the server is running
    app.logger.info("Root endpoint '/' accessed.")
    return "Literature Review AI Backend is running!"

@app.route('/search', methods=['POST'])
def handle_search():
    """
    API endpoint to search for papers.
    Expects a JSON payload with a 'query' key.
    Optional 'limit' key in JSON payload (defaults to 10).
    Optional URL query parameter 'require_pdf' (e.g., /search?require_pdf=true)
    to only return papers with downloadable PDF links.

    Returns only essential fields: title, abstract, year, authors (list of names), pdfUrl.
    """
    # --- 1. Get JSON Payload ---
    if not request.is_json:
        app.logger.warning("Request received without JSON payload.")
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    query = data.get('query')
    limit = data.get('limit', 10) # Default limit to 10 if not provided in JSON body

    if not query:
        app.logger.warning("Missing 'query' in request JSON data.")
        return jsonify({"error": "Missing 'query' in request data"}), 400

    if not isinstance(limit, int) or limit <= 0:
        app.logger.warning(f"Invalid 'limit' value in JSON: {limit}")
        return jsonify({"error": "'limit' must be a positive integer"}), 400

    # --- 2. Get Optional Query Parameter ---
    # Check request.args for URL parameters like ?require_pdf=true
    require_pdf_filter = request.args.get('require_pdf', 'false').lower() == 'true'
    app.logger.info(f"Search request: query='{query}', limit={limit}, require_pdf={require_pdf_filter}")

    # --- 3. Call Semantic API ---
    try:
        # This still fetches full data initially, including fields needed for filtering
        papers = search_papers(query, limit=limit * 2 if require_pdf_filter else limit) # Fetch more if filtering
        # Fetching more initially (e.g., limit*2) increases the chance
        # of getting 'limit' papers *after* filtering for PDFs. Adjust multiplier as needed.

    except Exception as e:
        # Catch potential errors within search_papers if not handled internally
        app.logger.error(f"An unexpected error occurred calling search_papers: {e}", exc_info=True)
        return jsonify({"error": "An internal server error occurred during search API call"}), 500

    # --- 4. Handle API Call Failure ---
    if papers is None:
        app.logger.error(f"Failed to retrieve papers for query '{query}' from external API after retries.")
        return jsonify({"error": "Failed to retrieve papers from external API after multiple attempts. Please try again later."}), 503

    # --- 5. Filter and Process Results ---
    processed_results = []
    papers_added = 0
    for paper in papers:
        pdf_url = paper.get('pdfUrl') # Extracted in semantic_api.py

        # Apply PDF filter if requested
        if require_pdf_filter and not pdf_url:
            continue # Skip this paper if PDF is required but not available

        # Extract only essential fields
        try:
            # Process author list: Extract names, filter out missing names
            authors_list = paper.get('authors', [])
            author_names = [
                author.get('name') for author in authors_list if author and author.get('name')
            ] if isinstance(authors_list, list) else [] # Handle if 'authors' isn't a list

            essential_data = {
                "title": paper.get('title'),
                "abstract": paper.get('abstract'),
                "year": paper.get('year'),
                "authors": author_names, # Return list of names
                "pdfUrl": pdf_url
            }
            processed_results.append(essential_data)
            papers_added += 1

            # Stop adding papers if we reach the original requested limit *after* filtering
            if papers_added >= limit:
                break

        except Exception as e:
            # Log if processing a specific paper fails, but continue with others
            paper_id = paper.get('paperId', 'N/A')
            app.logger.error(f"Error processing paper {paper_id} for essential fields: {e}", exc_info=True)
            continue # Skip faulty paper data

    # --- 6. Return Processed Results ---
    app.logger.info(f"Returning {len(processed_results)} papers after processing/filtering for query '{query}'.")
    return jsonify(processed_results)


if __name__ == '__main__':
    # Use debug=True for development auto-reloading and detailed errors
    # For production, use a proper WSGI server (Gunicorn, Waitress) and set debug=False
    # Host 0.0.0.0 makes it accessible on your network, not just localhost
    app.logger.info("Starting Flask development server...")
    app.run(debug=True, host='0.0.0.0', port=5000)
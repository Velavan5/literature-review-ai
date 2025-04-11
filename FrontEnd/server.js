// server.js
const express = require("express");
const path = require("path");
const axios = require("axios");
const multer = require("multer"); // For handling file uploads
const FormData = require("form-data"); // For forwarding files to Flask
const fs = require("fs"); // File system module (optional, for potential temp storage if needed)
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration for Flask API connection
const FLASK_BASE_URL = process.env.FLASK_BASE_URL || "http://localhost:5000";
const FLASK_SEARCH_ENDPOINT = "/search";
const FLASK_PROCESS_FILE_ENDPOINT = "/process-and-generate"; // Endpoint for file processing
const FLASK_PROCESS_URL_ENDPOINT = "/process-url-and-generate"; // Endpoint for URL processing

// --- Middleware ---
// For parsing JSON bodies (needed for /search and /generate-review-url)
app.use(express.json());
// For parsing URL-encoded bodies (might not be strictly needed now, but good practice)
app.use(express.urlencoded({ extended: true }));

// Multer configuration: Store file in memory buffer
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // Example: Limit file size to 50MB
});

// --- Routes ---

// Serve the frontend UI
app.get("/", (req, res) => {
  const requestTimestamp = new Date().toISOString();
  console.log(`[${requestTimestamp}] GET / - Serving UI`);
  // Assuming ui.html is in a 'views' subdirectory
  // Adjust the path if your ui.html is elsewhere
  const uiPath = path.join(__dirname, "views", "ui.html");
  if (!fs.existsSync(uiPath)) {
    console.error(
      `[${requestTimestamp}] GET / - Error: ui.html not found at ${uiPath}`
    );
    return res.status(404).send("UI file not found.");
  }
  res.sendFile(uiPath);
});

// Handle paper search requests from frontend -> forward to Flask /search
app.post("/search", async (req, res) => {
  const { query, limit, requirePdf } = req.body; // requirePdf received from UI
  const requestTimestamp = new Date().toISOString();
  console.log(
    `[${requestTimestamp}] POST /search - Received query: "${query}", limit: ${
      limit || "default"
    }, requirePdf: ${requirePdf}`
  );

  if (!query) {
    /* ... (validation as before) ... */
    console.log(`[${requestTimestamp}] POST /search - Error: Query missing`);
    return res.status(400).json({ error: "Query parameter is required." });
  }
  const validatedLimit = parseInt(limit, 10) || 15;
  if (validatedLimit <= 0 || validatedLimit > 100) {
    /* ... (validation as before) ... */
    console.log(
      `[${requestTimestamp}] POST /search - Error: Invalid limit ${limit}`
    );
    return res.status(400).json({ error: "Limit must be between 1 and 100." });
  }

  try {
    // Construct Flask URL, adding query param if needed
    let targetUrl = FLASK_BASE_URL + FLASK_SEARCH_ENDPOINT;
    if (requirePdf === true) {
      targetUrl += "?require_pdf=true";
      console.log(
        `[${requestTimestamp}] POST /search - Appending ?require_pdf=true`
      );
    }
    console.log(
      `[${requestTimestamp}] POST /search - Forwarding to Flask: ${targetUrl}`
    );

    // Forward POST request with JSON body (query, limit) to Flask
    const flaskResponse = await axios.post(
      targetUrl,
      { query: query, limit: validatedLimit },
      { timeout: 45000 }
    );

    console.log(
      `[${requestTimestamp}] POST /search - Flask response status: ${flaskResponse.status}`
    );
    res.status(flaskResponse.status).json(flaskResponse.data);
  } catch (error) {
    // Standard error handling for Flask call (same as before)
    console.error(
      `[${requestTimestamp}] POST /search - Error during Flask call:`,
      error.message
    );
    if (error.response) {
      res
        .status(error.response.status)
        .json({
          error:
            error.response.data?.error ||
            `Flask API error (${error.response.status})`,
        });
    } else if (error.request) {
      res
        .status(502)
        .json({ error: "Could not connect to the search service." });
    } else if (error.code === "ECONNABORTED") {
      res
        .status(504)
        .json({ error: "The request to the search service timed out." });
    } else {
      res.status(500).json({ error: "An internal server error occurred." });
    }
  }
});

// --- Review Generation Routes ---

// **EXISTING/REFINED**: Handle review generation from FILE UPLOAD
// Uses multer middleware 'upload.single' to get the file named 'pdfFile'
app.post("/generate-review", upload.single("pdfFile"), async (req, res) => {
  const requestTimestamp = new Date().toISOString();
  console.log(
    `[${requestTimestamp}] POST /generate-review - Received request.`
  );

  if (!req.file) {
    console.log(
      `[${requestTimestamp}] POST /generate-review - Error: No file uploaded.`
    );
    return res.status(400).json({ error: "No PDF file uploaded." });
  }

  // Basic check for PDF mime type (more robust than just filename extension)
  if (req.file.mimetype !== "application/pdf") {
    console.log(
      `[${requestTimestamp}] POST /generate-review - Error: Uploaded file is not a PDF (${req.file.mimetype}).`
    );
    return res
      .status(400)
      .json({
        error: `Invalid file type: ${req.file.mimetype}. Please upload a PDF.`,
      });
  }

  console.log(
    `[${requestTimestamp}] POST /generate-review - Received file: ${req.file.originalname}, Size: ${req.file.size} bytes`
  );

  try {
    // --- Forward file to Flask using form-data ---
    const form = new FormData();
    // Append the file buffer from memory storage
    form.append(
      "pdfFile", // This key MUST match what Flask expects in request.files
      req.file.buffer,
      {
        filename: req.file.originalname, // Pass original filename
        contentType: req.file.mimetype, // Pass original mime type
      }
    );

    const flaskProcessUrl = FLASK_BASE_URL + FLASK_PROCESS_FILE_ENDPOINT;
    console.log(
      `[${requestTimestamp}] POST /generate-review - Forwarding file to Flask: ${flaskProcessUrl}`
    );

    const flaskResponse = await axios.post(flaskProcessUrl, form, {
      headers: {
        ...form.getHeaders(), // Essential for multipart/form-data
      },
      timeout: 180000, // Long timeout (3 minutes) for processing + LLM call
    });

    console.log(
      `[${requestTimestamp}] POST /generate-review - Flask response status: ${flaskResponse.status}`
    );
    res.status(flaskResponse.status).json(flaskResponse.data); // Send Flask's response (e.g., { "review": "..." }) back to UI
  } catch (error) {
    // --- Reusable Error Handling Logic ---
    handleFlaskError(error, res, requestTimestamp, "/generate-review");
  }
});

// **NEW**: Handle review generation from PDF URL
app.post("/generate-review-url", async (req, res) => {
  const requestTimestamp = new Date().toISOString();
  console.log(
    `[${requestTimestamp}] POST /generate-review-url - Received request.`
  );

  const { pdfUrl } = req.body;

  // Basic validation
  if (!pdfUrl || typeof pdfUrl !== "string") {
    console.log(
      `[${requestTimestamp}] POST /generate-review-url - Error: Missing or invalid pdfUrl.`
    );
    return res
      .status(400)
      .json({ error: "Missing or invalid pdfUrl in request body." });
  }
  // Optional: Add more robust URL validation if needed
  try {
    new URL(pdfUrl); // Simple check if it parses as a URL
  } catch (_) {
    console.log(
      `[${requestTimestamp}] POST /generate-review-url - Error: Invalid URL format: ${pdfUrl}`
    );
    return res.status(400).json({ error: "Invalid URL format provided." });
  }

  console.log(
    `[${requestTimestamp}] POST /generate-review-url - Received URL: ${pdfUrl}`
  );

  try {
    // --- Forward URL to Flask ---
    const flaskProcessUrl = FLASK_BASE_URL + FLASK_PROCESS_URL_ENDPOINT;
    console.log(
      `[${requestTimestamp}] POST /generate-review-url - Forwarding URL to Flask: ${flaskProcessUrl}`
    );

    // Send POST request with JSON body containing the URL
    const flaskResponse = await axios.post(
      flaskProcessUrl,
      { pdfUrl: pdfUrl }, // Send as JSON
      {
        headers: { "Content-Type": "application/json" },
        timeout: 180000, // Long timeout (3 minutes)
      }
    );

    console.log(
      `[${requestTimestamp}] POST /generate-review-url - Flask response status: ${flaskResponse.status}`
    );
    res.status(flaskResponse.status).json(flaskResponse.data); // Send Flask's response back to UI
  } catch (error) {
    // --- Reusable Error Handling Logic ---
    handleFlaskError(error, res, requestTimestamp, "/generate-review-url");
  }
});

// --- Reusable Error Handler for Axios calls to Flask ---
function handleFlaskError(error, res, timestamp, routeName) {
  console.error(
    `[${timestamp}] POST ${routeName} - Error during Flask call:`,
    error.message
  );
  if (error.response) {
    // Error response received from Flask
    console.error(
      `[${timestamp}] POST ${routeName} - Flask Error Status:`,
      error.response.status
    );
    console.error(
      `[${timestamp}] POST ${routeName} - Flask Error Data:`,
      JSON.stringify(error.response.data)
    ); // Log full data
    res
      .status(error.response.status)
      .json({
        error:
          error.response.data?.error ||
          `Flask processing/generation error (${error.response.status})`,
      });
  } else if (error.request) {
    // No response received (network issue, Flask down)
    console.error(
      `[${timestamp}] POST ${routeName} - No response received from Flask.`
    );
    res
      .status(502)
      .json({ error: "Could not connect to the backend processing service." }); // Bad Gateway
  } else if (error.code === "ECONNABORTED") {
    // Request timed out
    console.error(
      `[${timestamp}] POST ${routeName} - Request to Flask timed out.`
    );
    res
      .status(504)
      .json({
        error: "The request to the backend processing service timed out.",
      }); // Gateway Timeout
  } else {
    // Other errors (e.g., setup issues)
    console.error(
      `[${timestamp}] POST ${routeName} - Axios setup or other error:`,
      error.message
    );
    res
      .status(500)
      .json({
        error:
          "An internal server error occurred while communicating with the backend service.",
      });
  }
}

// --- Start Server ---
app.listen(PORT, () => {
  const startTimestamp = new Date().toISOString();
  console.log(`[${startTimestamp}] Express server started successfully.`);
  console.log(
    `[${startTimestamp}] Flask API Base URL configured as: ${FLASK_BASE_URL}`
  );
  console.log(
    `[${startTimestamp}] Frontend accessible at http://localhost:${PORT}`
  );
});